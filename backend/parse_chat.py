from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


# Regex patterns for avatar control tags
# [MOOD:happy:0.8] [INTENT:greeting] [ENERGY:high]
MOOD_PATTERN = re.compile(r'\[MOOD:([^:\]]+):?([\d.]*)\]', re.IGNORECASE)
INTENT_PATTERN = re.compile(r'\[INTENT:([^\]]+)\]', re.IGNORECASE)
ENERGY_PATTERN = re.compile(r'\[ENERGY:([^\]]+)\]', re.IGNORECASE)


def extract_avatar_commands(text: str) -> Tuple[str, Dict[str, Any]]:
    """Extract behavior tags from text.

    Supported tags:
    - [MOOD:happy:0.8] or [MOOD:happy]
    - [INTENT:greeting]
    - [ENERGY:high]

    Returns: (clean_text, behavior)
    - clean_text: text with tags removed
    - behavior: {"intent": str|None, "mood": str|None, "mood_intensity": float, "energy": str|None}
    """
    behavior: Dict[str, Any] = {
        "intent": None,
        "mood": None,
        "mood_intensity": 1.0,
        "energy": None,
    }

    # Extract mood
    mood_match = MOOD_PATTERN.search(text)
    if mood_match:
        behavior["mood"] = mood_match.group(1).lower()
        intensity_str = mood_match.group(2)
        try:
            behavior["mood_intensity"] = float(intensity_str) if intensity_str else 1.0
        except ValueError:
            behavior["mood_intensity"] = 1.0
        behavior["mood_intensity"] = max(0.0, min(1.0, behavior["mood_intensity"]))

    # Extract intent
    intent_match = INTENT_PATTERN.search(text)
    if intent_match:
        behavior["intent"] = intent_match.group(1).lower()

    # Extract energy
    energy_match = ENERGY_PATTERN.search(text)
    if energy_match:
        behavior["energy"] = energy_match.group(1).lower()

    # Remove all tags from text
    clean_text = MOOD_PATTERN.sub('', text)
    clean_text = INTENT_PATTERN.sub('', clean_text)
    clean_text = ENERGY_PATTERN.sub('', clean_text)

    # Clean up extra whitespace
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    return clean_text, behavior


def parse_chat_completion(result: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a Clawdbot /v1/chat/completions response into text + optional reasoning/thinking.

    Handles both:
    - message.content as a string
    - message.content as an array of content parts (e.g. [{type:'text', text:'...'}, ...])

    Also extracts [INTENT:X], [MOOD:X:Y], [ENERGY:X] avatar behavior tags.

    Returns dict with: response_text, reasoning, thinking, behavior
    """
    response_text: str = ""
    reasoning: Optional[str] = None
    thinking: Optional[str] = None

    choices = result.get("choices") or []
    if not choices:
        return {
            "response_text": response_text,
            "reasoning": reasoning,
            "thinking": thinking,
            "behavior": {"intent": None, "mood": None, "mood_intensity": 1.0, "energy": None}
        }

    message = (choices[0] or {}).get("message") or {}

    # Direct fields (some providers)
    if isinstance(message.get("reasoning"), str):
        reasoning = message.get("reasoning")
    if isinstance(message.get("thinking"), str):
        thinking = message.get("thinking")

    content = message.get("content")
    if isinstance(content, str):
        response_text = content
    elif isinstance(content, list):
        # Content parts
        text_parts: List[str] = []
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

    # Extract avatar commands and clean the text
    response_text, behavior = extract_avatar_commands(response_text)

    return {
        "response_text": response_text,
        "reasoning": reasoning,
        "thinking": thinking,
        "behavior": behavior
    }
