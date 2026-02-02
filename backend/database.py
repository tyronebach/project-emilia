"""
SQLite database for Emilia webapp
Single source of truth for users, agents, and sessions
"""

import sqlite3
import uuid
import time
from pathlib import Path
from typing import Any, Optional
from contextlib import contextmanager

DB_PATH = Path("/data/emilia.db")


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """Convert sqlite rows to dicts"""
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@contextmanager
def get_db():
    """Get database connection with dict factory"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Initialize database schema"""
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
        
        # Indexes for common queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_user ON session_participants(user_id)")
        
        conn.commit()


# ============ USER FUNCTIONS ============

def get_users() -> list[dict]:
    """Get all users"""
    with get_db() as conn:
        return conn.execute("SELECT * FROM users ORDER BY display_name").fetchall()


def get_user(user_id: str) -> Optional[dict]:
    """Get user by id"""
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def create_user(user_id: str, display_name: str, preferences: str = "{}") -> dict:
    """Create a new user"""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, display_name, preferences) VALUES (?, ?, ?)",
            (user_id, display_name, preferences)
        )
        return get_user(user_id)


# ============ AGENT FUNCTIONS ============

def get_agents() -> list[dict]:
    """Get all agents"""
    with get_db() as conn:
        return conn.execute("SELECT * FROM agents ORDER BY display_name").fetchall()


def get_agent(agent_id: str) -> Optional[dict]:
    """Get agent by id"""
    with get_db() as conn:
        return conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()


def create_agent(
    agent_id: str,
    display_name: str,
    clawdbot_agent_id: str,
    vrm_model: str = "emilia.vrm",
    voice_id: str = None
) -> dict:
    """Create a new agent"""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO agents (id, display_name, clawdbot_agent_id, vrm_model, voice_id) VALUES (?, ?, ?, ?, ?)",
            (agent_id, display_name, clawdbot_agent_id, vrm_model, voice_id)
        )
        return get_agent(agent_id)


def get_user_agents(user_id: str) -> list[dict]:
    """Get all agents accessible to a user"""
    with get_db() as conn:
        return conn.execute("""
            SELECT a.* FROM agents a
            JOIN user_agents ua ON a.id = ua.agent_id
            WHERE ua.user_id = ?
            ORDER BY a.display_name
        """, (user_id,)).fetchall()


def add_user_agent_access(user_id: str, agent_id: str):
    """Grant user access to an agent"""
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO user_agents (user_id, agent_id) VALUES (?, ?)",
            (user_id, agent_id)
        )


def get_agent_owners(agent_id: str) -> list[dict]:
    """Get all users who have access to an agent"""
    with get_db() as conn:
        return conn.execute("""
            SELECT u.* FROM users u
            JOIN user_agents ua ON u.id = ua.user_id
            WHERE ua.agent_id = ?
        """, (agent_id,)).fetchall()


# ============ SESSION FUNCTIONS ============

def generate_session_id() -> str:
    """Generate a UUID for session"""
    return str(uuid.uuid4())


def get_session(session_id: str) -> Optional[dict]:
    """Get session by id with participants"""
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if session:
            participants = conn.execute(
                "SELECT user_id FROM session_participants WHERE session_id = ?",
                (session_id,)
            ).fetchall()
            session["participants"] = [p["user_id"] for p in participants]
        return session


def get_user_sessions(user_id: str, agent_id: str = None) -> list[dict]:
    """Get all sessions for a user, optionally filtered by agent, sorted by last_used desc"""
    with get_db() as conn:
        if agent_id:
            sessions = conn.execute("""
                SELECT s.* FROM sessions s
                JOIN session_participants sp ON s.id = sp.session_id
                WHERE sp.user_id = ? AND s.agent_id = ?
                ORDER BY s.last_used DESC
            """, (user_id, agent_id)).fetchall()
        else:
            sessions = conn.execute("""
                SELECT s.* FROM sessions s
                JOIN session_participants sp ON s.id = sp.session_id
                WHERE sp.user_id = ?
                ORDER BY s.last_used DESC
            """, (user_id,)).fetchall()
        
        # Add participants to each session
        for session in sessions:
            participants = conn.execute(
                "SELECT user_id FROM session_participants WHERE session_id = ?",
                (session["id"],)
            ).fetchall()
            session["participants"] = [p["user_id"] for p in participants]
        
        return sessions


