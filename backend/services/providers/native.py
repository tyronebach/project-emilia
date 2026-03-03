"""
Native OpenAI-compatible provider.

Talks directly to any OpenAI-compatible endpoint (OpenAI, local Ollama, etc.)
using the provider_config fields:
  - model (str)
  - api_base (str, optional — defaults to OpenAI)
  - api_key  (str, optional — falls back to env OPENAI_API_KEY)
  - use_tools (bool, optional — defaults to true)
"""
from __future__ import annotations

from typing import Any, AsyncIterator

from config import settings
from services.direct_llm import (
    DirectLLMClient,
    normalize_messages_for_direct,
    prepend_webapp_system_prompt,
)
from services.direct_tool_runtime import run_tool_loop
from services.providers.base import Provider


class NativeProvider(Provider):
    """OpenAI-compatible direct provider."""

    capabilities = {
        "streaming": True,
        "tools": True,
        "vision": False,
    }

    def __init__(self, config: dict, agent: dict | None = None):
        """Initialise with provider_config dict from the agent row."""
        self.config = dict(config or {})
        self.agent = dict(agent or {})

    def _resolve_model(self, override: str | None = None) -> str:
        if override:
            return override
        configured = str(self.config.get("model") or "").strip()
        if configured:
            return configured
        legacy = str(self.agent.get("direct_model") or "").strip()
        if legacy:
            return legacy
        return settings.direct_default_model

    def _resolve_api_base(self) -> str:
        configured = str(self.config.get("api_base") or "").strip()
        if configured:
            return configured.rstrip("/")
        legacy = str(self.agent.get("direct_api_base") or "").strip()
        if legacy:
            return legacy.rstrip("/")
        return settings.openai_api_base.rstrip("/")

    def _resolve_api_key(self) -> str | None:
        configured = str(self.config.get("api_key") or "").strip()
        if configured:
            return configured
        return settings.openai_api_key

    def _use_tools(self, override: bool | None = None) -> bool:
        if override is not None:
            return bool(override)
        value = self.config.get("use_tools")
        if value is None:
            return True
        if isinstance(value, str):
            return value.strip().lower() not in {"0", "false", "no", "off"}
        return bool(value)

    def _prepare_messages(
        self,
        messages: list[dict],
        *,
        workspace: str | None,
        user_id: str | None,
        agent_id: str | None,
        timezone: str | None,
        include_behavior_format: bool,
    ) -> list[dict[str, str]]:
        return prepend_webapp_system_prompt(
            normalize_messages_for_direct(messages),
            workspace,
            agent=self.agent,
            user_id=user_id,
            agent_id=agent_id or str(self.agent.get("id") or ""),
            timezone=timezone or settings.default_timezone,
            include_behavior_format=include_behavior_format,
        )

    def _client(self) -> DirectLLMClient:
        return DirectLLMClient(
            api_base=self._resolve_api_base(),
            api_key=self._resolve_api_key(),
        )

    async def generate(self, messages: list[dict], **kwargs) -> dict:
        """Generate a complete response via the native endpoint."""
        workspace = kwargs.get("workspace")
        user_tag = kwargs.get("user_tag")
        user_id = kwargs.get("user_id")
        timeout_s = float(kwargs.get("timeout_s", 60.0))
        timezone = kwargs.get("timezone")
        include_behavior_format = bool(kwargs.get("include_behavior_format", True))
        agent_id = str(kwargs.get("agent_id") or self.agent.get("id") or "")
        model = self._resolve_model(kwargs.get("model"))
        prepared_messages = self._prepare_messages(
            messages,
            workspace=workspace,
            user_id=user_id,
            agent_id=agent_id,
            timezone=timezone,
            include_behavior_format=include_behavior_format,
        )
        client = self._client()

        if self._use_tools(kwargs.get("use_tools")):
            return await run_tool_loop(
                client=client,
                model=model,
                messages=prepared_messages,
                workspace=workspace,
                agent_id=agent_id,
                user_id=user_id,
                user_tag=user_tag,
                timeout_s=timeout_s,
            )

        return await client.chat_completion(
            model=model,
            messages=prepared_messages,
            user_tag=user_tag,
            timeout_s=timeout_s,
        )

    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[dict[str, Any] | str]:
        """Stream a response via the native endpoint."""
        workspace = kwargs.get("workspace")
        user_tag = kwargs.get("user_tag")
        timeout_s = float(kwargs.get("timeout_s", 120.0))
        timezone = kwargs.get("timezone")
        include_behavior_format = bool(kwargs.get("include_behavior_format", True))
        model = self._resolve_model(kwargs.get("model"))
        prepared_messages = self._prepare_messages(
            messages,
            workspace=workspace,
            user_id=kwargs.get("user_id"),
            agent_id=str(kwargs.get("agent_id") or self.agent.get("id") or ""),
            timezone=timezone,
            include_behavior_format=include_behavior_format,
        )

        if self._use_tools(kwargs.get("use_tools")):
            result = await self.generate(
                messages,
                workspace=workspace,
                user_tag=user_tag,
                timeout_s=timeout_s,
                timezone=timezone,
                include_behavior_format=include_behavior_format,
                model=model,
                use_tools=True,
                agent_id=kwargs.get("agent_id"),
                user_id=kwargs.get("user_id"),
            )
            usage = result.get("usage")
            content = (((result.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
            if content:
                yield {"type": "content", "content": content}
            if usage:
                yield {"type": "usage", "usage": usage}
            yield {"type": "done", "model": result.get("model") or model, "finish_reason": "stop"}
            return

        client = self._client()
        async for payload_row in client.stream_chat_completion(
            model=model,
            messages=prepared_messages,
            user_tag=user_tag,
            timeout_s=timeout_s,
        ):
            usage = payload_row.get("usage")
            if usage:
                yield {"type": "usage", "usage": usage}

            choices = payload_row.get("choices") or []
            if not choices:
                continue

            delta = choices[0].get("delta") or {}
            chunk = delta.get("content")
            if chunk:
                yield {"type": "content", "content": chunk}

            finish_reason = choices[0].get("finish_reason")
            if finish_reason:
                yield {
                    "type": "done",
                    "model": payload_row.get("model") or model,
                    "finish_reason": finish_reason,
                }
                return
