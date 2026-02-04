"""
Tests for Emilia Web App API endpoints.

Tests updated for modular router-based architecture (v5.5.0+).
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
import json

import pytest

pytestmark = pytest.mark.anyio

# Ensure backend/ is on sys.path when pytest rootdir differs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# ========================================
# Fixtures
# ========================================

@pytest.fixture
async def test_client():
    """Create an AsyncClient for the FastAPI app."""
    # Must set env vars before importing main
    import os
    os.environ.setdefault("CLAWDBOT_TOKEN", "test-token")
    os.environ.setdefault("AUTH_ALLOW_DEV_TOKEN", "1")
    os.environ.setdefault("ELEVENLABS_API_KEY", "test-elevenlabs-key")

    import httpx
    from httpx import ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


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

    async def test_health_returns_200(self, test_client):
        """Health endpoint should return 200 with status and version."""
        response = await test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data


# ========================================
# Chat Endpoint Tests
# ========================================

class TestChatEndpoint:
    """Tests for POST /api/chat"""

    async def test_chat_requires_auth(self, test_client):
        """Chat endpoint should require authorization."""
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers={"X-User-Id": "test-user", "X-Agent-Id": "test-agent"}
        )
        assert response.status_code == 401

    async def test_chat_requires_user_id(self, test_client, auth_headers):
        """Chat should require X-User-Id header."""
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )
        assert response.status_code == 422  # Missing required header

    async def test_chat_requires_agent_id(self, test_client, auth_headers):
        """Chat should require X-Agent-Id header."""
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = await test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=headers
        )
        assert response.status_code == 422  # Missing required header


# ========================================
# Speak Endpoint Tests
# ========================================

class TestSpeakEndpoint:
    """Tests for POST /api/speak"""

    async def test_speak_requires_auth(self, test_client):
        """Speak endpoint should require authorization."""
        response = await test_client.post(
            "/api/speak",
            json={"text": "Hello"}
        )
        assert response.status_code == 401

    async def test_speak_requires_text(self, test_client, auth_headers):
        """Speak should require text field."""
        response = await test_client.post(
            "/api/speak",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 422  # Validation error


# ========================================
# Authorization Tests
# ========================================

class TestAuthorization:
    """Tests for authorization handling"""

    async def test_missing_auth_header(self, test_client):
        """Endpoints should return 401 for missing auth."""
        endpoints = [
            ("POST", "/api/chat", {"message": "test"}, {"X-User-Id": "test", "X-Agent-Id": "test"}),
            ("POST", "/api/speak", {"text": "test"}, {}),
        ]

        for method, path, body, extra_headers in endpoints:
            response = await test_client.post(path, json=body, headers=extra_headers)
            assert response.status_code == 401, f"Failed for {method} {path}"

    async def test_invalid_token(self, test_client):
        """Endpoints should reject invalid tokens."""
        headers = {
            "Authorization": "Bearer wrong-token-123",
            "X-User-Id": "test-user",
            "X-Agent-Id": "test-agent"
        }
        response = await test_client.post(
            "/api/chat",
            json={"message": "test"},
            headers=headers
        )
        assert response.status_code == 401


# ========================================
# Memory Endpoint Tests
# ========================================

class TestMemoryEndpoints:
    """Tests for memory-related endpoints"""

    async def test_memory_list_requires_auth(self, test_client):
        """GET /api/memory/list should require auth."""
        response = await test_client.get("/api/memory/list")
        assert response.status_code == 401

    async def test_memory_file_requires_auth(self, test_client):
        """GET /api/memory/{filename} should require auth."""
        response = await test_client.get("/api/memory/test.md")
        assert response.status_code == 401


# ========================================
# Session Endpoint Tests
# ========================================

class TestSessionEndpoints:
    """Tests for session management endpoints"""

    async def test_list_sessions_requires_auth(self, test_client):
        """GET /api/sessions should require auth."""
        response = await test_client.get(
            "/api/sessions",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    async def test_list_sessions_requires_user_id(self, test_client, auth_headers):
        """GET /api/sessions should require X-User-Id header."""
        response = await test_client.get("/api/sessions", headers=auth_headers)
        assert response.status_code == 422  # Missing required header

    async def test_get_session_history_requires_auth(self, test_client):
        """GET /api/sessions/{id}/history should require auth."""
        response = await test_client.get(
            "/api/sessions/test-session-id/history",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    async def test_get_session_history_returns_empty_for_nonexistent(self, test_client, auth_headers):
        """GET /api/sessions/{id}/history should return empty messages for nonexistent session."""
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = await test_client.get(
            "/api/sessions/nonexistent-session-id/history",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["messages"] == []
        assert data["count"] == 0
        assert data["session_id"] == "nonexistent-session-id"


# ========================================
# User Endpoint Tests
# ========================================

class TestUserEndpoints:
    """Tests for user management endpoints"""

    async def test_list_users_requires_auth(self, test_client):
        """GET /api/users should require auth."""
        response = await test_client.get("/api/users")
        assert response.status_code == 401

    async def test_get_user_requires_auth(self, test_client):
        """GET /api/users/{id} should require auth."""
        response = await test_client.get("/api/users/test-user")
        assert response.status_code == 401


# ========================================
# Transcribe Endpoint Tests
# ========================================

class TestTranscribeEndpoint:
    """Tests for POST /api/transcribe"""

    async def test_transcribe_requires_auth(self, test_client):
        """Transcribe endpoint should require authorization."""
        # Create a simple audio file
        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("test.webm", audio_data, "audio/webm")}
        )
        assert response.status_code == 401

    async def test_transcribe_requires_file(self, test_client, auth_headers):
        """Transcribe should require audio file."""
        response = await test_client.post(
            "/api/transcribe",
            headers=auth_headers
        )
        assert response.status_code == 422  # Validation error

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_success(self, mock_client_class, test_client, auth_headers):
        """Transcribe should return text from STT service."""
        # Mock the STT service response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "text": "Hello world",
            "language": "en",
            "duration": 1.5
        }

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Hello world"
        assert data["language"] == "en"

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_with_missing_content_type(self, mock_client_class, test_client, auth_headers):
        """Transcribe should handle missing content type gracefully."""
        # Mock the STT service response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "Test", "language": "en"}

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        # Send without content type (None)
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data)},
            headers=auth_headers
        )

        # Should succeed with default content type
        assert response.status_code == 200

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_stt_service_error(self, mock_client_class, test_client, auth_headers):
        """Transcribe should handle STT service errors."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )

        assert response.status_code == 500

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_timeout(self, mock_client_class, test_client, auth_headers):
        """Transcribe should handle timeouts."""
        import httpx

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )

        assert response.status_code == 504

    @patch("routers.chat.httpx.AsyncClient")
    async def test_transcribe_connection_error(self, mock_client_class, test_client, auth_headers):
        """Transcribe should handle connection errors."""
        import httpx

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
        mock_client_class.return_value = mock_client

        audio_data = b"fake audio data"
        response = await test_client.post(
            "/api/transcribe",
            files={"audio": ("recording.webm", audio_data, "audio/webm")},
            headers=auth_headers
        )

        assert response.status_code == 503


# ========================================
# Manage Endpoint Tests
# ========================================

class TestManageEndpoints:
    """Tests for admin/manage endpoints"""

    async def test_list_sessions_requires_auth(self, test_client):
        """GET /api/manage/sessions should require auth."""
        response = await test_client.get("/api/manage/sessions")
        assert response.status_code == 401

    async def test_list_agents_requires_auth(self, test_client):
        """GET /api/manage/agents should require auth."""
        response = await test_client.get("/api/manage/agents")
        assert response.status_code == 401
