"""Load relationship configs and mood configs from SQLite."""
from functools import lru_cache
from db.repositories import MoodRepository, RelationshipTypeRepository


@lru_cache(maxsize=5)
def load_relationship_config(relationship_type: str) -> dict:
    """Load relationship config from DB."""
    row = RelationshipTypeRepository.get_by_id(relationship_type)
    if not row:
        return {}
    # Return same shape as the old JSON files
    result = dict(row)
    result["type"] = result.pop("id")
    result.pop("created_at", None)
    extra = result.pop("extra", {})
    if extra:
        result.update(extra)
    return result


@lru_cache(maxsize=1)
def load_moods_config() -> dict:
    """Load mood definitions from DB. Returns same shape as old moods.json."""
    rows = MoodRepository.get_all()
    moods = {}
    for row in rows:
        mood_id = row["id"]
        moods[mood_id] = {
            "valence": row["valence"],
            "arousal": row["arousal"],
            "description": row.get("description", ""),
        }
    return {"moods": moods}


def clear_config_cache():
    """Clear cached configs (useful for hot reload during dev)."""
    load_relationship_config.cache_clear()
    load_moods_config.cache_clear()
    # Also clear the emotion engine's mood cache (M9 fix)
    from services.emotion_engine import clear_mood_cache
    clear_mood_cache()
