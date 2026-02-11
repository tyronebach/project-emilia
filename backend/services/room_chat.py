"""Room chat helpers: mention routing + per-agent context building."""
import re
from db.repositories import RoomRepository, RoomMessageRepository

_MENTION_PATTERN = re.compile(r"@([a-zA-Z0-9_.-]+)")
_NON_ALNUM_PATTERN = re.compile(r"[^a-z0-9]")


def extract_mentions(text: str) -> list[str]:
    """Extract lowercased @mention tokens from free text."""
    if not text:
        return []
    return [m.strip().lower() for m in _MENTION_PATTERN.findall(text) if m.strip()]


def _normalize_token(value: str | None) -> str:
    raw = (value or "").strip().lower()
    return _NON_ALNUM_PATTERN.sub("", raw)


def _candidate_tokens(agent: dict) -> set[str]:
    display_name = agent.get("display_name") or ""
    agent_id = agent.get("agent_id") or ""

    tokens = {
        _normalize_token(display_name),
        _normalize_token(agent_id),
    }

    for part in re.split(r"[^a-zA-Z0-9]+", display_name.lower()):
        norm = _normalize_token(part)
        if norm:
            tokens.add(norm)

    return {t for t in tokens if t}


def _matches_mention(token: str, agent: dict) -> bool:
    normalized = _normalize_token(token)
    if not normalized:
        return False

    candidates = _candidate_tokens(agent)
    if normalized in candidates:
        return True

    # Allow short prefix mention, e.g. @emi for "Emilia".
    return any(cand.startswith(normalized) for cand in candidates)


def determine_responding_agents(
    user_message: str,
    mention_agents: list[str] | None,
    room_agents: list[dict],
) -> list[dict]:
    """Resolve which agents should answer a room message."""
    if not room_agents:
        return []

    by_id = {agent["agent_id"]: agent for agent in room_agents}
    selected: list[dict] = []
    seen: set[str] = set()

    if mention_agents:
        for agent_id in mention_agents:
            agent = by_id.get(agent_id)
            if agent and agent_id not in seen:
                selected.append(agent)
                seen.add(agent_id)
        if selected:
            return selected

    text_mentions = extract_mentions(user_message)
    if text_mentions:
        for mention in text_mentions:
            for agent in room_agents:
                agent_id = agent["agent_id"]
                if agent_id in seen:
                    continue
                if _matches_mention(mention, agent):
                    selected.append(agent)
                    seen.add(agent_id)
        if selected:
            return selected

    always_agents = [agent for agent in room_agents if agent.get("response_mode") == "always"]
    if always_agents:
        return always_agents

    # Mention-only room: return first agent to avoid dead-end UX.
    return [room_agents[0]]


def _build_room_system_context(current_agent: dict, all_room_agents: list[dict]) -> str:
    other_names = [
        agent.get("display_name")
        for agent in all_room_agents
        if agent.get("agent_id") != current_agent.get("agent_id")
    ]
    peers = ", ".join(name for name in other_names if name) or "no other agents"

    return (
        "You are participating in a multi-agent group chat. "
        f"Other agents in this room: {peers}. "
        "Messages from other speakers are prefixed as [Name]: message. "
        "Stay concise, natural, and in-character."
    )


def build_room_llm_messages(
    room_id: str,
    agent: dict,
    all_room_agents: list[dict],
    history_limit: int,
    emotional_context: str | None = None,
    include_game_runtime: bool = False,
) -> list[dict]:
    """Build message list for one agent in a room."""
    messages: list[dict] = [
        {
            "role": "system",
            "content": _build_room_system_context(agent, all_room_agents),
        }
    ]

    if emotional_context:
        messages.append({"role": "system", "content": emotional_context})

    summary = RoomRepository.get_summary(room_id)
    if summary:
        messages.append(
            {
                "role": "system",
                "content": f"Previous conversation summary:\n{summary}",
            }
        )

    history = RoomMessageRepository.get_last_n(
        room_id,
        history_limit,
        include_game_runtime=include_game_runtime,
    )

    current_agent_id = agent.get("agent_id")
    for item in history:
        sender_type = item.get("sender_type")
        sender_id = item.get("sender_id")
        sender_name = item.get("sender_name") or sender_id or "Unknown"
        content = item.get("content") or ""

        if sender_type == "agent" and sender_id == current_agent_id:
            messages.append({"role": "assistant", "content": content})
            continue

        messages.append({"role": "user", "content": f"[{sender_name}]: {content}"})

    return messages
