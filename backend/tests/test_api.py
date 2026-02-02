"""
Tests for Emilia Web App API endpoints.

Tests updated for modular router-based architecture (v5.5.0+).
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
import json

import pytest

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

    def test_health_returns_200(self, test_client):
        """Health endpoint should return 200 with status and version."""
        response = test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data


# ========================================
# Chat Endpoint Tests
# ========================================

class TestChatEndpoint:
    """Tests for POST /api/chat"""

    def test_chat_requires_auth(self, test_client):
        """Chat endpoint should require authorization."""
        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers={"X-User-Id": "test-user", "X-Agent-Id": "test-agent"}
        )
        assert response.status_code == 401

    def test_chat_requires_user_id(self, test_client, auth_headers):
        """Chat should require X-User-Id header."""
        response = test_client.post(
            "/api/chat",
            json={"message": "Hello"},
            headers=auth_headers
        )
        assert response.status_code == 422  # Missing required header

    def test_chat_requires_agent_id(self, test_client, auth_headers):
        """Chat should require X-Agent-Id header."""
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = test_client.post(
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

    def test_speak_requires_auth(self, test_client):
        """Speak endpoint should require authorization."""
        response = test_client.post(
            "/api/speak",
            json={"text": "Hello"}
        )
        assert response.status_code == 401

    def test_speak_requires_text(self, test_client, auth_headers):
        """Speak should require text field."""
        response = test_client.post(
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

    def test_missing_auth_header(self, test_client):
        """Endpoints should return 401 for missing auth."""
        endpoints = [
            ("POST", "/api/chat", {"message": "test"}, {"X-User-Id": "test", "X-Agent-Id": "test"}),
            ("POST", "/api/speak", {"text": "test"}, {}),
        ]

        for method, path, body, extra_headers in endpoints:
            response = test_client.post(path, json=body, headers=extra_headers)
            assert response.status_code == 401, f"Failed for {method} {path}"

    def test_invalid_token(self, test_client):
        """Endpoints should reject invalid tokens."""
        headers = {
            "Authorization": "Bearer wrong-token-123",
            "X-User-Id": "test-user",
            "X-Agent-Id": "test-agent"
        }
        response = test_client.post(
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

    def test_memory_list_requires_auth(self, test_client):
        """GET /api/memory/list should require auth."""
        response = test_client.get("/api/memory/list")
        assert response.status_code == 401

    def test_memory_file_requires_auth(self, test_client):
        """GET /api/memory/{filename} should require auth."""
        response = test_client.get("/api/memory/test.md")
        assert response.status_code == 401


# ========================================
# Session Endpoint Tests
# ========================================

class TestSessionEndpoints:
    """Tests for session management endpoints"""

    def test_list_sessions_requires_auth(self, test_client):
        """GET /api/sessions should require auth."""
        response = test_client.get(
            "/api/sessions",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    def test_list_sessions_requires_user_id(self, test_client, auth_headers):
        """GET /api/sessions should require X-User-Id header."""
        response = test_client.get("/api/sessions", headers=auth_headers)
        assert response.status_code == 422  # Missing required header

    def test_get_session_history_requires_auth(self, test_client):
        """GET /api/sessions/{id}/history should require auth."""
        response = test_client.get(
            "/api/sessions/test-session-id/history",
            headers={"X-User-Id": "test-user"}
        )
        assert response.status_code == 401

    def test_get_session_history_returns_empty_for_nonexistent(self, test_client, auth_headers):
        """GET /api/sessions/{id}/history should return empty messages for nonexistent session."""
        headers = {**auth_headers, "X-User-Id": "test-user"}
        response = test_client.get(
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

    def test_list_users_requires_auth(self, test_client):
        """GET /api/users should require auth."""
        response = test_client.get("/api/users")
        assert response.status_code == 401

    def test_get_user_requires_auth(self, test_client):
        """GET /api/users/{id} should require auth."""
        response = test_client.get("/api/users/test-user")
        assert response.status_code == 401


# ========================================
# Admin Endpoint Tests
# ========================================

class TestAdminEndpoints:
    """Tests for admin/manage endpoints"""

    def test_list_all_sessions_requires_auth(self, test_client):
        """GET /api/manage/sessions should require auth."""
        response = test_client.get("/api/manage/sessions")
        assert response.status_code == 401

    def test_list_agents_requires_auth(self, test_client):
        """GET /api/manage/agents should require auth."""
        response = test_client.get("/api/manage/agents")
        assert response.status_code == 401
