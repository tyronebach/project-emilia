from __future__ import annotations

from config import settings


def test_realism_flag_defaults_are_present():
    assert settings.compaction_persona_mode in {"off", "dm_only", "all"}
    assert settings.emotion_session_reanchor_mode in {"hard", "soft"}
    assert settings.memory_autorecall_max_items >= 1
    assert settings.dream_context_max_messages >= 1
