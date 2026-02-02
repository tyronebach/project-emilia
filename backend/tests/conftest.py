"""
Pytest configuration and shared fixtures for Emilia backend tests.
Updated for modular architecture (v5.5.0+).
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


@pytest.fixture
def test_client():
    """Create a TestClient for the FastAPI app."""
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
