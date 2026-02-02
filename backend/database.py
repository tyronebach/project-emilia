"""
Compatibility wrapper for database.py
Maintains backward compatibility while using new repository pattern.
"""
from db.connection import get_db, init_db
from db.repositories import UserRepository, AgentRepository, SessionRepository

# Re-export connection functions
__all__ = [
    "get_db",
    "init_db",
    # User functions
    "get_users",
    "get_user",
    "create_user",
    "get_user_agents",
    "add_user_agent_access",
    "user_can_access_agent",
    # Agent functions
    "get_agents",
    "get_agent",
    "create_agent",
    "update_agent",
    "get_agent_owners",
    # Session functions
    "generate_session_id",
    "get_session",
    "get_user_sessions",
    "create_session",
    "get_or_create_default_session",
    "update_session_last_used",
    "increment_session_message_count",
    "update_session",
    "delete_session",
    "get_all_sessions",
    "delete_sessions_by_agent",
    "add_session_participant",
    "user_can_access_session",
]

# ============ USER FUNCTIONS ============

def get_users():
    """Get all users."""
    return UserRepository.get_all()


def get_user(user_id: str):
    """Get user by id."""
    return UserRepository.get_by_id(user_id)


def create_user(user_id: str, display_name: str, preferences: str = "{}"):
    """Create a new user."""
    return UserRepository.create(user_id, display_name, preferences)


def get_user_agents(user_id: str):
    """Get all agents accessible to a user."""
    return UserRepository.get_agents(user_id)


def add_user_agent_access(user_id: str, agent_id: str):
    """Grant user access to an agent."""
    return UserRepository.add_agent_access(user_id, agent_id)


def user_can_access_agent(user_id: str, agent_id: str) -> bool:
    """Check if user has access to agent."""
    return UserRepository.can_access_agent(user_id, agent_id)


# ============ AGENT FUNCTIONS ============

def get_agents():
    """Get all agents."""
    return AgentRepository.get_all()


def get_agent(agent_id: str):
    """Get agent by id."""
    return AgentRepository.get_by_id(agent_id)


def create_agent(
    agent_id: str,
    display_name: str,
    clawdbot_agent_id: str,
    vrm_model: str = "emilia.vrm",
    voice_id: str = None,
    workspace: str = None
):
    """Create a new agent."""
    return AgentRepository.create(
        agent_id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace
    )


def update_agent(agent_id: str, updates: dict):
    """Update agent fields."""
    return AgentRepository.update(agent_id, updates)


def get_agent_owners(agent_id: str):
    """Get all users who have access to an agent."""
    return AgentRepository.get_owners(agent_id)


# ============ SESSION FUNCTIONS ============

def generate_session_id() -> str:
    """Generate a UUID for session."""
    return SessionRepository._generate_id()


def get_session(session_id: str):
    """Get session by id with participants."""
    return SessionRepository.get_by_id(session_id)


def get_user_sessions(user_id: str, agent_id: str = None):
    """Get all sessions for a user, optionally filtered by agent."""
    return SessionRepository.get_for_user(user_id, agent_id)


def create_session(agent_id: str, user_id: str, name: str = None):
    """Create a new session."""
    return SessionRepository.create(agent_id, user_id, name)


def get_or_create_default_session(user_id: str, agent_id: str):
    """Get user's most recent session for agent, or create one."""
    return SessionRepository.get_or_create_default(user_id, agent_id)


def update_session_last_used(session_id: str):
    """Update session last_used timestamp."""
    return SessionRepository.update_last_used(session_id)


def increment_session_message_count(session_id: str):
    """Increment session message count."""
    return SessionRepository.increment_message_count(session_id)


def update_session(session_id: str, name: str = None):
    """Update session name."""
    return SessionRepository.update(session_id, name)


def delete_session(session_id: str) -> bool:
    """Delete a session."""
    return SessionRepository.delete(session_id)


def get_all_sessions():
    """Get all sessions (admin)."""
    return SessionRepository.get_all()


def delete_sessions_by_agent(agent_id: str) -> int:
    """Delete all sessions for an agent, returns count deleted."""
    return SessionRepository.delete_by_agent(agent_id)


def add_session_participant(session_id: str, user_id: str):
    """Add a participant to a session."""
    return SessionRepository.add_participant(session_id, user_id)


def user_can_access_session(user_id: str, session_id: str) -> bool:
    """Check if user is a participant in session."""
    return SessionRepository.user_can_access(user_id, session_id)
