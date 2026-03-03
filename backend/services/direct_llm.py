"""Direct OpenAI-compatible chat helpers and webapp system prompt builder."""
from __future__ import annotations

import json
from datetime import datetime, timezone as tz
from pathlib import Path
from typing import Any, AsyncIterator
from zoneinfo import ZoneInfo

import httpx

from config import settings
from db.connection import get_db
from services.behavioral_rules import generate_behavioral_rules, get_fragility_profile
from services.soul_parser import extract_canon_text

MAX_SOUL_MD_CHARS = 50_000

# ── Webapp System Instructions ──────────────────────────────────────
# These are injected for all standalone avatar interactions.

MEMORY_INSTRUCTIONS = """## Memory
You have access to memory tools for continuity across sessions.

**Files:**
- `MEMORY.md` — Long-term curated memory (preferences, facts, relationships)
- `memory/YYYY-MM-DD.md` — Daily notes (e.g. memory/2026-02-12.md)

**Usage:**
- Before answering about prior conversations, preferences, or past events: use `memory_search`
- After search, use `memory_read` to get full context if needed
- To remember something important: use `memory_write` to append to `MEMORY.md` or today's daily file
- DO NOT create random filenames — only use `MEMORY.md` or `memory/YYYY-MM-DD.md` pattern
"""

BEHAVIOR_FORMAT_INSTRUCTIONS = """## Response Format
Start every response with behavior tags for the avatar system:
```
[intent:X] [mood:Y] [energy:Z] Your message here...
```

**intent:** greeting | farewell | agreement | disagreement | thinking | listening | affection | embarrassed | playful | curious | surprised | pleased | annoyed | neutral
**mood:** happy | sad | angry | calm | anxious | neutral
**energy:** low | medium | high

Example: `[intent:playful] [mood:happy] [energy:high] Good morning!`
"""

# Game instructions removed — injected dynamically per-turn via inject_game_context()
# which includes: prompt_instructions, board state, last moves, valid moves, [move:X] format


def _get_time_block(timezone: str | None = None) -> str:
    """Generate current time block for system prompt."""
    try:
        if timezone:
            tz_info = ZoneInfo(timezone)
            now = datetime.now(tz_info)
            tz_label = timezone
        else:
            now = datetime.now(tz.utc)
            tz_label = "UTC"
    except Exception:
        now = datetime.now(tz.utc)
        tz_label = "UTC"

    hour = now.hour
    if 5 <= hour < 12:
        time_of_day = "morning"
    elif 12 <= hour < 17:
        time_of_day = "afternoon"
    elif 17 <= hour < 22:
        time_of_day = "evening"
    else:
        time_of_day = "night"

    return f"""## Current Time
- Timezone: {tz_label}
- Now: {now.strftime('%Y-%m-%d %H:%M')} ({time_of_day})
- Day: {now.strftime('%A')}"""


def build_webapp_system_instructions(
    *,
    timezone: str | None = None,
    include_behavior_format: bool = True,
) -> str:
    """Build the webapp system instructions block.

    Game instructions are injected dynamically per-turn via inject_game_context().
    """
    parts = [
        _get_time_block(timezone),
        MEMORY_INSTRUCTIONS,
    ]

    # Always inject webapp-specific behavior format (for avatar animation)
    if include_behavior_format:
        parts.append(BEHAVIOR_FORMAT_INSTRUCTIONS)

    return "\n\n".join(parts)


def resolve_direct_model(agent: dict[str, Any] | None) -> str:
    """Resolve direct model from agent overrides or global default."""
    if isinstance(agent, dict):
        model = str(agent.get("direct_model") or "").strip()
        if model:
            return model
    return settings.direct_default_model


def resolve_direct_api_base(agent: dict[str, Any] | None) -> str:
    """Resolve direct API base from agent overrides or global default."""
    if isinstance(agent, dict):
        base = str(agent.get("direct_api_base") or "").strip()
        if base:
            return base.rstrip("/")
    return settings.openai_api_base.rstrip("/")


def load_workspace_soul_md(workspace: str | None) -> str | None:
    """Best-effort SOUL.md loading from an agent workspace."""
    if not workspace:
        return None

    soul_path = Path(workspace) / "SOUL.md"
    if not soul_path.exists() or not soul_path.is_file():
        return None

    try:
        text = soul_path.read_text(encoding="utf-8").strip()
    except Exception:
        return None

    if not text:
        return None

    if len(text) > MAX_SOUL_MD_CHARS:
        return text[:MAX_SOUL_MD_CHARS].rstrip()
    return text


def load_canon_soul_md(workspace: str | None) -> str | None:
    """Best-effort Canon-only SOUL.md loading from an agent workspace."""
    soul_md = load_workspace_soul_md(workspace)
    if not soul_md:
        return None
    canon = extract_canon_text(soul_md)
    return canon[:MAX_SOUL_MD_CHARS].rstrip() if canon else None


def _load_lived_experience(agent_id: str | None, user_id: str | None) -> str:
    if not agent_id or not user_id:
        return ""
    with get_db() as conn:
        row = conn.execute(
            """SELECT lived_experience
               FROM character_lived_experience
               WHERE agent_id = ? AND user_id = ?""",
            (agent_id, user_id),
        ).fetchone()
    return str((row or {}).get("lived_experience") or "").strip()


