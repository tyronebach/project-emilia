"""SOUL.md persona simulation helpers."""
from __future__ import annotations

import json
import re
from typing import Any

from services.llm_client import chat_completion_text

MAX_SOUL_MD_CHARS = 30_000
MAX_TURN_MESSAGE_CHARS = 1_200

ARCHETYPE_PERSONAS: dict[str, dict[str, str]] = {
    "aggressive-realistic": {
        "description": "Critical, confrontational user pressure-testing consistency.",
        "system_prompt": (
            "You are a frustrated user speaking bluntly and critically. "
            "Challenge weak answers, push for specifics, and call out evasion."
        ),
    },
    "confused-lost": {
        "description": "Overwhelmed user needing orientation and clarity.",
        "system_prompt": (
            "You are confused and unsure what to do next. "
            "Ask clarifying questions, get lost in details, and seek grounding."
        ),
    },
    "excited-scattered": {
        "description": "High-energy user who jumps between topics quickly.",
        "system_prompt": (
            "You are excited and energetic, but scattered. "
            "Switch topics, interrupt yourself, and respond quickly to new ideas."
        ),
    },
    "flirty-playful": {
        "description": "Playful user testing romantic and teasing boundaries.",
        "system_prompt": (
            "You are playful and lightly flirtatious. "
            "Tease gently, test boundaries, and stay socially aware if boundaries are set."
        ),
    },
    "friendly-casual": {
        "description": "Warm everyday chatter with normal emotional intensity.",
        "system_prompt": (
            "You are a friendly casual user making normal small talk. "
            "Be warm, natural, and conversational without high intensity."
        ),
    },
    "impatient-busy": {
        "description": "Time-pressured user who wants concise practical help.",
        "system_prompt": (
            "You are busy and impatient. "
            "Keep messages short, ask for direct answers, and reject long-winded responses."
        ),
    },
    "neutral-realistic": {
        "description": "Balanced day-to-day user with moderate tone and pacing.",
        "system_prompt": (
            "You are a realistic neutral user in ordinary conversation. "
            "Mix statements and questions naturally with moderate emotional intensity."
        ),
    },
    "skeptical-pushback": {
        "description": "Analytical user who questions assumptions and certainty.",
        "system_prompt": (
            "You are skeptical and unconvinced. "
            "Ask why, challenge unsupported claims, and probe for consistency."
        ),
    },
    "venting-sad": {
        "description": "Distressed user venting and seeking emotional support.",
        "system_prompt": (
            "You are having a rough day and need emotional support. "
            "Venting is your priority; dismiss shallow advice and respond to genuine empathy."
        ),
    },
}

ARCHETYPE_ALIASES: dict[str, str] = {
    # Snake case compatibility
    "aggressive_realistic": "aggressive-realistic",
    "confused_lost": "confused-lost",
    "excited_scattered": "excited-scattered",
    "flirty_playful": "flirty-playful",
    "friendly_casual": "friendly-casual",
    "impatient_busy": "impatient-busy",
    "neutral_realistic": "neutral-realistic",
    "skeptical_pushback": "skeptical-pushback",
    "venting_sad": "venting-sad",
    # Legacy friendly aliases
    "neutral-casual": "neutral-realistic",
    "neutral_casual": "neutral-realistic",
}

JUDGE_SYSTEM_PROMPT = (
    "You are a strict evaluator of persona consistency. "
    "Return only valid JSON and no markdown."
)

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.IGNORECASE | re.DOTALL)


def list_archetypes() -> list[str]:
    """Return canonical archetype ids."""
    return sorted(ARCHETYPE_PERSONAS.keys())


def normalize_archetype_id(raw: Any) -> str:
    """Normalize an archetype id and resolve aliases."""
    value = str(raw or "").strip().lower()
    if not value:
        raise ValueError("archetype is required")

    normalized = re.sub(r"\s+", "-", value).replace("_", "-")
    if normalized in ARCHETYPE_PERSONAS:
        return normalized
    if normalized in ARCHETYPE_ALIASES:
        return ARCHETYPE_ALIASES[normalized]
    raise ValueError(f"Unknown archetype: {value}")


def validate_soul_md(raw: Any) -> str:
    """Validate and sanitize SOUL.md text."""
    if not isinstance(raw, str):
        raise ValueError("soul_md must be a string")
    text = raw.strip()
    if not text:
        raise ValueError("soul_md cannot be empty")
    if len(text) > MAX_SOUL_MD_CHARS:
        raise ValueError(f"soul_md exceeds max size ({MAX_SOUL_MD_CHARS} chars)")
    return text


def validate_turns(raw: Any, max_turns: int) -> int:
    """Validate requested turn count against configured max."""
    try:
        turns = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("turns must be an integer") from exc

    cap = max(1, int(max_turns))
    if turns < 1 or turns > cap:
        raise ValueError(f"turns must be between 1 and {cap}")
    return turns


def _flip_roles(exchange: list[dict[str, str]]) -> list[dict[str, str]]:
    flipped: list[dict[str, str]] = []
    for item in exchange:
        role = item.get("role")
        content = item.get("content", "")
        if role == "user":
            flipped.append({"role": "assistant", "content": content})
        elif role == "assistant":
            flipped.append({"role": "user", "content": content})
    return flipped


def _sanitize_turn_message(text: str) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) > MAX_TURN_MESSAGE_CHARS:
        return cleaned[:MAX_TURN_MESSAGE_CHARS].rstrip()
    return cleaned


