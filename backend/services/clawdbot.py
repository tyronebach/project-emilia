"""
Clawdbot API client service.
"""
import json
import httpx
from typing import AsyncGenerator
from config import settings
from core.exceptions import ClawdbotError, timeout_error, service_unavailable


class ClawdbotService:
    """Client for Clawdbot API."""

    @staticmethod
    async def send_chat(
        message: str,
        agent_id: str,
        session_id: str,
        stream: bool = False
    ) -> dict:
        """
        Send chat message to Clawdbot.

        Args:
            message: User message
            agent_id: Clawdbot agent ID
            session_id: Session ID for context
            stream: Whether to stream the response

        Returns:
            Chat completion response dict

        Raises:
            ClawdbotError: If Clawdbot request fails
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                payload = {
                    "model": f"agent:{agent_id}",
                    "messages": [{"role": "user", "content": message}],
                    "stream": stream,
                    "user": session_id
                }

                response = await client.post(
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )

                if response.status_code != 200:
                    raise ClawdbotError(f"Clawdbot returned {response.status_code}: {response.text}")

                return response.json()

        except httpx.TimeoutException:
            raise timeout_error("Clawdbot")
        except httpx.ConnectError:
            raise service_unavailable("Clawdbot")
        except Exception as e:
            if isinstance(e, (ClawdbotError, httpx.HTTPStatusError)):
                raise
            raise ClawdbotError(f"Clawdbot error: {str(e)}")

    @staticmethod
    async def stream_chat(
        message: str,
        agent_id: str,
        session_id: str
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat response from Clawdbot.

        Args:
            message: User message
            agent_id: Clawdbot agent ID
            session_id: Session ID for context

        Yields:
            Server-Sent Event formatted strings

        Raises:
            ClawdbotError: If Clawdbot request fails
        """
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                payload = {
                    "model": f"agent:{agent_id}",
                    "messages": [{"role": "user", "content": message}],
                    "stream": True,
                    "stream_options": {"include_usage": True},
                    "user": session_id
                }

                async with client.stream(
                    "POST",
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                ) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': 'Clawdbot API error'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            yield line + "\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
