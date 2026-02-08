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

        # Indexes for common queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_user ON session_participants(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_last_used ON tts_cache(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tts_cache_created_at ON tts_cache(created_at DESC)")

        conn.commit()


# Initialize on import
init_db()

# Seed data (skip when disabled, e.g., tests)
if os.getenv("EMILIA_SEED_DATA", "1").lower() not in {"0", "false", "no"}:
    from db.seed import seed_data
    seed_data()
