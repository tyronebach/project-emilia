"""Pytest configuration and shared fixtures."""
# === ENV VARS MUST BE SET BEFORE ANY OTHER IMPORTS ===
# db.connection evaluates DB_PATH at import time, so we must set these
# before pytest collection imports any test modules that touch db.
import os
os.environ["EMILIA_DB_PATH"] = "/tmp/emilia_test.db"
os.environ["EMILIA_SEED_DATA"] = "0"
os.environ.setdefault("CLAWDBOT_TOKEN", "test-token-for-testing")
os.environ.setdefault("AUTH_ALLOW_DEV_TOKEN", "1")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-elevenlabs-key")
# === END ENV SETUP ===

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure backend/ is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
async def test_client():
    import httpx
    from httpx import ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer emilia-dev-token-2026"}


@pytest.fixture
def mock_httpx_client():
    with patch("httpx.AsyncClient") as mock:
        yield mock
