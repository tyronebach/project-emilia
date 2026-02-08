"""Load agent profiles, relationship configs, and mood configs from JSON files."""
import json
from pathlib import Path
from functools import lru_cache

CONFIGS_DIR = Path(__file__).parent.parent.parent / "configs"

@lru_cache(maxsize=10)
def load_agent_profile(name: str) -> dict:
    """Load agent profile from configs/agents/{name}.json"""
    path = CONFIGS_DIR / "agents" / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

@lru_cache(maxsize=5)
def load_relationship_config(relationship_type: str) -> dict:
    """Load relationship config from configs/relationships/{type}.json"""
    path = CONFIGS_DIR / "relationships" / f"{relationship_type}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

@lru_cache(maxsize=1)
def load_moods_config() -> dict:
    """Load mood definitions from configs/moods.json"""
    path = CONFIGS_DIR / "moods.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

def get_trigger_mood_map(relationship_type: str) -> dict:
    """Get trigger_mood_map for a relationship type.

    Returns the trigger_mood_map dict from the relationship config,
    or an empty dict if the relationship type has no config.
    """
    config = load_relationship_config(relationship_type)
    return config.get("trigger_mood_map", {})

def clear_config_cache():
    """Clear cached configs (useful for hot reload during dev)."""
    load_agent_profile.cache_clear()
    load_relationship_config.cache_clear()
    load_moods_config.cache_clear()
