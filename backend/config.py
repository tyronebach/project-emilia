"""Application configuration from environment variables."""
import os


class Settings:
    """Application settings from environment variables."""

    def __init__(self):
        def _env_bool(name: str, default: str) -> bool:
            return os.getenv(name, default).strip().lower() not in {"0", "false", "no", "off"}

        def _env_float(name: str, default: str) -> float:
            raw = os.getenv(name, default)
            try:
                return float(raw)
            except (TypeError, ValueError):
                return float(default)

        # Service URLs
        self.stt_service_url: str = os.getenv("STT_SERVICE_URL", "http://192.168.88.252:8765")
        self.clawdbot_url: str = os.getenv("CLAWDBOT_URL", "http://127.0.0.1:18789")
        self.clawdbot_token: str = os.getenv("CLAWDBOT_TOKEN", "")
        self.openclaw_gateway_url: str = os.getenv("OPENCLAW_GATEWAY_URL", "").strip()

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
        self.tts_cache_enabled: bool = _env_bool("TTS_CACHE_ENABLED", "1")
        self.tts_cache_ttl_seconds: int = int(os.getenv("TTS_CACHE_TTL_SECONDS", "604800"))
        self.tts_cache_max_entries: int = int(os.getenv("TTS_CACHE_MAX_ENTRIES", "200"))

        # Chat
        self.chat_history_limit: int = int(os.getenv("CHAT_HISTORY_LIMIT", "20"))

        # Memory proactive recall
        self.memory_autorecall_enabled: bool = _env_bool("MEMORY_AUTORECALL_ENABLED", "0")
        self.memory_autorecall_score_threshold: float = float(os.getenv("MEMORY_AUTORECALL_SCORE_THRESHOLD", "0.86"))
        self.memory_autorecall_max_items: int = int(os.getenv("MEMORY_AUTORECALL_MAX_ITEMS", "2"))
        self.memory_autorecall_max_chars: int = int(os.getenv("MEMORY_AUTORECALL_MAX_CHARS", "420"))
        self.memory_autorecall_runtime_trigger_enabled: bool = _env_bool(
            "MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED", "0"
        )

        # Memory auto-capture
        self.memory_autocapture_enabled: bool = _env_bool("MEMORY_AUTOCAPTURE_ENABLED", "0")
        self.memory_autocapture_max_items_per_day: int = int(os.getenv("MEMORY_AUTOCAPTURE_MAX_ITEMS_PER_DAY", "8"))
        self.memory_autocapture_min_confidence: float = float(os.getenv("MEMORY_AUTOCAPTURE_MIN_CONFIDENCE", "0.82"))

        # Emotion engine
        self.trigger_classifier_enabled: bool = _env_bool("TRIGGER_CLASSIFIER_ENABLED", "1")
        self.emotion_trigger_calibration_enabled: bool = _env_bool(
            "EMOTION_TRIGGER_CALIBRATION_ENABLED", "1"
        )
        self.trigger_classifier_confidence: float = max(
            0.0,
            min(1.0, _env_float("TRIGGER_CLASSIFIER_CONFIDENCE", "0.25")),
        )
        self.sarcasm_mitigation_enabled: bool = _env_bool("SARCASM_MITIGATION_ENABLED", "1")
        self.sarcasm_positive_dampen_factor: float = max(
            0.0,
            min(1.0, _env_float("SARCASM_POSITIVE_DAMPEN_FACTOR", "0.35")),
        )
        self.sarcasm_recent_negative_dampen_factor: float = max(
            0.0,
            min(1.0, _env_float("SARCASM_RECENT_NEGATIVE_DAMPEN_FACTOR", "0.6")),
        )
        self.sarcasm_recent_positive_threshold: float = max(
            0.0,
            min(1.0, _env_float("SARCASM_RECENT_POSITIVE_THRESHOLD", "0.45")),
        )

        # Games rollout cohort
        self.games_v2_agent_allowlist: set[str] = {
            agent_id.strip()
            for agent_id in os.getenv("GAMES_V2_AGENT_ALLOWLIST", "").split(",")
            if agent_id.strip()
        }

        # Session compaction (Phase 3.1)
        self.compact_threshold: int = int(os.getenv("COMPACT_THRESHOLD", "25"))
        self.compact_keep_recent: int = int(os.getenv("COMPACT_KEEP_RECENT", "10"))
        self.compact_model: str = os.getenv("COMPACT_MODEL", "gpt-4o-mini")
        self.compaction_persona_mode: str = os.getenv("COMPACTION_PERSONA_MODE", "dm_only").strip().lower()
        self.compaction_texture_max_lines: int = int(os.getenv("COMPACTION_TEXTURE_MAX_LINES", "6"))
        self.compaction_open_threads_max: int = int(os.getenv("COMPACTION_OPEN_THREADS_MAX", "5"))
        self.soul_sim_judge_model: str = os.getenv("SOUL_SIM_JUDGE_MODEL", "gpt-5-mini")

        # SOUL simulator
        self.soul_sim_persona_model: str = os.getenv(
            "SOUL_SIM_PERSONA_MODEL", "gpt-5-mini"
        )
        self.soul_sim_max_turns: int = int(os.getenv("SOUL_SIM_MAX_TURNS", "8"))

        # Direct chat mode (OpenAI-compatible endpoint)
        self.direct_default_model: str = os.getenv(
            "DIRECT_DEFAULT_MODEL", "openai-codex/gpt-5.1-codex-mini"
        )
        self.openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
        self.openai_api_base: str = os.getenv(
            "OPENAI_API_BASE", "https://api.openai.com/v1"
        )

        # Standalone memory engine
        self.emilia_embed_provider: str = os.getenv("EMILIA_EMBED_PROVIDER", "ollama").strip().lower()
        self.emilia_embed_model: str = os.getenv("EMILIA_EMBED_MODEL", "mxbai-embed-large").strip()
        self.emilia_embed_base_url: str = os.getenv(
            "EMILIA_EMBED_BASE_URL", "http://localhost:11434"
        ).strip().rstrip("/")

        # Memory auto-capture extractor (Phase 5 target)
        self.memory_autocapture_model: str = os.getenv(
            "MEMORY_AUTOCAPTURE_MODEL",
            self.direct_default_model,
        ).strip()
        self.memory_autocapture_timeout_s: float = max(
            1.0,
            _env_float("MEMORY_AUTOCAPTURE_TIMEOUT_S", "8.0"),
        )
        self.memory_autocapture_max_candidates: int = max(
            1,
            int(os.getenv("MEMORY_AUTOCAPTURE_MAX_CANDIDATES", "4")),
        )

        self.direct_tool_max_steps: int = int(os.getenv("DIRECT_TOOL_MAX_STEPS", "6"))
        self.gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")

        # Webapp defaults
        self.default_timezone: str = os.getenv("DEFAULT_TIMEZONE", "America/Vancouver")

        # Dreams v2
        self.dream_context_max_messages: int = int(os.getenv("DREAM_CONTEXT_MAX_MESSAGES", "60"))
        self.dream_include_room_summary: bool = _env_bool("DREAM_INCLUDE_ROOM_SUMMARY", "1")
        self.dream_include_memory_hits: bool = _env_bool("DREAM_INCLUDE_MEMORY_HITS", "1")
        self.dream_memory_hits_max: int = int(os.getenv("DREAM_MEMORY_HITS_MAX", "3"))
        self.dream_lived_experience_max_chars: int = int(os.getenv("DREAM_LIVED_EXPERIENCE_MAX_CHARS", "2400"))
        self.dream_negative_event_cooldown_hours: int = int(os.getenv("DREAM_NEGATIVE_EVENT_COOLDOWN_HOURS", "12"))

        # Emotion re-anchor
        self.emotion_session_reanchor_mode: str = os.getenv("EMOTION_SESSION_REANCHOR_MODE", "soft").strip().lower()
        self.emotion_reanchor_alpha_short_gap: float = float(os.getenv("EMOTION_REANCHOR_ALPHA_SHORT_GAP", "0.25"))
        self.emotion_reanchor_alpha_long_gap: float = float(os.getenv("EMOTION_REANCHOR_ALPHA_LONG_GAP", "0.60"))
        self.emotion_reanchor_long_gap_hours: int = int(os.getenv("EMOTION_REANCHOR_LONG_GAP_HOURS", "24"))

        # Validation
        if self.emilia_embed_provider not in {"ollama", "gemini"}:
            raise RuntimeError(
                "EMILIA_EMBED_PROVIDER must be one of: ollama, gemini"
            )
        if not self.emilia_embed_model:
            raise RuntimeError("EMILIA_EMBED_MODEL must be set")
        if self.emilia_embed_provider == "ollama" and not self.emilia_embed_base_url:
            raise RuntimeError("EMILIA_EMBED_BASE_URL must be set for Ollama embeddings")
        if self.emilia_embed_provider == "gemini" and not self.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required when EMILIA_EMBED_PROVIDER=gemini")
        if self.compaction_persona_mode not in {"off", "dm_only", "all"}:
            raise RuntimeError("COMPACTION_PERSONA_MODE must be one of: off, dm_only, all")
        if self.emotion_session_reanchor_mode not in {"hard", "soft"}:
            raise RuntimeError("EMOTION_SESSION_REANCHOR_MODE must be one of: hard, soft")

    def is_games_v2_enabled_for_agent(self, agent_id: str | None) -> bool:
        """Return whether Games V2 is enabled for a given agent cohort."""
        if not self.games_v2_agent_allowlist:
            return True
        if not agent_id:
            return False
        return agent_id in self.games_v2_agent_allowlist

    @property
    def is_openclaw_configured(self) -> bool:
        """Return whether OpenClaw-specific routes/features are configured."""
        return bool(self.openclaw_gateway_url)


# Global settings instance
settings = Settings()