def _load_trust(agent_id: str | None, user_id: str | None) -> float:
    if not agent_id or not user_id:
        return 0.5
    with get_db() as conn:
        row = conn.execute(
            """SELECT trust
               FROM emotional_state
               WHERE agent_id = ? AND user_id = ?""",
            (agent_id, user_id),
        ).fetchone()
    try:
        return float((row or {}).get("trust") or 0.5)
    except (TypeError, ValueError):
        return 0.5


def prepend_webapp_system_prompt(
    messages: list[dict[str, str]],
    workspace: str | None,
    *,
    agent: dict[str, Any] | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
    timezone: str | None = None,
    include_behavior_format: bool = True,
) -> list[dict[str, str]]:
    """Prepend SOUL.md + webapp system instructions as a leading system message.

    Used for webapp avatar interactions. SOUL.md provides persona/character,
    webapp instructions provide behavior format (for avatar animation).

    Game instructions are injected dynamically per-turn via inject_game_context().
    """
    resolved_agent_id = agent_id or (str(agent.get("id") or "") if isinstance(agent, dict) else "")
    canon_md = load_canon_soul_md(workspace)
    lived_experience = _load_lived_experience(resolved_agent_id, user_id)
    trust = _load_trust(resolved_agent_id, user_id)
    behavioral_rules = generate_behavioral_rules(trust, get_fragility_profile(agent))
    webapp_instructions = build_webapp_system_instructions(
        timezone=timezone,
        include_behavior_format=include_behavior_format,
    )

    # Prompt assembly order: Canon -> Lived Experience -> Behavioral Rules -> Mood.
    parts = []
    if canon_md:
        parts.append("\n".join(["## Canon", canon_md]))
    if lived_experience:
        parts.append("\n".join(["## Lived Experience", lived_experience]))
    if behavioral_rules:
        parts.append(behavioral_rules)
    if webapp_instructions:
        parts.append(webapp_instructions)

    if not parts:
        return list(messages)

    system_content = "\n\n".join(parts)
    return [{"role": "system", "content": system_content}, *messages]


def normalize_messages_for_direct(messages: list[dict]) -> list[dict[str, str]]:
    """Filter and normalize message rows for OpenAI-compatible payloads."""
    normalized: list[dict[str, str]] = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role not in {"system", "user", "assistant"}:
            continue
        if not isinstance(content, str):
            continue
        normalized.append({"role": role, "content": content})
    return normalized


class DirectLLMClient:
    """Minimal OpenAI-compatible chat client for direct mode."""

    # Models that don't support temperature parameter
    NO_TEMPERATURE_MODELS = {"gpt-5", "gpt-5.1", "gpt-5.2", "o1", "o3"}

    def __init__(
        self,
        *,
        api_base: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.api_base = (api_base or settings.openai_api_base).rstrip("/")
        self.api_key = api_key or settings.openai_api_key

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for direct chat mode")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _supports_temperature(self, model: str) -> bool:
        """Check if model supports temperature parameter."""
        model_lower = model.lower()
        for prefix in self.NO_TEMPERATURE_MODELS:
            if model_lower.startswith(prefix):
                return False
        return True

    async def chat_completion(
        self,
        *,
        model: str,
        messages: list[dict],
        user_tag: str | None = None,
        temperature: float | None = None,
        timeout_s: float = 60.0,
        max_tokens: int | None = None,
        tools: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Run a non-stream direct completion and return response JSON.
        
        Automatically retries without unsupported parameters (temperature, max_tokens)
        if the model rejects them.
        """
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
        }
        if user_tag:
            payload["user"] = user_tag
        if temperature is not None and self._supports_temperature(model):
            payload["temperature"] = float(temperature)
        if max_tokens is not None:
            payload["max_tokens"] = int(max_tokens)
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            
            # Handle unsupported parameter errors by retrying without them
            if response.status_code == 400:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "")
                    error_param = error_data.get("error", {}).get("param", "")
                    
                    # Retry without the unsupported parameter
                    if "temperature" in error_param or "temperature" in error_msg.lower():
                        payload.pop("temperature", None)
                        response = await client.post(
                            f"{self.api_base}/chat/completions",
                            headers=self._headers(),
                            json=payload,
                        )
                    elif "max_tokens" in error_param or "max_tokens" in error_msg.lower():
                        # Try with max_completion_tokens instead
                        if "max_tokens" in payload:
                            payload["max_completion_tokens"] = payload.pop("max_tokens")
                            response = await client.post(
                                f"{self.api_base}/chat/completions",
                                headers=self._headers(),
                                json=payload,
                            )
                except Exception:
                    pass  # Fall through to raise_for_status
            
            response.raise_for_status()
            data = response.json()

        if not isinstance(data, dict):
            raise ValueError("Invalid direct LLM response payload")
        return data

    async def stream_chat_completion(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        user_tag: str | None = None,
        temperature: float | None = None,
        timeout_s: float = 120.0,
        max_tokens: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield parsed SSE payload rows from a streaming direct completion."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if user_tag:
            payload["user"] = user_tag
        if temperature is not None:
            payload["temperature"] = float(temperature)
        if max_tokens is not None:
            payload["max_tokens"] = int(max_tokens)

        async with httpx.AsyncClient(timeout=timeout_s) as client:
            async with client.stream(
                "POST",
                f"{self.api_base}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data_str = line[6:].strip()
                    if not data_str or data_str == "[DONE]":
                        continue

                    try:
                        payload_row = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    if isinstance(payload_row, dict):
                        yield payload_row