def create_session(agent_id: str, user_id: str, name: str = None) -> dict:
    """Create a new session"""
    session_id = generate_session_id()
    now = int(time.time())
    
    with get_db() as conn:
        # Create session
        conn.execute(
            "INSERT INTO sessions (id, agent_id, name, created_at, last_used) VALUES (?, ?, ?, ?, ?)",
            (session_id, agent_id, name, now, now)
        )
        
        # Add creator as participant
        conn.execute(
            "INSERT INTO session_participants (session_id, user_id) VALUES (?, ?)",
            (session_id, user_id)
        )
    
    return get_session(session_id)


def get_or_create_default_session(user_id: str, agent_id: str) -> dict:
    """Get user's most recent session for agent, or create one"""
    sessions = get_user_sessions(user_id, agent_id)
    if sessions:
        return sessions[0]  # Most recent
    return create_session(agent_id, user_id, name="Default")


def update_session_last_used(session_id: str):
    """Update session last_used timestamp"""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET last_used = ? WHERE id = ?",
            (int(time.time()), session_id)
        )


def increment_session_message_count(session_id: str):
    """Increment session message count"""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
            (session_id,)
        )


def update_session(session_id: str, name: str = None) -> Optional[dict]:
    """Update session name"""
    with get_db() as conn:
        if name is not None:
            conn.execute("UPDATE sessions SET name = ? WHERE id = ?", (name, session_id))
    return get_session(session_id)


def delete_session(session_id: str) -> bool:
    """Delete a session"""
    with get_db() as conn:
        conn.execute("DELETE FROM session_participants WHERE session_id = ?", (session_id,))
        result = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return result.rowcount > 0


def add_session_participant(session_id: str, user_id: str):
    """Add a participant to a session"""
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO session_participants (session_id, user_id) VALUES (?, ?)",
            (session_id, user_id)
        )


def user_can_access_session(user_id: str, session_id: str) -> bool:
    """Check if user is a participant in session"""
    with get_db() as conn:
        result = conn.execute(
            "SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?",
            (session_id, user_id)
        ).fetchone()
        return result is not None


def user_can_access_agent(user_id: str, agent_id: str) -> bool:
    """Check if user has access to agent"""
    with get_db() as conn:
        result = conn.execute(
            "SELECT 1 FROM user_agents WHERE user_id = ? AND agent_id = ?",
            (user_id, agent_id)
        ).fetchone()
        return result is not None


# ============ SEED DATA ============

def seed_data():
    """Seed initial data"""
    # Users
    if not get_user("thai"):
        create_user("thai", "Thai", '{"tts_enabled": true, "theme": "dark"}')
    if not get_user("emily"):
        create_user("emily", "Emily", '{"tts_enabled": true, "theme": "dark"}')
    
    # Agents
    if not get_agent("emilia-thai"):
        create_agent(
            "emilia-thai",
            "Emilia",
            "emilia-thai",
            "emilia.vrm",
            "gNLojYp5VOiuqC8CTCmi"
        )
    if not get_agent("emilia-emily"):
        create_agent(
            "emilia-emily", 
            "Emilia",
            "emilia-emily",
            "emilia.vrm",
            "bIHQ61Q7WgbyZAL7IWj"
        )
    if not get_agent("rem"):
        create_agent(
            "rem",
            "Rem",
            "rem",
            "emilia.vrm",
            "gNLojYp5VOiuqC8CTCmi"
        )
    
    # User-Agent access
    add_user_agent_access("thai", "emilia-thai")
    add_user_agent_access("thai", "rem")
    add_user_agent_access("emily", "emilia-emily")


# Initialize on import
if DB_PATH.parent.exists():
    init_db()
    seed_data()
