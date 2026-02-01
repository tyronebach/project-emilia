import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "users.json"


def load_users() -> Dict[str, Any]:
    if not DATA_PATH.exists():
        return {"users": {}}
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def save_users(data: Dict[str, Any]) -> None:
    DATA_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    data = load_users()
    return (data.get("users") or {}).get(user_id)


def get_user_session(user_id: str, avatar_id: str) -> Optional[str]:
    data = load_users()
    users = data.get("users") or {}
    user = users.get(user_id)
    if not user:
        return None

    sessions = user.get("sessions") or {}
    session_id = sessions.get(avatar_id)
    if session_id:
        return session_id

    session_id = f"{user_id}-{avatar_id}-{int(time.time())}"
    sessions[avatar_id] = session_id
    user["sessions"] = sessions
    users[user_id] = user
    data["users"] = users
    save_users(data)
    return session_id
