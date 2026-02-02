import json
from pathlib import Path
from typing import Any, Dict, Optional, Set


DATA_PATH = Path("/data/avatars.json")


def load_avatars() -> Dict[str, Any]:
    if not DATA_PATH.exists():
        return {"avatars": {}}
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def get_avatar(avatar_id: str) -> Optional[Dict[str, Any]]:
    data = load_avatars()
    return (data.get("avatars") or {}).get(avatar_id)


def get_allowed_agent_ids() -> Set[str]:
    data = load_avatars()
    avatars = data.get("avatars") or {}
    return {avatar.get("agent_id") for avatar in avatars.values() if avatar.get("agent_id")}
