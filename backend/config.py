"""Application configuration from environment variables."""
import os
from pathlib import Path


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

        if self.auth_allow_dev_token and not self.auth_token:
            self.auth_token = "emilia-dev-token-2026"

        # CORS
        allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
        self.allowed_origins: list[str] = [
            origin.strip() for origin in allowed_origins_str.split(",")
        ]

        # TTS Configuration
        self.elevenlabs_api_key: str | None = os.getenv("ELEVENLABS_API_KEY")
        self.elevenlabs_voice_id: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        self.elevenlabs_model: str = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")
        self.tts_cache_enabled: bool = os.getenv("TTS_CACHE_ENABLED", "1").lower() not in {"0", "false", "no"}
        self.tts_cache_ttl_seconds: int = int(os.getenv("TTS_CACHE_TTL_SECONDS", "604800"))
        self.tts_cache_max_entries: int = int(os.getenv("TTS_CACHE_MAX_ENTRIES", "200"))

        # Chat
        self.chat_history_limit: int = int(os.getenv("CHAT_HISTORY_LIMIT", "20"))

        # Emotion engine
        self.trigger_classifier_enabled: bool = os.getenv(
            "TRIGGER_CLASSIFIER_ENABLED", "1"
        ) == "1"
        self.trigger_classifier_confidence: float = float(
            os.getenv("TRIGGER_CLASSIFIER_CONFIDENCE", "0.25")
        )
        self.trigger_classifier_llm_fallback: bool = os.getenv(
            "LLM_TRIGGER_DETECTION", "0"
        ) == "1"
        # Backward-compatible alias used in existing router paths.
        self.llm_trigger_detection: bool = self.trigger_classifier_llm_fallback

        # Games rollout cohort
        self.games_v2_agent_allowlist: set[str] = {
            agent_id.strip()
            for agent_id in os.getenv("GAMES_V2_AGENT_ALLOWLIST", "").split(",")
            if agent_id.strip()
        }

        # Session compaction (Phase 3.1)
        self.compact_threshold: int = int(os.getenv("COMPACT_THRESHOLD", "25"))
        self.compact_keep_recent: int = int(os.getenv("COMPACT_KEEP_RECENT", "10"))
        self.compact_model: str = os.getenv("COMPACT_MODEL", "openai/gpt-4o-mini")

        # Paths
        agents_dir_str = os.getenv("CLAWDBOT_AGENTS_DIR", "/home/tbach/.openclaw/agents")
        self.clawdbot_agents_dir: Path = Path(agents_dir_str)

        # Validation
        if not self.clawdbot_token:
            raise RuntimeError("Missing CLAWDBOT_TOKEN env var")

    def is_games_v2_enabled_for_agent(self, agent_id: str | None) -> bool:
        """Return whether Games V2 is enabled for a given agent cohort."""
        if not self.games_v2_agent_allowlist:
            return True
        if not agent_id:
            return False
        return agent_id in self.games_v2_agent_allowlist


# Global settings instance
settings = Settings()
