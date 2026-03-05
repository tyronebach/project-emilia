from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.room_chat import (
    has_workspace,
    prepare_agent_turn_context,
    schedule_post_llm_tasks,
)


pytestmark = pytest.mark.anyio


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, False),
        ("", False),
        ("   ", False),
        ("/tmp/workspace", True),
        (" /tmp/workspace ", True),
        (123, False),
    ],
)
def test_has_workspace(value: object, expected: bool) -> None:
    assert has_workspace(value) is expected


@patch("services.room_chat.build_room_llm_messages")
@patch("services.room_chat.RoomMessageRepository.get_agent_reply_count")
async def test_prepare_agent_turn_context_injects_context_and_logs_metric(
    mock_get_agent_reply_count: MagicMock,
    mock_build_room_llm_messages: MagicMock,
) -> None:
    mock_get_agent_reply_count.return_value = 0
    mock_build_room_llm_messages.return_value = [{"role": "user", "content": "hello"}]

    build_first_turn_context_fn = MagicMock(return_value="FIRST TURN")
    process_emotion_pre_llm_fn = AsyncMock(return_value=("EMOTION", [("trust", 0.7)]))
    build_top_of_mind_context_fn = AsyncMock(return_value="memory\n- [score 0.9] note")
    log_metric_fn = MagicMock()

    prepared = await prepare_agent_turn_context(
        room_id="room-1",
        user_id="user-1",
        agent={"agent_id": "agent-1"},
        room_agents=[{"agent_id": "agent-1"}],
        user_message="hello",
        runtime_trigger=False,
        game_context={"game_id": "game-1"},
        chat_history_limit=30,
        agent_workspace_value=" /tmp/workspace ",
        build_first_turn_context_fn=build_first_turn_context_fn,
        process_emotion_pre_llm_fn=process_emotion_pre_llm_fn,
        build_top_of_mind_context_fn=build_top_of_mind_context_fn,
        is_games_v2_enabled_for_agent_fn=lambda _agent_id: False,
        log_metric_fn=log_metric_fn,
        logger_obj=object(),
    )

    assert prepared.agent_id == "agent-1"
    assert prepared.workspace == "/tmp/workspace"
    assert prepared.effective_game_context is None
    assert prepared.emotional_context == "EMOTION"
    assert prepared.pre_llm_triggers == [("trust", 0.7)]
    assert prepared.llm_messages[0] == {"role": "system", "content": "memory\n- [score 0.9] note"}
    assert prepared.llm_messages[1]["role"] == "user"
    assert prepared.llm_messages[1]["content"] == "FIRST TURN\n\nhello"
    process_emotion_pre_llm_fn.assert_awaited_once_with(
        "user-1",
        "agent-1",
        "hello",
        "room:room-1",
    )
    build_first_turn_context_fn.assert_called_once_with(
        "user-1",
        "agent-1",
        agent_workspace="/tmp/workspace",
    )
    assert log_metric_fn.call_args.kwargs["hit_count"] == 1
    assert log_metric_fn.call_args.kwargs["injected_chars"] == len("memory\n- [score 0.9] note")


def test_schedule_post_llm_tasks_schedules_emotion_memory_and_milestones() -> None:
    spawned: list[object] = []

    def _spawn(task: object) -> None:
        spawned.append(task)

    def _to_thread(fn, *args, **kwargs):  # noqa: ANN001
        return ("to_thread", fn, args, kwargs)

    process_emotion_post_llm_fn = MagicMock()
    maybe_autocapture_memory_fn = MagicMock(return_value="autocapture-task")
    ensure_workspace_milestones_fn = MagicMock()
    emotional_state_get_or_create_fn = MagicMock(return_value={"interaction_count": "4"})
    ctx_value_fn = MagicMock(return_value=" game-7 ")

    schedule_post_llm_tasks(
        room_id="room-1",
        user_id="user-1",
        agent_id="agent-1",
        behavior={"intent": "care"},
        pre_llm_triggers=[("warmth", 0.5)],
        runtime_trigger=False,
        workspace="/tmp/workspace",
        effective_game_context={"game_id": "game-7"},
        autocapture_user_message="hello",
        agent_response="hi there",
        process_emotion_post_llm_fn=process_emotion_post_llm_fn,
        maybe_autocapture_memory_fn=maybe_autocapture_memory_fn,
        ensure_workspace_milestones_fn=ensure_workspace_milestones_fn,
        emotional_state_get_or_create_fn=emotional_state_get_or_create_fn,
        ctx_value_fn=ctx_value_fn,
        spawn_background_fn=_spawn,
        to_thread_fn=_to_thread,
    )

    assert len(spawned) == 3
    assert spawned[0][1] is process_emotion_post_llm_fn
    assert spawned[0][2][5] == "hello"
    assert spawned[1] == "autocapture-task"
    assert spawned[2][1] is ensure_workspace_milestones_fn
    assert spawned[2][3]["interaction_count"] == 4
    assert spawned[2][3]["game_id"] == "game-7"
    maybe_autocapture_memory_fn.assert_called_once_with(
        workspace="/tmp/workspace",
        agent_id="agent-1",
        user_id="user-1",
        user_message="hello",
        agent_response="hi there",
    )


def test_schedule_post_llm_tasks_without_workspace_only_schedules_emotion() -> None:
    spawned: list[object] = []

    def _spawn(task: object) -> None:
        spawned.append(task)

    def _to_thread(fn, *args, **kwargs):  # noqa: ANN001
        return ("to_thread", fn, args, kwargs)

    maybe_autocapture_memory_fn = MagicMock(return_value="autocapture-task")

    schedule_post_llm_tasks(
        room_id="room-2",
        user_id="user-2",
        agent_id="agent-2",
        behavior={},
        pre_llm_triggers=[],
        runtime_trigger=True,
        workspace=None,
        effective_game_context=None,
        autocapture_user_message=None,
        agent_response="ok",
        process_emotion_post_llm_fn=MagicMock(),
        maybe_autocapture_memory_fn=maybe_autocapture_memory_fn,
        ensure_workspace_milestones_fn=MagicMock(),
        emotional_state_get_or_create_fn=MagicMock(),
        ctx_value_fn=MagicMock(),
        spawn_background_fn=_spawn,
        to_thread_fn=_to_thread,
    )

    assert len(spawned) == 1
    maybe_autocapture_memory_fn.assert_not_called()
