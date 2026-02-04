"""
Application configuration from environment variables.
Uses Pydantic for validation and type safety.
"""
import os
from pathlib import Path
from typing import List


class Settings:
    """Application settings from environment variables."""

    def __init__(self):
        # Service URLs
        self.stt_service_url: str = os.getenv("STT_SERVICE_URL", "http://192.168.88.252:8765")
        self.clawdbot_url: str = os.getenv("CLAWDBOT_URL", "http://127.0.0.1:18789")
        self.clawdbot_token: str = os.getenv("CLAWDBOT_TOKEN", "")

        # Auth
        self.auth_allow_dev_token: bool = os.getenv("AUTH_ALLOW_DEV_TOKEN", "0") == "1"
        self.auth_token: str | None = os.getenv("AUTH_TOKEN")

        # Handle dev token
        if self.auth_allow_dev_token and not self.auth_token:
            self.auth_token = "emilia-dev-token-2026"

        # CORS
        allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
        self.allowed_origins: List[str] = [
            origin.strip() for origin in allowed_origins_str.split(",")
        ]

        # TTS Configuration
        self.elevenlabs_api_key: str | None = os.getenv("ELEVENLABS_API_KEY")
        self.elevenlabs_voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        self.elevenlabs_model: str = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")

        # Paths
        agents_dir_str = os.getenv("CLAWDBOT_AGENTS_DIR", "/home/tbach/.openclaw/agents")
        self.clawdbot_agents_dir: Path = Path(agents_dir_str)

        # Validation
        if not self.clawdbot_token:
            raise RuntimeError("Missing CLAWDBOT_TOKEN env var")


# Global settings instance
settings = Settings()
