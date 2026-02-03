from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


# Regex patterns for avatar control tags
# Format 1: [MOOD:happy:0.8] [ANIM:wave]
MOOD_PATTERN_BRACKET = re.compile(r'\[MOOD:([^:\]]+):?([\d.]*)\]', re.IGNORECASE)
ANIM_PATTERN_BRACKET = re.compile(r'\[ANIM:([^\]]+)\]', re.IGNORECASE)

# Format 2: <mood:happy> <mood:happy:0.8> <animation:wave>
MOOD_PATTERN_ANGLE = re.compile(r'<mood:([^:>]+):?([\d.]*)>', re.IGNORECASE)
ANIM_PATTERN_ANGLE = re.compile(r'<animation:([^>]+)>', re.IGNORECASE)


def extract_avatar_commands(text: str) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """Extract mood and animation tags from text.
    
    Supports both formats:
    - [MOOD:happy:0.8] [ANIM:wave]
    - <mood:happy:0.8> <animation:wave>
    
    Returns: (clean_text, moods, animations)
    - clean_text: text with tags removed
    - moods: list of {"mood": "happy", "intensity": 0.8}
    - animations: list of animation names ["wave"]
    """
    moods: List[Dict[str, Any]] = []
    animations: List[str] = []
    
    # Extract moods from both formats
    for pattern in [MOOD_PATTERN_BRACKET, MOOD_PATTERN_ANGLE]:
        for match in pattern.finditer(text):
            mood_name = match.group(1)
            intensity_str = match.group(2)
            try:
                intensity = float(intensity_str) if intensity_str else 1.0
            except ValueError:
                intensity = 1.0
            intensity = max(0.0, min(1.0, intensity))
            moods.append({"mood": mood_name, "intensity": intensity})
    
    # Extract animations from both formats
    for pattern in [ANIM_PATTERN_BRACKET, ANIM_PATTERN_ANGLE]:
        for match in pattern.finditer(text):
            animations.append(match.group(1))
    
    # Remove all tag formats from text
    clean_text = MOOD_PATTERN_BRACKET.sub('', text)
    clean_text = ANIM_PATTERN_BRACKET.sub('', clean_text)
    clean_text = MOOD_PATTERN_ANGLE.sub('', clean_text)
    clean_text = ANIM_PATTERN_ANGLE.sub('', clean_text)
    
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
