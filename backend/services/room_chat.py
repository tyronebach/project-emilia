"""Room chat helpers: mention routing, context building, message helpers."""
import re
from db.repositories import RoomRepository, RoomMessageRepository
from services.chat_context_runtime import (
    inject_game_context,
    resolve_trusted_prompt_instructions,
)

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


# ========== Shared helpers (used by both streaming and non-streaming paths) ==========


def extract_behavior_dict(
    *,
    intent: str | None = None,
    mood: str | None = None,
    mood_intensity: float | None = None,
    energy: str | None = None,
    move: str | None = None,
    game_action: str | None = None,
) -> dict:
    return {
        "intent": intent,
        "mood": mood,
        "mood_intensity": mood_intensity if mood_intensity is not None else 1.0,
        "energy": energy,
        "move": move,
        "game_action": game_action,
    }


def has_workspace(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def room_message_row(
    room_id: str,
    sender_type: str,
    sender_id: str,
    sender_name: str,
    content: str,
    origin: str,
    timestamp: float,
    model: str | None,
    processing_ms: int | None,
    usage_prompt_tokens: int | None,
    usage_completion_tokens: int | None,
    behavior: dict | None,
) -> dict:
    behavior = behavior or {}
    behavior_values = extract_behavior_dict(
        intent=behavior.get("intent"),
        mood=behavior.get("mood"),
        mood_intensity=behavior.get("mood_intensity"),
        energy=behavior.get("energy"),
        move=behavior.get("move"),
        game_action=behavior.get("game_action"),
    )
    return {
        "id": "",
        "room_id": room_id,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "content": content,
        "timestamp": timestamp,
        "origin": origin,
        "model": model,
        "processing_ms": processing_ms,
        "usage_prompt_tokens": usage_prompt_tokens,
        "usage_completion_tokens": usage_completion_tokens,
        "behavior_intent": behavior_values["intent"],
        "behavior_mood": behavior_values["mood"],
        "behavior_mood_intensity": behavior_values["mood_intensity"],
        "behavior_energy": behavior_values["energy"],
        "behavior_move": behavior_values["move"],
        "behavior_game_action": behavior_values["game_action"],
    }


def inject_game_context_if_present(
    messages: list[dict],
    agent_id: str,
    game_context: object | None,
) -> list[dict]:
    if not game_context:
        return messages

    trusted_prompt = resolve_trusted_prompt_instructions(agent_id, game_context)

    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") != "user":
            continue
        messages[idx] = {
            **messages[idx],
            "content": inject_game_context(
                messages[idx].get("content") or "",
                game_context,
                prompt_instructions=trusted_prompt,
            ),
        }
        break

    return messages


def inject_first_turn_context_if_present(
    messages: list[dict],
    first_turn_context: str | None,
) -> list[dict]:
    if not first_turn_context:
        return messages

    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") != "user":
            continue
        existing_content = str(messages[idx].get("content") or "")
        messages[idx] = {
            **messages[idx],
            "content": first_turn_context + "\n\n" + existing_content,
        }
        break

    return messages


def inject_top_of_mind_if_present(
    messages: list[dict],
    top_of_mind_context: str | None,
) -> list[dict]:
    if not top_of_mind_context:
        return messages

    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].get("role") != "user":
            continue
        messages.insert(idx, {"role": "system", "content": top_of_mind_context})
        return messages

    messages.append({"role": "system", "content": top_of_mind_context})
    return messages
