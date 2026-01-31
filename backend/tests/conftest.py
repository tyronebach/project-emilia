"""
Pytest configuration and shared fixtures for Emilia backend tests.
"""
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure backend/ is on sys.path when pytest rootdir differs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Set required env vars before importing main module
os.environ.setdefault("CLAWDBOT_TOKEN", "test-token-for-testing")
os.environ.setdefault("AUTH_ALLOW_DEV_TOKEN", "1")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-elevenlabs-key")
os.environ.setdefault("EMILIA_WORKSPACE", "/tmp/emilia-test-workspace")


@pytest.fixture(scope="session")
def test_workspace(tmp_path_factory):
    """Create a temporary workspace for memory tests."""
    workspace = tmp_path_factory.mktemp("emilia-workspace")
    memory_dir = workspace / "memory"
    memory_dir.mkdir()

    # Create test MEMORY.md
    memory_md = workspace / "MEMORY.md"
    memory_md.write_text("# Test Memory\n\nThis is test memory content.")

    # Create test daily log
    daily_log = memory_dir / "2026-01-31.md"
    daily_log.write_text("# Daily Log\n\n- Test entry")

    return workspace


@pytest.fixture
def app_with_workspace(test_workspace):
    """FastAPI app with test workspace configured."""
    os.environ["EMILIA_WORKSPACE"] = str(test_workspace)

    # Import fresh to pick up new env var
    import importlib
    import main
    importlib.reload(main)

    return main.app


@pytest.fixture
def test_client(app_with_workspace):
    """Create a TestClient for the FastAPI app."""
    from fastapi.testclient import TestClient
    return TestClient(app_with_workspace)


@pytest.fixture
def auth_headers():
    """Standard authorization headers for authenticated requests."""
    return {"Authorization": "Bearer emilia-dev-token-2026"}


@pytest.fixture
def mock_httpx_client():
    """Mock httpx.AsyncClient for external service calls."""
    with patch("httpx.AsyncClient") as mock:
        yield mock


@pytest.fixture
def mock_successful_brain_response():
    """Create a mock successful brain/chat response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "Hello! I'm Emilia, nice to meet you!",
                    "role": "assistant"
                },
                "finish_reason": "stop"
            }
        ],
        "model": "claude-3-opus",
        "usage": {
            "prompt_tokens": 50,
            "completion_tokens": 20,
            "total_tokens": 70
        }
    }
    return mock_response


@pytest.fixture
def mock_successful_tts_response():
    """Create a mock successful ElevenLabs TTS response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"fake-mp3-audio-data-for-testing"
    return mock_response


@pytest.fixture
def mock_successful_stt_response():
    """Create a mock successful STT transcription response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "text": "Hello, this is a test transcription.",
        "language": "en",
        "duration_ms": 1500,
        "processing_ms": 200
    }
    return mock_response


@pytest.fixture
def setup_mock_client(mock_httpx_client):
    """Helper to setup a mock httpx client with custom responses."""
    def _setup(responses):
        """
        Setup mock client with given responses.

        Args:
            responses: List of (method, response) tuples or single response
        """
        mock_client_instance = AsyncMock()
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)

        if isinstance(responses, list):
            # Multiple responses for different calls
            get_responses = [r for m, r in responses if m == "GET"]
            post_responses = [r for m, r in responses if m == "POST"]

            if get_responses:
                mock_client_instance.get = AsyncMock(side_effect=get_responses)
            if post_responses:
                mock_client_instance.post = AsyncMock(side_effect=post_responses)
        else:
            # Single response for any call
            mock_client_instance.get = AsyncMock(return_value=responses)
            mock_client_instance.post = AsyncMock(return_value=responses)

        mock_httpx_client.return_value = mock_client_instance
        return mock_client_instance

    return _setup
