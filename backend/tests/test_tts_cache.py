"""Tests for ElevenLabs TTS caching."""
import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config import settings
from db.connection import get_db
from services.elevenlabs import ElevenLabsService

pytestmark = pytest.mark.anyio


class TestTTSCache:

    async def test_synthesize_uses_cache(self):
        settings.tts_cache_enabled = True
        settings.tts_cache_ttl_seconds = 604800
        settings.tts_cache_max_entries = 200

        with get_db() as conn:
            conn.execute("DELETE FROM tts_cache")

        audio_base64 = base64.b64encode(b"test-audio").decode("utf-8")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "audio_base64": audio_base64,
            "alignment": {
                "characters": ["H", "i"],
                "character_start_times_seconds": [0.0, 0.1],
                "character_end_times_seconds": [0.05, 0.2],
            },
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.elevenlabs.httpx.AsyncClient", return_value=mock_client) as mock_client_class:
            first = await ElevenLabsService.synthesize("Hello   world", "voice-test")
            second = await ElevenLabsService.synthesize("Hello world", "voice-test")

        assert mock_client_class.call_count == 1
        assert mock_client.post.await_count == 1
        assert first["audio_base64"] == audio_base64
        assert second["audio_base64"] == audio_base64
        assert first["cache_hit"] is False
        assert second["cache_hit"] is True
        assert second["cache_key"] == first["cache_key"]
