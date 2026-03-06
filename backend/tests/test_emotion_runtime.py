from __future__ import annotations

import json
import uuid

import pytest

from db.connection import get_db
from db.repositories import EmotionalStateRepository
from services.emotion_runtime import process_emotion_post_llm, process_emotion_pre_llm

pytestmark = pytest.mark.anyio


class _DummyLock:
    def __init__(self) -> None:
        self.released = False

    def acquire(self, timeout: float | None = None) -> bool:
        return True

    def release(self) -> None:
        self.released = True


def _seed_agent(agent_id: str, *, baseline_v: float, baseline_a: float, baseline_d: float) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO agents (
                   id, display_name, provider,
                   baseline_valence, baseline_arousal, baseline_dominance,
                   emotional_profile
               ) VALUES (?, ?, 'native', ?, ?, ?, '{}')""",
            (agent_id, f"Agent-{agent_id}", baseline_v, baseline_a, baseline_d),
        )


async def test_process_emotion_pre_llm_resets_weather_on_new_session_and_keeps_relationship(monkeypatch) -> None:
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    _seed_agent(agent_id, baseline_v=0.35, baseline_a=-0.15, baseline_d=0.22)

    EmotionalStateRepository.get_or_create(user_id, agent_id)
    EmotionalStateRepository.update(
        user_id,
        agent_id,
        increment_interaction=False,
        valence=-0.9,
        arousal=0.8,
        dominance=0.7,
        trust=0.41,
        attachment=0.66,
        mood_weights={"snarky": 9.0},
        session_id="session-old",
    )

    import services.emotion_runtime as emotion_runtime

    monkeypatch.setattr(emotion_runtime.EmotionEngine, "detect_triggers", lambda *_args, **_kwargs: [])

    _context, triggers = await process_emotion_pre_llm(
        user_id,
        agent_id,
        "hello",
        session_id="session-new",
    )

    row = EmotionalStateRepository.get(user_id, agent_id)
    assert row is not None
    assert triggers == []

    # P013 weather reset behavior
    assert row["valence"] == pytest.approx(0.35, abs=0.01)
    assert row["arousal"] == pytest.approx(-0.15, abs=0.01)
    assert row["dominance"] == pytest.approx(0.22, abs=0.01)

    # Relationship dimensions persist across session resets.
    assert row["trust"] == pytest.approx(0.41, abs=0.001)
    assert row["attachment"] == pytest.approx(0.66, abs=0.001)

    # Mood weights are not persisted in the active runtime path.
    assert EmotionalStateRepository.parse_mood_weights(row) == {}


async def test_process_emotion_pre_llm_clears_legacy_mood_weights_even_without_session_boundary(monkeypatch) -> None:
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    agent_id = f"agent-{uuid.uuid4().hex[:8]}"
    _seed_agent(agent_id, baseline_v=0.1, baseline_a=0.0, baseline_d=0.0)

    EmotionalStateRepository.get_or_create(user_id, agent_id)
    EmotionalStateRepository.update(
        user_id,
        agent_id,
        increment_interaction=False,
        mood_weights={"supportive": 12.0},
        session_id="steady-session",
    )

    import services.emotion_runtime as emotion_runtime

    monkeypatch.setattr(emotion_runtime.EmotionEngine, "detect_triggers", lambda *_args, **_kwargs: [])

    await process_emotion_pre_llm(
        user_id,
        agent_id,
        "all good",
        session_id="steady-session",
    )

    row = EmotionalStateRepository.get(user_id, agent_id)
    assert row is not None
    assert EmotionalStateRepository.parse_mood_weights(row) == {}


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
