"""
Database connection and initialization.
"""
import os
import json
import sqlite3
import time
from pathlib import Path
from contextlib import contextmanager

DEFAULT_DB_PATH = Path(os.getenv("EMILIA_DB_PATH", "/data/emilia.db"))
DB_PATH = DEFAULT_DB_PATH

try:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
except Exception:
    fallback = Path(
        os.getenv(
            "EMILIA_DB_PATH_FALLBACK",
            str(Path(__file__).resolve().parents[2] / "data" / "emilia.db")
        )
    )
    DB_PATH = fallback
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """Convert sqlite rows to dicts."""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@contextmanager
def get_db():
    """Get database connection with dict factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _add_column(cur, table: str, column: str, col_type: str):
    """Add a column if it doesn't already exist (idempotent migration)."""
    cols = {row["name"] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


def _rename_column(cur, table: str, old_name: str, new_name: str):
    """Rename a column if the old name still exists (idempotent migration)."""
    cols = {row["name"] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}
    if old_name in cols and new_name not in cols:
        cur.execute(f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}")


def init_db():
    """Initialize database schema."""
    with get_db() as conn:
        cur = conn.cursor()

        # Users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                preferences TEXT DEFAULT '{}',
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        # Agents table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                clawdbot_agent_id TEXT,
                vrm_model TEXT DEFAULT 'emilia.vrm',
                voice_id TEXT,
                workspace TEXT,
                provider TEXT NOT NULL DEFAULT 'native',
                provider_config TEXT DEFAULT '{}',
                persona_source TEXT DEFAULT 'db',
                persona_text TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        # Global app settings (JSON values)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)

        # User-Agent access (many-to-many)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_agents (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, agent_id)
            )
        """)

        # Rooms table (DM + group chats — canonical chat container)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                last_activity INTEGER DEFAULT (strftime('%s', 'now')),
                message_count INTEGER DEFAULT 0,
                room_type TEXT DEFAULT 'group',
                settings TEXT DEFAULT '{}',
                summary TEXT,
                summary_updated_at INTEGER,
                compaction_count INTEGER DEFAULT 0
            )
        """)

        # Room participants (many-to-many for users)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS room_participants (
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at INTEGER DEFAULT (strftime('%s', 'now')),
                role TEXT DEFAULT 'member',
                PRIMARY KEY (room_id, user_id)
            )
        """)

        # Room agents (many-to-many for agents)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS room_agents (
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                added_at INTEGER DEFAULT (strftime('%s', 'now')),
                added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
                role TEXT DEFAULT 'participant',
                response_mode TEXT DEFAULT 'mention',
                PRIMARY KEY (room_id, agent_id)
            )
        """)

        # Room messages (separate from session messages)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS room_messages (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent')),
                sender_id TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp REAL NOT NULL,
                origin TEXT DEFAULT 'chat',
                model TEXT,
                processing_ms INTEGER,
                usage_prompt_tokens INTEGER,
                usage_completion_tokens INTEGER,
                behavior_intent TEXT,
                behavior_mood TEXT,
                behavior_mood_intensity REAL,
                behavior_energy TEXT,
                behavior_move TEXT,
                behavior_game_action TEXT
            )
        """)

        # TTS cache
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tts_cache (
                key TEXT PRIMARY KEY,
                voice_id TEXT,
                model_id TEXT,
                voice_settings TEXT,
                text TEXT,
                audio_base64 TEXT,
                alignment_json TEXT,
                duration_estimate REAL,
                audio_bytes INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                last_used INTEGER DEFAULT (strftime('%s', 'now')),
                hits INTEGER DEFAULT 0
            )
        """)

        # Game statistics
        cur.execute("""
            CREATE TABLE IF NOT EXISTS game_stats (
                id TEXT PRIMARY KEY,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                game_id TEXT NOT NULL,
                result TEXT NOT NULL,
                moves INTEGER,
                duration_seconds INTEGER,
                played_at REAL NOT NULL
            )
        """)

        # Game registry (global game catalog / metadata)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS game_registry (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                module_key TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                move_provider_default TEXT NOT NULL DEFAULT 'llm',
                rule_mode TEXT NOT NULL DEFAULT 'strict',
                prompt_instructions TEXT,
                version TEXT NOT NULL DEFAULT '1',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        # Agent-specific game overrides (enable/disable + runtime tuning)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS agent_game_config (
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                game_id TEXT NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
                enabled INTEGER NOT NULL DEFAULT 1,
                mode TEXT DEFAULT NULL,
                difficulty REAL DEFAULT NULL,
                prompt_override TEXT DEFAULT NULL,
                workspace_required INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (agent_id, game_id)
            )
        """)

        # Emotional state (one per user-agent pair)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS emotional_state (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                valence REAL DEFAULT 0.0,
                arousal REAL DEFAULT 0.0,
                dominance REAL DEFAULT 0.0,
                trust REAL DEFAULT 0.5,
                attachment REAL DEFAULT 0.3,
                familiarity REAL DEFAULT 0.0,
                last_updated REAL NOT NULL,
                last_interaction REAL,
                interaction_count INTEGER DEFAULT 0,
                UNIQUE(user_id, agent_id)
            )
        """)

        # Emotional events V2 (for learning + relationship tracking)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS emotional_events_v2 (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                session_id TEXT,
                timestamp REAL NOT NULL,
                message_snippet TEXT,
                triggers_json TEXT,
                valence_before REAL,
                valence_after REAL,
                arousal_before REAL,
                arousal_after REAL,
                dominant_mood_before TEXT,
                dominant_mood_after TEXT,
                agent_mood_tag TEXT,
                agent_intent_tag TEXT,
                inferred_outcome TEXT CHECK(inferred_outcome IN ('positive', 'negative', 'neutral')),
                trust_delta REAL,
                intimacy_delta REAL,
                calibration_updates_json TEXT
            )
        """)

        # Trigger counts — novelty tracking cache
        cur.execute("""
            CREATE TABLE IF NOT EXISTS trigger_counts (
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                window TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                last_seen REAL,
                PRIMARY KEY (user_id, agent_id, trigger_type, window)
            )
        """)

        # Drift archetypes (global replay datasets for Drift Simulator V2)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS drift_archetypes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                message_triggers TEXT NOT NULL,
                outcome_weights TEXT DEFAULT '{}',
                sample_count INTEGER DEFAULT 0,
                source_filename TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        _add_column(cur, "rooms", "summary_style", "TEXT")
        _add_column(cur, "rooms", "summary_version", "INTEGER NOT NULL DEFAULT 1")

        # Mood weights (JSON dict of mood->weight)
        _add_column(cur, "emotional_state", "mood_weights_json", "TEXT DEFAULT '{}'")
        # Backfill NULL mood_weights_json to empty dict
        cur.execute("UPDATE emotional_state SET mood_weights_json = '{}' WHERE mood_weights_json IS NULL")

        # Async trigger batching (LLM classification runs every N messages)
        _add_column(cur, "emotional_state", "trigger_buffer", "TEXT")  # JSON array of recent messages
        _add_column(cur, "emotional_state", "pending_triggers", "TEXT")  # JSON array of LLM-detected triggers

        # Emotion Engine V2: relationship dimensions + trigger calibration
        _add_column(cur, "emotional_state", "intimacy", "REAL DEFAULT 0.2")
        _add_column(cur, "emotional_state", "playfulness_safety", "REAL DEFAULT 0.5")
        _add_column(cur, "emotional_state", "conflict_tolerance", "REAL DEFAULT 0.7")
        _add_column(cur, "emotional_state", "trigger_calibration_json", "TEXT DEFAULT '{}'")
        _add_column(cur, "emotional_state", "session_id", "TEXT")

        # Agent emotional baseline columns (safe to re-run)
        _add_column(cur, "agents", "baseline_valence", "REAL DEFAULT 0.2")
        _add_column(cur, "agents", "baseline_arousal", "REAL DEFAULT 0.0")
        _add_column(cur, "agents", "baseline_dominance", "REAL DEFAULT 0.0")
        _add_column(cur, "agents", "emotional_volatility", "REAL DEFAULT 0.5")
        _add_column(cur, "agents", "emotional_recovery", "REAL DEFAULT 0.1")
        _add_column(cur, "agents", "emotional_profile", "TEXT")
        _add_column(cur, "agents", "chat_mode", "TEXT DEFAULT 'openclaw'")
        _add_column(cur, "agents", "direct_model", "TEXT")
        _add_column(cur, "agents", "direct_api_base", "TEXT")
        _add_column(cur, "agents", "provider", "TEXT NOT NULL DEFAULT 'native'")
        _add_column(cur, "agents", "provider_config", "TEXT DEFAULT '{}'")
        _add_column(cur, "agents", "persona_source", "TEXT DEFAULT 'db'")
        _add_column(cur, "agents", "persona_text", "TEXT")

        # Keep agent mode values in supported set.
        cur.execute(
            """UPDATE agents
               SET chat_mode = 'openclaw'
               WHERE chat_mode IS NULL
                  OR TRIM(chat_mode) = ''
                  OR LOWER(chat_mode) NOT IN ('openclaw', 'direct')"""
        )

        # Normalize provider values to supported set.
        cur.execute(
            """UPDATE agents
               SET provider = 'native'
               WHERE provider IS NULL
                  OR TRIM(provider) = ''
                  OR LOWER(provider) NOT IN ('native', 'openclaw')"""
        )

        # Mood definitions
        cur.execute("""
            CREATE TABLE IF NOT EXISTS moods (
                id TEXT PRIMARY KEY,
                description TEXT DEFAULT '',
                valence REAL NOT NULL,
                arousal REAL NOT NULL,
                emoji TEXT DEFAULT '',
                category TEXT DEFAULT 'neutral',
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        # Relationship type definitions
        cur.execute("""
            CREATE TABLE IF NOT EXISTS relationship_types (
                id TEXT PRIMARY KEY,
                description TEXT DEFAULT '',
                modifiers TEXT DEFAULT '{}',
                behaviors TEXT DEFAULT '{}',
                response_modifiers TEXT DEFAULT '{}',
                trigger_mood_map TEXT DEFAULT '{}',
                example_responses TEXT DEFAULT '{}',
                extra TEXT DEFAULT '{}',
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        """)

        # Migration: agents.clawdbot_agent_id was NOT NULL in old schema.
        # Recreate the table with it nullable and preserve newer provider/persona fields.
        agents_info = {row["name"]: row for row in cur.execute("PRAGMA table_info(agents)").fetchall()}
        clawdbot_col = agents_info.get("clawdbot_agent_id")
        if clawdbot_col and clawdbot_col["notnull"]:
            cur.execute("ALTER TABLE agents RENAME TO agents_old")
            cur.execute("""
                CREATE TABLE agents (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    clawdbot_agent_id TEXT,
                    vrm_model TEXT DEFAULT 'emilia.vrm',
                    voice_id TEXT,
                    workspace TEXT,
                    provider TEXT NOT NULL DEFAULT 'native',
                    provider_config TEXT DEFAULT '{}',
                    persona_source TEXT DEFAULT 'db',
                    persona_text TEXT,
                    baseline_valence REAL DEFAULT 0.2,
                    baseline_arousal REAL DEFAULT 0.0,
                    baseline_dominance REAL DEFAULT 0.0,
                    emotional_volatility REAL DEFAULT 0.5,
                    emotional_recovery REAL DEFAULT 0.1,
                    emotional_profile TEXT,
                    chat_mode TEXT DEFAULT 'openclaw',
                    direct_model TEXT,
                    direct_api_base TEXT,
                    created_at INTEGER DEFAULT (strftime('%s', 'now'))
                )
            """)
            old_cols = set(agents_info.keys())
            new_cols = {
                "id", "display_name", "clawdbot_agent_id", "vrm_model", "voice_id",
                "workspace", "baseline_valence", "baseline_arousal", "baseline_dominance",
                "emotional_volatility", "emotional_recovery", "emotional_profile",
                "chat_mode", "direct_model", "direct_api_base", "provider",
                "provider_config", "persona_source", "persona_text", "created_at",
            }
            copy_cols = ", ".join(old_cols & new_cols)
            cur.execute(f"INSERT INTO agents ({copy_cols}) SELECT {copy_cols} FROM agents_old")
            cur.execute("DROP TABLE agents_old")

        # Memory documents: agent-scoped document store for internal memory engine.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS memory_documents (
                id TEXT PRIMARY KEY,
                agent_id TEXT,
                user_id TEXT,
                path TEXT,
                content_hash TEXT,
                created_at REAL,
                updated_at REAL
            )
        """)

        # Memory chunks: sub-document text segments for semantic retrieval.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS memory_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT REFERENCES memory_documents(id) ON DELETE CASCADE,
                agent_id TEXT,
                user_id TEXT,
                chunk_index INTEGER DEFAULT 0,
                content TEXT,
                embedding BLOB,
                fts_tokens TEXT,
                start_char INTEGER,
                end_char INTEGER,
                text TEXT,
                created_at REAL
            )
        """)
        _add_column(cur, "memory_chunks", "chunk_index", "INTEGER DEFAULT 0")
        _add_column(cur, "memory_chunks", "content", "TEXT")
        _add_column(cur, "memory_chunks", "embedding", "BLOB")
        _add_column(cur, "memory_chunks", "fts_tokens", "TEXT")
        cur.execute("UPDATE memory_chunks SET content = COALESCE(content, text) WHERE content IS NULL")
        cur.execute("UPDATE memory_chunks SET fts_tokens = COALESCE(fts_tokens, content, text) WHERE fts_tokens IS NULL")

        cur.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts
            USING fts5(content, fts_tokens, content='memory_chunks', content_rowid='rowid')
        """)
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
                INSERT INTO memory_chunks_fts(rowid, content, fts_tokens)
                VALUES (new.rowid, COALESCE(new.content, ''), COALESCE(new.fts_tokens, new.content, ''));
            END
        """)
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
                INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content, fts_tokens)
                VALUES ('delete', old.rowid, COALESCE(old.content, ''), COALESCE(old.fts_tokens, old.content, ''));
            END
        """)
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS memory_chunks_au AFTER UPDATE ON memory_chunks BEGIN
                INSERT INTO memory_chunks_fts(memory_chunks_fts, rowid, content, fts_tokens)
                VALUES ('delete', old.rowid, COALESCE(old.content, ''), COALESCE(old.fts_tokens, old.content, ''));
                INSERT INTO memory_chunks_fts(rowid, content, fts_tokens)
                VALUES (new.rowid, COALESCE(new.content, ''), COALESCE(new.fts_tokens, new.content, ''));
            END
        """)
        fts_count = cur.execute("SELECT COUNT(*) AS count FROM memory_chunks_fts").fetchone()["count"]
        if int(fts_count or 0) == 0:
            cur.execute("INSERT INTO memory_chunks_fts(memory_chunks_fts) VALUES ('rebuild')")

        # Dream log: audit trail for dream reflection runs.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dream_log (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                triggered_by TEXT,
                prompt_used TEXT,
                output_json TEXT,
                trust_delta REAL DEFAULT 0,
                attachment_delta REAL DEFAULT 0,
                intimacy_delta REAL DEFAULT 0,
                created_at REAL NOT NULL
            )
        """)
        _add_column(cur, "dream_log", "dreamed_at", "TEXT")
        _add_column(cur, "dream_log", "conversation_summary", "TEXT")
        _add_column(cur, "dream_log", "lived_experience_before", "TEXT")
        _add_column(cur, "dream_log", "lived_experience_after", "TEXT")
        _add_column(cur, "dream_log", "relationship_before", "TEXT")
        _add_column(cur, "dream_log", "relationship_after", "TEXT")
        _add_column(cur, "dream_log", "internal_monologue", "TEXT")
        _add_column(cur, "dream_log", "model_used", "TEXT")
        _add_column(cur, "dream_log", "input_context_meta", "TEXT")
        _add_column(cur, "dream_log", "safety_flags", "TEXT")
        cur.execute("UPDATE dream_log SET dreamed_at = COALESCE(dreamed_at, datetime(created_at, 'unixepoch')) WHERE dreamed_at IS NULL")

        # Lived experience: persistent narrative snapshot per user-agent pair.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lived_experience (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                content TEXT,
                updated_at REAL NOT NULL,
                version INTEGER DEFAULT 0,
                UNIQUE(user_id, agent_id)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS character_lived_experience (
                agent_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                lived_experience TEXT NOT NULL DEFAULT '',
                last_dream_at TEXT,
                dream_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (agent_id, user_id)
            )
        """)
        cur.execute("""
            INSERT OR IGNORE INTO character_lived_experience (
                agent_id, user_id, lived_experience, last_dream_at, dream_count
            )
            SELECT agent_id, user_id, COALESCE(content, ''), datetime(updated_at, 'unixepoch'), COALESCE(version, 0)
            FROM lived_experience
        """)

        # Indexes for memory and dream tables.
        cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_docs_agent_user ON memory_documents(agent_id, user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_chunks_doc ON memory_chunks(document_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_chunks_agent_user ON memory_chunks(agent_id, user_id)")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_docs_agent_user_path ON memory_documents(agent_id, user_id, path)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dream_log_user_agent ON dream_log(user_id, agent_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_lived_experience_user_agent ON lived_experience(user_id, agent_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_character_lived_experience_pair ON character_lived_experience(agent_id, user_id)")

        # Migration: game_stats had session_id FK to (removed) sessions table.
        # SQLite can't alter FKs, so drop and recreate if old schema detected.
        gs_cols = {row["name"] for row in cur.execute("PRAGMA table_info(game_stats)").fetchall()}
        if "session_id" in gs_cols:
            cur.execute("DROP TABLE game_stats")
            cur.execute("""
                CREATE TABLE game_stats (
                    id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    game_id TEXT NOT NULL,
                    result TEXT NOT NULL,
                    moves INTEGER,
                    duration_seconds INTEGER,
                    played_at REAL NOT NULL
                )
            """)

        # Indexes for common queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON rooms(created_by)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_room_agents_agent ON room_agents(agent_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, timestamp)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_room_messages_sender ON room_messages(sender_type, sender_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_last_used ON tts_cache(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_created_at ON tts_cache(created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_game_stats_room ON game_stats(room_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_game_stats_user ON game_stats(user_id, agent_id, game_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_game_registry_active ON game_registry(active)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_agent_game_config_agent ON agent_game_config(agent_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_events_v2_user_agent ON emotional_events_v2(user_id, agent_id, timestamp DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_drift_archetypes_updated_at ON drift_archetypes(updated_at DESC)")

        # Baseline game registry seed for rollout compatibility.
        # Keep tic-tac-toe and chess registered for all environments.
        cur.execute(
            """INSERT OR IGNORE INTO game_registry
               (id, display_name, category, description, module_key, active,
                move_provider_default, rule_mode, prompt_instructions, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "tic-tac-toe",
                "Tic-Tac-Toe",
                "board",
                "Classic 3x3 strategy game.",
                "tic-tac-toe",
                1,
                "llm",
                "strict",
                "\n".join([
                    "## Tic-Tac-Toe -- How You Play",
                    "- Think out loud about your strategy: \"If I go here, you might...\"",
                    "- When blocking: notice the threat and comment on it",
                    "- When setting up a fork: be sneaky about it",
                    "- When winning: build up excitement before revealing your move",
                    "- Keep it light -- it's a quick, casual game",
                    "- Positions are numbered 1-9 (top-left to bottom-right)",
                    "- Include your move as [move:N] where N is the position number",
                ]),
                "1",
            ),
        )
        cur.execute(
            """INSERT OR IGNORE INTO game_registry
               (id, display_name, category, description, module_key, active,
                move_provider_default, rule_mode, prompt_instructions, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "chess",
                "Chess",
                "board",
                "Classic 8x8 strategy game with strict legal-move validation.",
                "chess",
                1,
                "engine",
                "strict",
                "\n".join([
                    "## Chess -- How You Play",
                    "- React in character to each move and evaluate the position briefly.",
                    "- Mention tactical ideas when relevant (checks, forks, pins, development).",
                    "- Keep the tone playful and concise; avoid long lectures.",
                    "- The engine chooses your move in strict mode, so narrate confidently.",
                    "- When providing move tags, use UCI format like [move:e2e4].",
                ]),
                "1",
            ),
        )

        # Backfill default configuration rows for existing agents.
        cur.execute(
            """INSERT OR IGNORE INTO agent_game_config (agent_id, game_id, enabled, workspace_required)
               SELECT id, 'tic-tac-toe', 1, 0 FROM agents"""
        )
        cur.execute(
            """INSERT OR IGNORE INTO agent_game_config (agent_id, game_id, enabled, workspace_required)
               SELECT id, 'chess', 1, 0 FROM agents"""
        )

        # Seed global drift archetypes once for V2 replay mode.
        drift_count = conn.execute(
            "SELECT COUNT(*) as count FROM drift_archetypes"
        ).fetchone()["count"]
        if int(drift_count or 0) == 0:
            from services.drift_archetype_seed import get_default_drift_archetypes

            now = int(time.time())
            for archetype in get_default_drift_archetypes():
                conn.execute(
                    """
                    INSERT OR IGNORE INTO drift_archetypes (
                        id, name, description, message_triggers, outcome_weights,
                        sample_count, source_filename, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        archetype["id"],
                        archetype["name"],
                        archetype.get("description", ""),
                        json.dumps(archetype.get("message_triggers", [])),
                        json.dumps(archetype.get("outcome_weights", {})),
                        int(archetype.get("sample_count", 0)),
                        archetype.get("source_filename"),
                        now,
                        now,
                    ),
                )

        conn.commit()


# Initialize on import
init_db()

# Always seed reference/catalog data (moods, relationship types).
from db.seed import seed_moods, seed_relationship_types
seed_moods()
seed_relationship_types()

# Full bootstrap (users, agents, mappings) is opt-in.
if os.getenv("EMILIA_SEED_DATA", "0").lower() not in {"0", "false", "no"}:
    from db.seed import seed_data
    seed_data()
