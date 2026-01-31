from __future__ import annotations

from typing import Any, Dict, List, Optional


def parse_chat_completion(result: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a Clawdbot /v1/chat/completions response into text + optional reasoning/thinking.

    Handles both:
    - message.content as a string
    - message.content as an array of content parts (e.g. [{type:'text', text:'...'}, ...])

    Returns dict with: response_text, reasoning, thinking
    """
    response_text: str = ""
    reasoning: Optional[str] = None
    thinking: Optional[str] = None

    choices = result.get("choices") or []
    if not choices:
        return {"response_text": response_text, "reasoning": reasoning, "thinking": thinking}

    message = (choices[0] or {}).get("message") or {}

    # Direct fields (some providers)
    if isinstance(message.get("reasoning"), str):
        reasoning = message.get("reasoning")
    if isinstance(message.get("thinking"), str):
        thinking = message.get("thinking")

    content = message.get("content")
    if isinstance(content, str):
        response_text = content
        return {"response_text": response_text, "reasoning": reasoning, "thinking": thinking}

    # Content parts
    if isinstance(content, list):
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

    return {"response_text": response_text, "reasoning": reasoning, "thinking": thinking}
