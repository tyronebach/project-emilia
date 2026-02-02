"""
Seed data for database initialization.
"""
from db.repositories import UserRepository, AgentRepository


def seed_data():
    """Seed initial data."""
    # Users
    if not UserRepository.get_by_id("thai"):
        UserRepository.create("thai", "Thai", '{"tts_enabled": true, "theme": "dark"}')
    if not UserRepository.get_by_id("emily"):
        UserRepository.create("emily", "Emily", '{"tts_enabled": true, "theme": "dark"}')

    # Agents
    if not AgentRepository.get_by_id("emilia-thai"):
        AgentRepository.create(
            "emilia-thai",
            "Emilia",
            "emilia-thai",
            "emilia.vrm",
            "gNLojYp5VOiuqC8CTCmi"
        )
    if not AgentRepository.get_by_id("emilia-emily"):
        AgentRepository.create(
            "emilia-emily",
            "Emilia",
            "emilia-emily",
            "emilia.vrm",
            "bIHQ61Q7WgbyZAL7IWj"
        )
    if not AgentRepository.get_by_id("rem"):
        AgentRepository.create(
            "rem",
            "Rem",
            "rem",
            "emilia.vrm",
            "gNLojYp5VOiuqC8CTCmi"
        )

    # User-Agent access
    UserRepository.add_agent_access("thai", "emilia-thai")
    UserRepository.add_agent_access("thai", "rem")
    UserRepository.add_agent_access("emily", "emilia-emily")
