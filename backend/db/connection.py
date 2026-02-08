"""
Database connection and initialization.
"""
import os
import sqlite3
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
                clawdbot_agent_id TEXT NOT NULL,
                vrm_model TEXT DEFAULT 'emilia.vrm',
                voice_id TEXT,
                workspace TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
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

        # Sessions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                name TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                last_used INTEGER DEFAULT (strftime('%s', 'now')),
                message_count INTEGER DEFAULT 0
            )
        """)

        # Session participants (many-to-many)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS session_participants (
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (session_id, user_id)
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
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                game_id TEXT NOT NULL,
                result TEXT NOT NULL,
                moves INTEGER,
                duration_seconds INTEGER,
                played_at REAL NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
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

        # Emotional events log (for debugging/tuning)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS emotional_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                session_id TEXT,
                timestamp REAL NOT NULL,
                trigger_type TEXT NOT NULL,
                trigger_value TEXT,
                delta_valence REAL,
                delta_arousal REAL,
                delta_dominance REAL,
                delta_trust REAL,
                delta_attachment REAL,
                state_after_json TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
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

        # Messages table (webapp-managed history)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp REAL NOT NULL,
                model TEXT,
                processing_ms INTEGER,
                usage_prompt_tokens INTEGER,
                usage_completion_tokens INTEGER,
                behavior_intent TEXT,
                behavior_mood TEXT,
                behavior_mood_intensity REAL,
                behavior_energy TEXT,
                behavior_move TEXT,
                behavior_game_action TEXT,
                audio_base64 TEXT
            )
        """)

        # Inferred user state columns on emotional_state
        _add_column(cur, "emotional_state", "inferred_user_valence", "REAL DEFAULT 0.0")
        _add_column(cur, "emotional_state", "inferred_user_arousal", "REAL DEFAULT 0.0")

        # Relationship columns on emotional_state
        _add_column(cur, "emotional_state", "relationship_type", "TEXT DEFAULT 'companion'")
        _add_column(cur, "emotional_state", "relationship_config", "TEXT")
        _add_column(cur, "emotional_state", "relationship_started_at", "REAL")

        # Mood weights (JSON dict of mood->weight)
        _add_column(cur, "emotional_state", "mood_weights_json", "TEXT")

        # Agent emotional baseline columns (safe to re-run)
        _add_column(cur, "agents", "baseline_valence", "REAL DEFAULT 0.2")
        _add_column(cur, "agents", "baseline_arousal", "REAL DEFAULT 0.0")
        _add_column(cur, "agents", "baseline_dominance", "REAL DEFAULT 0.0")
        _add_column(cur, "agents", "emotional_volatility", "REAL DEFAULT 0.5")
        _add_column(cur, "agents", "emotional_recovery", "REAL DEFAULT 0.1")
        _add_column(cur, "agents", "emotional_profile", "TEXT")

        # Session compaction columns (Phase 3.1)
        _add_column(cur, "sessions", "summary", "TEXT")
        _add_column(cur, "sessions", "summary_updated_at", "INTEGER")
        _add_column(cur, "sessions", "compaction_count", "INTEGER DEFAULT 0")

        # Indexes for common queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_user ON session_participants(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_last_used ON tts_cache(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_created_at ON tts_cache(created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_game_stats_user ON game_stats(user_id, agent_id, game_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_emotional_events_user ON emotional_events(user_id, agent_id, timestamp)")

        conn.commit()


# Initialize on import
init_db()

# Seed data (skip when disabled, e.g., tests)
if os.getenv("EMILIA_SEED_DATA", "1").lower() not in {"0", "false", "no"}:
    from db.seed import seed_data
    seed_data()
