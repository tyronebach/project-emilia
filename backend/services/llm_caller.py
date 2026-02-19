"""LLM calling service — shared by streaming and non-streaming room chat paths."""
import logging
import httpx

from config import settings
from db.repositories import AgentRepository
from services.direct_llm import (
    DirectLLMClient,
    build_webapp_system_instructions,
    normalize_chat_mode,
    normalize_messages_for_direct,
    prepend_webapp_system_prompt,
    resolve_direct_api_base,
    resolve_direct_model,
)
from services.direct_tool_runtime import run_tool_loop

logger = logging.getLogger(__name__)

MAX_RESPONSE_CHARS = 50_000


async def call_llm_non_stream(agent: dict, messages: list[dict], room_id: str) -> dict:
    """Call the LLM (direct or openclaw mode) and return the full response dict."""
    agent_id = str(agent.get("agent_id") or "")
    agent_config = AgentRepository.get_by_id(agent_id) if agent_id else None
    chat_mode = normalize_chat_mode((agent_config or {}).get("chat_mode"))

    if chat_mode == "direct":
        direct_client = DirectLLMClient(
            api_base=resolve_direct_api_base(agent_config),
        )
        workspace = (agent_config or {}).get("workspace")
        direct_messages = prepend_webapp_system_prompt(
            normalize_messages_for_direct(messages),
            workspace,
            timezone=settings.default_timezone,
        )
        claw_id = (agent_config or {}).get("clawdbot_agent_id") or ""
        return await run_tool_loop(
            client=direct_client,
            model=resolve_direct_model(agent_config),
            messages=direct_messages,
            workspace=workspace,
            claw_agent_id=claw_id,
            user_tag=f"emilia:room:{room_id}",
            timeout_s=60.0,
        )

    # OpenClaw mode
    webapp_instructions = build_webapp_system_instructions(
        chat_mode="openclaw",
        include_behavior_format=True,
    )
    openclaw_messages = [
        {"role": "system", "content": webapp_instructions},
        *messages,
    ]

    clawdbot_agent_id = (agent.get("clawdbot_agent_id") or "").strip()
    async with httpx.AsyncClient(timeout=60.0) as client:
        from core.exceptions import service_unavailable

        response = await client.post(
            f"{settings.clawdbot_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.clawdbot_token}",
                "Content-Type": "application/json",
            },
            json={
                "model": f"agent:{clawdbot_agent_id}",
                "messages": openclaw_messages,
                "stream": False,
                "user": f"emilia:room:{room_id}",
            },
        )

    if response.status_code != 200:
        raise service_unavailable("Room chat")
    return response.json()
