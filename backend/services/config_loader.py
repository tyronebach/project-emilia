"""Load agent profiles and relationship configs from JSON files."""
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

def clear_config_cache():
    """Clear cached configs (useful for hot reload during dev)."""
    load_agent_profile.cache_clear()
    load_relationship_config.cache_clear()
