# Phase 1.4 COMPLETE - 2026-02-08
import re
from typing import Any


# Regex patterns for avatar control tags
# [MOOD:happy:0.8] [INTENT:greeting] [ENERGY:high]
MOOD_PATTERN = re.compile(r'\[MOOD:([^:\]]+):?([\d.]*)\]', re.IGNORECASE)
INTENT_PATTERN = re.compile(r'\[INTENT:([^\]]+)\]', re.IGNORECASE)
ENERGY_PATTERN = re.compile(r'\[ENERGY:([^\]]+)\]', re.IGNORECASE)
# Regex patterns for game tags: [move:e4] [game:resign]
MOVE_PATTERN = re.compile(r'\[MOVE:([^\]]+)\]', re.IGNORECASE)
GAME_PATTERN = re.compile(r'\[GAME:([^\]]+)\]', re.IGNORECASE)


def extract_avatar_commands(text: str) -> tuple[str, dict[str, Any]]:
    """Extract behavior tags from text.

    Supported tags:
    - [MOOD:happy:0.8] or [MOOD:happy]
    - [INTENT:greeting]
    - [ENERGY:high]

    Returns: (clean_text, behavior)
    """
    behavior: dict[str, Any] = {
        "intent": None,
        "mood": None,
        "mood_intensity": 1.0,
        "energy": None,
        "move": None,
        "game_action": None,
    }

    mood_match = MOOD_PATTERN.search(text)
    if mood_match:
        behavior["mood"] = mood_match.group(1).lower()
        intensity_str = mood_match.group(2)
        try:
            behavior["mood_intensity"] = float(intensity_str) if intensity_str else 1.0
        except ValueError:
            behavior["mood_intensity"] = 1.0
        behavior["mood_intensity"] = max(0.0, min(1.0, behavior["mood_intensity"]))

    intent_match = INTENT_PATTERN.search(text)
    if intent_match:
        behavior["intent"] = intent_match.group(1).lower()

    energy_match = ENERGY_PATTERN.search(text)
    if energy_match:
        behavior["energy"] = energy_match.group(1).lower()

    move_match = MOVE_PATTERN.search(text)
    if move_match:
        behavior["move"] = move_match.group(1).strip()

    game_match = GAME_PATTERN.search(text)
    if game_match:
        behavior["game_action"] = game_match.group(1).lower().strip()

    clean_text = MOOD_PATTERN.sub('', text)
    clean_text = INTENT_PATTERN.sub('', clean_text)
    clean_text = ENERGY_PATTERN.sub('', clean_text)
    clean_text = MOVE_PATTERN.sub('', clean_text)
    clean_text = GAME_PATTERN.sub('', clean_text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    return clean_text, behavior


def coalesce_response_text(clean_text: str, raw_text: str) -> str:
    """Guarantee a visible response text when tag stripping empties the output."""
    normalized_clean = (clean_text or "").strip()
    if normalized_clean:
        return normalized_clean
    return (raw_text or "").strip()


def parse_chat_completion(result: dict[str, Any]) -> dict[str, Any]:
    """Parse a Clawdbot /v1/chat/completions response into text + optional reasoning/thinking.

    Also extracts [INTENT:X], [MOOD:X:Y], [ENERGY:X] avatar behavior tags.

    Returns dict with: response_text, reasoning, thinking, behavior
    """
    response_text: str = ""
    reasoning: str | None = None
    thinking: str | None = None

    choices = result.get("choices") or []
    if not choices:
        return {
            "response_text": response_text,
            "reasoning": reasoning,
            "thinking": thinking,
            "behavior": {
                "intent": None,
                "mood": None,
                "mood_intensity": 1.0,
                "energy": None,
                "move": None,
                "game_action": None,
            }
        }

    message = (choices[0] or {}).get("message") or {}

    if isinstance(message.get("reasoning"), str):
        reasoning = message.get("reasoning")
    if isinstance(message.get("thinking"), str):
        thinking = message.get("thinking")

    content = message.get("content")
    if isinstance(content, str):
        response_text = content
    elif isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            ptype = part.get("type")
            if ptype == "text" and isinstance(part.get("text"), str):
                text_parts.append(part.get("text"))
            elif ptype == "thinking" and thinking is None and isinstance(part.get("thinking"), str):
                thinking = part.get("thinking")
            elif ptype == "reasoning" and reasoning is None and isinstance(part.get("reasoning"), str):
                reasoning = part.get("reasoning")
        response_text = "".join(text_parts).strip()

    raw_response_text = response_text
    response_text, behavior = extract_avatar_commands(raw_response_text)
    response_text = coalesce_response_text(response_text, raw_response_text)

    return {
        "response_text": response_text,
        "reasoning": reasoning,
        "thinking": thinking,
        "behavior": behavior
    }
