"""
Tests for Emilia Web App API endpoints.

Uses pytest fixtures and mocks for external services.
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
import json

import pytest
from httpx import Response

# Ensure backend/ is on sys.path when pytest rootdir differs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# ========================================
# Fixtures
# ========================================

@pytest.fixture
def test_client():
    """Create a TestClient for the FastAPI app."""
    # Must set env vars before importing main
    import os
    os.environ.setdefault("CLAWDBOT_TOKEN", "test-token")
    os.environ.setdefault("AUTH_ALLOW_DEV_TOKEN", "1")
    os.environ.setdefault("ELEVENLABS_API_KEY", "test-elevenlabs-key")

    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)


@pytest.fixture
def auth_headers():
    """Standard authorization headers for authenticated requests."""
    return {"Authorization": "Bearer emilia-dev-token-2026"}


@pytest.fixture
def mock_httpx_client():
    """Mock httpx.AsyncClient for external service calls."""
    with patch("httpx.AsyncClient") as mock:
        yield mock


# ========================================
# Health Endpoint Tests
# ========================================

class TestHealthEndpoint:
    """Tests for GET /api/health"""

    def test_health_returns_200(self, test_client, mock_httpx_client):
        """Health endpoint should return 200 with service status."""
        # Mock STT service response
        mock_stt_response = MagicMock()
        mock_stt_response.status_code = 200
        mock_stt_response.json.return_value = {"status": "healthy"}

        # Mock Brain service response
        mock_brain_response = MagicMock()
        mock_brain_response.status_code = 200
        mock_brain_response.json.return_value = {"status": "healthy"}

        # Setup mock client
        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=[mock_stt_response, mock_brain_response])
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["api"] == "healthy"
        assert "stt_service" in data
        assert "brain_service" in data

    def test_health_handles_stt_failure(self, test_client, mock_httpx_client):
        """Health should report unhealthy STT gracefully."""
        # Mock STT service failure
        mock_client_instance = AsyncMock()
        mock_client_instance.get = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["stt_service"]["healthy"] is False

    def test_health_handles_brain_failure(self, test_client, mock_httpx_client):
        """Health should report unhealthy Brain gracefully."""
        # STT success, Brain failure
        mock_stt_response = MagicMock()
        mock_stt_response.status_code = 200
        mock_stt_response.json.return_value = {"status": "healthy"}

        mock_client_instance = AsyncMock()
        async_get = AsyncMock()
        async_get.side_effect = [mock_stt_response, Exception("Brain unavailable")]
        mock_client_instance.get = async_get
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["brain_service"]["healthy"] is False


# ========================================
# Chat Endpoint Tests
# ========================================

class TestChatEndpoint:
    """Tests for POST /api/chat"""

    def test_chat_requires_auth(self, test_client):
        """Chat endpoint should require authorization."""
        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"}
        )
        assert response.status_code == 401

    def test_chat_invalid_token(self, test_client):
        """Chat should reject invalid tokens."""
        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers={"Authorization": "Bearer wrong-token"}
        )
        assert response.status_code == 401

    def test_chat_success(self, test_client, auth_headers, mock_httpx_client):
        """Chat should return response from brain service."""
        # Mock brain service response
        mock_brain_response = MagicMock()
        mock_brain_response.status_code = 200
        mock_brain_response.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": "Hello! I'm Emilia.",
                        "role": "assistant"
                    },
                    "finish_reason": "stop"
                }
            ],
            "model": "claude-3-opus",
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_brain_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/chat",
            json={"message": "Hello", "session_id": "test-session"},
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["response"] == "Hello! I'm Emilia."
        assert data["agent_id"] == "emilia"
        assert "processing_ms" in data

    def test_chat_brain_timeout(self, test_client, auth_headers, mock_httpx_client):
        """Chat should handle brain service timeout."""
        import httpx

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )

        assert response.status_code == 504
        data = response.json()
        assert "timeout" in data.get("error", data.get("detail", "")).lower()

    def test_chat_brain_unavailable(self, test_client, auth_headers, mock_httpx_client):
        """Chat should handle brain service connection error."""
        import httpx

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )

        assert response.status_code == 503
        data = response.json()
        assert "unavailable" in data.get("error", data.get("detail", "")).lower()

    def test_chat_brain_error_response(self, test_client, auth_headers, mock_httpx_client):
        """Chat should handle brain service error response."""
        mock_brain_response = MagicMock()
        mock_brain_response.status_code = 500
        mock_brain_response.text = "Internal server error"

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_brain_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )

        assert response.status_code == 500
        data = response.json()
        assert "brain" in data.get("error", data.get("detail", "")).lower() or "error" in data.get("error", data.get("detail", "")).lower()


# ========================================
# Speak Endpoint Tests
# ========================================

class TestSpeakEndpoint:
    """Tests for POST /api/speak"""

    def test_speak_requires_auth(self, test_client):
        """Speak endpoint should require authorization."""
        response = test_client.post(
            "/api/speak",
            json={"text": "Hello"}
        )
        assert response.status_code == 401

    def test_speak_empty_text(self, test_client, auth_headers):
        """Speak should reject empty text."""
        response = test_client.post(
            "/api/speak",
            json={"text": ""},
            headers=auth_headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "required" in data.get("error", data.get("detail", "")).lower()

    def test_speak_whitespace_text(self, test_client, auth_headers):
        """Speak should reject whitespace-only text."""
        response = test_client.post(
            "/api/speak",
            json={"text": "   "},
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_speak_success(self, test_client, auth_headers, mock_httpx_client):
        """Speak should return audio from ElevenLabs."""
        # Mock ElevenLabs response
        mock_audio_content = b"fake-mp3-audio-data"
        mock_elevenlabs_response = MagicMock()
        mock_elevenlabs_response.status_code = 200
        mock_elevenlabs_response.content = mock_audio_content

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_elevenlabs_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/speak",
            json={"text": "Hello, how are you?"},
            headers=auth_headers
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.content == mock_audio_content
        assert "X-Processing-Time-Ms" in response.headers

    def test_speak_with_voice_id(self, test_client, auth_headers, mock_httpx_client):
        """Speak should accept voice_id parameter."""
        mock_audio_content = b"fake-mp3-audio-data"
        mock_elevenlabs_response = MagicMock()
        mock_elevenlabs_response.status_code = 200
        mock_elevenlabs_response.content = mock_audio_content

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_elevenlabs_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/speak",
            json={"text": "Hello", "voice_id": "matilda"},
            headers=auth_headers
        )

        assert response.status_code == 200

    def test_speak_elevenlabs_timeout(self, test_client, auth_headers, mock_httpx_client):
        """Speak should handle ElevenLabs timeout."""
        import httpx

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/speak",
            json={"text": "Hello"},
            headers=auth_headers
        )

        assert response.status_code == 504
        data = response.json()
        assert "timeout" in data.get("error", data.get("detail", "")).lower()

    def test_speak_elevenlabs_unavailable(self, test_client, auth_headers, mock_httpx_client):
        """Speak should handle ElevenLabs connection error."""
        import httpx

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/speak",
            json={"text": "Hello"},
            headers=auth_headers
        )

        assert response.status_code == 503
        data = response.json()
        assert "unavailable" in data.get("error", data.get("detail", "")).lower()

    def test_speak_elevenlabs_error(self, test_client, auth_headers, mock_httpx_client):
        """Speak should handle ElevenLabs API error."""
        mock_elevenlabs_response = MagicMock()
        mock_elevenlabs_response.status_code = 429
        mock_elevenlabs_response.text = "Rate limit exceeded"

        mock_client_instance = AsyncMock()
        mock_client_instance.post = AsyncMock(return_value=mock_elevenlabs_response)
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        mock_httpx_client.return_value = mock_client_instance

        response = test_client.post(
            "/api/speak",
            json={"text": "Hello"},
            headers=auth_headers
        )

        # Backend may return 429 (pass-through) or 500 (generic error) for ElevenLabs failures
        assert response.status_code in [429, 500]


# ========================================
# Voices Endpoint Tests
# ========================================

class TestVoicesEndpoint:
    """Tests for GET /api/voices"""

    def test_voices_requires_auth(self, test_client):
        """Voices endpoint should require authorization."""
        response = test_client.get("/api/voices")
        assert response.status_code == 401

    def test_voices_returns_list(self, test_client, auth_headers):
        """Voices should return list of available voices."""
        response = test_client.get("/api/voices", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "voices" in data
        assert "default" in data
        assert len(data["voices"]) > 0
        assert data["default"] == "rachel"

        # Check voice structure
        voice = data["voices"][0]
        assert "key" in voice
        assert "id" in voice
        assert "name" in voice
        assert "desc" in voice


# ========================================
# Authorization Tests
# ========================================

class TestAuthorization:
    """Tests for authorization handling"""

    def test_missing_auth_header(self, test_client):
        """Endpoints should return 401 for missing auth."""
        endpoints = [
            ("POST", "/api/chat", {"message": "test"}),
            ("POST", "/api/speak", {"text": "test"}),
            ("GET", "/api/voices", None),
        ]

        for method, path, body in endpoints:
            if method == "POST":
                response = test_client.post(path, json=body)
            else:
                response = test_client.get(path)
            assert response.status_code == 401, f"Failed for {method} {path}"

    def test_invalid_auth_format(self, test_client):
        """Endpoints should reject non-Bearer auth."""
        response = test_client.post(
            "/api/chat",
            json={"message": "test"},
            headers={"Authorization": "Basic dXNlcjpwYXNz"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "invalid" in data.get("error", data.get("detail", "")).lower()

    def test_wrong_token(self, test_client):
        """Endpoints should reject wrong tokens."""
        response = test_client.post(
            "/api/chat",
            json={"message": "test"},
            headers={"Authorization": "Bearer wrong-token-123"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "invalid" in data.get("error", data.get("detail", "")).lower() or "token" in data.get("error", data.get("detail", "")).lower()


# ========================================
# Root Endpoint Tests
# ========================================

class TestRootEndpoint:
    """Tests for GET /"""

    def test_root_returns_info(self, test_client):
        """Root should return service info."""
        response = test_client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Emilia Web App API"
        assert "version" in data
        assert "endpoints" in data


# ========================================
# Memory Endpoint Tests
# ========================================

class TestMemoryEndpoints:
    """Tests for memory-related endpoints"""

    def test_memory_post_disabled(self, test_client, auth_headers):
        """POST /api/memory should be disabled (403 or 405)."""
        response = test_client.post(
            "/api/memory",
            json={"content": "test"},
            headers=auth_headers
        )
        # Accept 403 (disabled) or 405 (method not allowed)
        assert response.status_code in [403, 405]

    def test_memory_file_post_disabled(self, test_client, auth_headers):
        """POST /api/memory/{filename} should be disabled (403 or 405)."""
        response = test_client.post(
            "/api/memory/test.md",
            json={"content": "test"},
            headers=auth_headers
        )
        # Accept 403 (disabled) or 405 (method not allowed)
        assert response.status_code in [403, 405]

    def test_memory_file_invalid_filename(self, test_client, auth_headers):
        """GET /api/memory/{filename} should reject invalid filenames."""
        # Path traversal attempt - should return 400 or 404
        response = test_client.get(
            "/api/memory/../../../etc/passwd",
            headers=auth_headers
        )
        assert response.status_code in [400, 404]

        # Non-.md file - should return 400 or 404
        response = test_client.get(
            "/api/memory/test.txt",
            headers=auth_headers
        )
        assert response.status_code in [400, 404]
