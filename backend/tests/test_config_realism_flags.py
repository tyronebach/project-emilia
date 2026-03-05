from __future__ import annotations

from config import settings


def test_realism_flag_defaults_are_present():
    assert settings.compaction_persona_mode in {"off", "dm_only", "all"}
    assert settings.emotion_session_reanchor_mode in {"hard", "soft"}
    assert settings.memory_autorecall_max_items >= 1
    assert settings.dream_context_max_messages >= 1


def test_emotion_runtime_flags_are_config_backed():
    assert isinstance(settings.trigger_classifier_enabled, bool)
    assert 0.0 <= settings.trigger_classifier_confidence <= 1.0
    assert isinstance(settings.sarcasm_mitigation_enabled, bool)
    assert 0.0 <= settings.sarcasm_positive_dampen_factor <= 1.0
    assert 0.0 <= settings.sarcasm_recent_negative_dampen_factor <= 1.0
    assert 0.0 <= settings.sarcasm_recent_positive_threshold <= 1.0


def test_legacy_trigger_aliases_removed():
    assert not hasattr(settings, "trigger_classifier_llm_fallback")
    assert not hasattr(settings, "llm_trigger_detection")
