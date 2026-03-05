from __future__ import annotations

import json

import pytest

from services.emotion_runtime import process_emotion_post_llm, process_emotion_pre_llm

pytestmark = pytest.mark.anyio


class _DummyLock:
    def __init__(self) -> None:
        self.released = False

    def acquire(self, timeout: float | None = None) -> bool:
        return True

    def release(self) -> None:
        self.released = True


async def test_process_emotion_pre_llm_degrades_on_data_error(monkeypatch, caplog) -> None:
    import services.emotion_runtime as emotion_runtime

    lock = _DummyLock()
    monkeypatch.setattr(emotion_runtime, "get_emotion_lock", lambda _u, _a: lock)
    monkeypatch.setattr(
        emotion_runtime.EmotionalStateRepository,
        "get_or_create",
        lambda _u, _a: (_ for _ in ()).throw(TypeError("bad emotional row")),
    )

    caplog.set_level("ERROR", logger="services.emotion_runtime")
    context, triggers = await process_emotion_pre_llm("user-1", "agent-1", "hello")

    assert context is None
    assert triggers == []
    assert lock.released is True
    assert "Emotion pre-LLM degraded due to data error" in caplog.text
    assert "error_type=TypeError" in caplog.text


async def test_process_emotion_pre_llm_propagates_structural_error(monkeypatch) -> None:
    import services.emotion_runtime as emotion_runtime

    lock = _DummyLock()
    monkeypatch.setattr(emotion_runtime, "get_emotion_lock", lambda _u, _a: lock)
    monkeypatch.setattr(
        emotion_runtime.EmotionalStateRepository,
        "get_or_create",
        lambda _u, _a: (_ for _ in ()).throw(RuntimeError("schema drift")),
    )

    with pytest.raises(RuntimeError, match="schema drift"):
        await process_emotion_pre_llm("user-1", "agent-1", "hello")

    assert lock.released is True


def test_process_emotion_post_llm_degrades_on_data_error(monkeypatch, caplog) -> None:
    import services.emotion_runtime as emotion_runtime

    lock = _DummyLock()
    monkeypatch.setattr(emotion_runtime, "get_emotion_lock", lambda _u, _a: lock)
    monkeypatch.setattr(
        emotion_runtime.EmotionalStateRepository,
        "get_or_create",
        lambda _u, _a: (_ for _ in ()).throw(json.JSONDecodeError("bad json", "x", 0)),
    )

    caplog.set_level("ERROR", logger="services.emotion_runtime")
    process_emotion_post_llm(
        "user-1",
        "agent-1",
        {"mood": "happy", "mood_intensity": 1.0},
    )

    assert lock.released is True
    assert "Emotion post-LLM degraded due to data error" in caplog.text
    assert "error_type=JSONDecodeError" in caplog.text


def test_process_emotion_post_llm_propagates_structural_error(monkeypatch) -> None:
    import services.emotion_runtime as emotion_runtime

    lock = _DummyLock()
    monkeypatch.setattr(emotion_runtime, "get_emotion_lock", lambda _u, _a: lock)
    monkeypatch.setattr(
        emotion_runtime.EmotionalStateRepository,
        "get_or_create",
        lambda _u, _a: (_ for _ in ()).throw(RuntimeError("db offline")),
    )

    with pytest.raises(RuntimeError, match="db offline"):
        process_emotion_post_llm(
            "user-1",
            "agent-1",
            {"mood": "happy", "mood_intensity": 1.0},
        )

    assert lock.released is True