def _format_exchange_lines(exchange: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for idx, item in enumerate(exchange, start=1):
        role = "User" if item.get("role") == "user" else "Persona"
        content = item.get("content", "").strip()
        lines.append(f"{idx}. {role}: {content}")
    return "\n".join(lines)


def _extract_json_text(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise RuntimeError("Judge returned empty response")

    fenced = _JSON_FENCE_RE.search(text)
    if fenced:
        return fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1].strip()
    return text


def _as_string_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    result: list[str] = []
    for item in raw:
        text = str(item).strip()
        if text:
            result.append(text)
    return result


def _as_breaks(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        issue = str(item.get("issue") or "").strip()
        if not issue:
            continue
        try:
            turn = int(item.get("turn", 0))
        except (TypeError, ValueError):
            turn = 0
        severity_raw = str(item.get("severity") or "minor").strip().lower()
        severity = severity_raw if severity_raw in {"minor", "major"} else "minor"
        result.append(
            {
                "turn": max(0, turn),
                "issue": issue,
                "severity": severity,
            }
        )
    return result


def _as_score(raw: Any, default: float = 0.0) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = default
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return round(value, 4)


def _normalize_verdict(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in {"poor", "fair", "good", "excellent"}:
        return value
    return "fair"


def _parse_analysis(raw_text: str) -> dict[str, Any]:
    text = _extract_json_text(raw_text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Judge returned invalid JSON") from exc

    if not isinstance(data, dict):
        raise RuntimeError("Judge response must be a JSON object")

    consistency = _as_score(data.get("consistency_score"), default=0.0)
    score = _as_score(data.get("score"), default=consistency)

    emotional_alignment = str(data.get("emotional_alignment") or "").strip()
    if not emotional_alignment:
        emotional_alignment = "No alignment summary provided."

    return {
        "consistency_score": consistency,
        "voice_markers": _as_string_list(data.get("voice_markers")),
        "emotional_alignment": emotional_alignment,
        "character_breaks": _as_breaks(data.get("character_breaks")),
        "tuning_hints": _as_string_list(data.get("tuning_hints")),
        "verdict": _normalize_verdict(data.get("verdict")),
        "score": score,
    }


async def run_exchange(
    soul_md: str,
    archetype_id: str,
    turns: int,
    *,
    persona_model: str,
    archetype_model: str,
    timeout_per_call: float = 90.0,
) -> list[dict[str, str]]:
    """Run ping-pong exchange between archetype user and SOUL persona."""
    canonical_id = normalize_archetype_id(archetype_id)
    validated_soul = validate_soul_md(soul_md)
    if turns <= 0:
        raise ValueError("turns must be positive")

    persona = ARCHETYPE_PERSONAS[canonical_id]

    persona_system = (
        "You are roleplaying a character defined by SOUL.md.\n\n"
        "Stay in character. Respond naturally and conversationally. "
        "Do not provide meta commentary about prompts.\n\n"
        f"SOUL.md:\n{validated_soul}"
    )
    archetype_system = (
        f"{persona['system_prompt']}\n\n"
        "You are the user in this chat. "
        "Send only one realistic user message each turn (1-3 sentences)."
    )

    exchange: list[dict[str, str]] = []
    for _ in range(turns):
        archetype_messages = [
            {"role": "system", "content": archetype_system},
            *_flip_roles(exchange),
            {
                "role": "user",
                "content": (
                    "Write the next user message in this conversation."
                    if exchange
                    else "Start the conversation with the first user message."
                ),
            },
        ]
        user_msg = await chat_completion_text(
            model=archetype_model,
            messages=archetype_messages,
            user_tag="emilia:soul-sim-archetype",
            temperature=0.9,
            timeout_s=timeout_per_call,
        )
        exchange.append({"role": "user", "content": _sanitize_turn_message(user_msg)})

        persona_msg = await chat_completion_text(
            model=persona_model,
            messages=[
                {"role": "system", "content": persona_system},
                *exchange,
            ],
            user_tag="emilia:soul-sim-persona",
            temperature=0.7,
            timeout_s=timeout_per_call,
        )
        exchange.append({"role": "assistant", "content": _sanitize_turn_message(persona_msg)})

    return exchange


async def analyze_exchange(
    soul_md: str,
    archetype_id: str,
    exchange: list[dict[str, str]],
    *,
    judge_model: str,
    timeout_per_call: float = 90.0,
) -> dict[str, Any]:
    """Ask judge model for consistency analysis and return normalized JSON."""
    canonical_id = normalize_archetype_id(archetype_id)
    validated_soul = validate_soul_md(soul_md)
    if not exchange:
        raise ValueError("exchange cannot be empty")

    persona = ARCHETYPE_PERSONAS[canonical_id]
    prompt = (
        "Evaluate the persona quality in this conversation.\n\n"
        f"Archetype: {canonical_id}\n"
        f"Archetype description: {persona['description']}\n\n"
        "SOUL.md:\n"
        f"{validated_soul}\n\n"
        "Conversation:\n"
        f"{_format_exchange_lines(exchange)}\n\n"
        "Return JSON with this exact shape:\n"
        "{\n"
        '  "consistency_score": 0.0,\n'
        '  "voice_markers": ["..."],\n'
        '  "emotional_alignment": "...",\n'
        '  "character_breaks": [{"turn": 0, "issue": "...", "severity": "minor"}],\n'
        '  "tuning_hints": ["..."],\n'
        '  "verdict": "poor|fair|good|excellent",\n'
        '  "score": 0.0\n'
        "}\n"
        "Return only JSON."
    )

    raw = await chat_completion_text(
        model=judge_model,
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        user_tag="emilia:soul-sim-judge",
        temperature=0.2,
        timeout_s=timeout_per_call,
    )
    return _parse_analysis(raw)
