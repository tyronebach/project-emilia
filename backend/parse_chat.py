from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


# Regex patterns for avatar control tags
MOOD_PATTERN = re.compile(r'\[MOOD:([^:\]]+):?([\d.]*)\]')
ANIM_PATTERN = re.compile(r'\[ANIM:([^\]]+)\]')


def extract_avatar_commands(text: str) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """Extract [MOOD:x:y] and [ANIM:z] tags from text.
    
    Returns: (clean_text, moods, animations)
    - clean_text: text with tags removed
    - moods: list of {"mood": "thinking", "intensity": 0.6}
    - animations: list of animation names ["thinking_pose"]
    """
    moods: List[Dict[str, Any]] = []
    animations: List[str] = []
    
    # Extract moods
    for match in MOOD_PATTERN.finditer(text):
        mood_name = match.group(1)
        intensity_str = match.group(2)
        intensity = float(intensity_str) if intensity_str else 1.0
        moods.append({"mood": mood_name, "intensity": intensity})
    
    # Extract animations
    for match in ANIM_PATTERN.finditer(text):
        animations.append(match.group(1))
    
    # Remove all tags from text
    clean_text = MOOD_PATTERN.sub('', text)
    clean_text = ANIM_PATTERN.sub('', clean_text)
    
    # Clean up extra whitespace
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    
    return clean_text, moods, animations


def parse_chat_completion(result: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a Clawdbot /v1/chat/completions response into text + optional reasoning/thinking.

    Handles both:
    - message.content as a string
    - message.content as an array of content parts (e.g. [{type:'text', text:'...'}, ...])

    Also extracts [MOOD:x:y] and [ANIM:z] avatar control tags.

    Returns dict with: response_text, reasoning, thinking, moods, animations
    """
    response_text: str = ""
    reasoning: Optional[str] = None
    thinking: Optional[str] = None
    moods: List[Dict[str, Any]] = []
    animations: List[str] = []

    choices = result.get("choices") or []
    if not choices:
        return {
            "response_text": response_text, 
            "reasoning": reasoning, 
            "thinking": thinking,
            "moods": moods,
            "animations": animations
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
    response_text, moods, animations = extract_avatar_commands(response_text)

    return {
        "response_text": response_text, 
        "reasoning": reasoning, 
        "thinking": thinking,
        "moods": moods,
        "animations": animations
    }
