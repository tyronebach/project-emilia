from __future__ import annotations

from services.emotion_runtime import _lerp, _resolve_reanchor_alpha


def test_lerp_math():
    assert _lerp(0.0, 1.0, 0.25) == 0.25
    assert _lerp(1.0, 0.0, 0.5) == 0.5


def test_reanchor_alpha_short_vs_long(monkeypatch):
    monkeypatch.setattr("config.settings.emotion_reanchor_alpha_short_gap", 0.2)
    monkeypatch.setattr("config.settings.emotion_reanchor_alpha_long_gap", 0.7)
    monkeypatch.setattr("config.settings.emotion_reanchor_long_gap_hours", 24)

    assert _resolve_reanchor_alpha(10.0) == 0.2
    assert _resolve_reanchor_alpha(24 * 3600 + 1) == 0.7
