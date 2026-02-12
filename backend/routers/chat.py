"""Chat and media routes (chat, transcribe, speak)"""
import asyncio
import time
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
import httpx
from fastapi import APIRouter, UploadFile, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from dependencies import verify_token, get_user_id, get_agent_id, get_optional_agent_id, get_session_id
from schemas import ChatRequest, SpeakRequest
from config import settings
from core.exceptions import TTSError, not_found, forbidden, service_unavailable, timeout_error
from parse_chat import parse_chat_completion, extract_avatar_commands, coalesce_response_text
from db.repositories import (
    UserRepository,
    AgentRepository,
    SessionRepository,
    MessageRepository,
    EmotionalStateRepository,
    GameRepository,
)
from services.emotion_engine import (
    EmotionEngine, EmotionalState, AgentProfile,
    normalize_trigger, ContextualTriggerCalibration,
    infer_outcome_multisignal, CalibrationRecovery, CONFIDENCE_THRESHOLD,
)
from services.direct_llm import (
    DirectLLMClient,
    normalize_chat_mode,
    normalize_messages_for_direct,
    prepend_workspace_soul,
    resolve_direct_api_base,
    resolve_direct_model,
)
from services.direct_tool_runtime import run_tool_loop
from services.soul_window_service import get_mood_snapshot
from services.workspace_events import WorkspaceEventsService

logger = logging.getLogger(__name__)

# Per-user-agent lock to serialize emotional state read-modify-write (C3 fix)
_emotion_locks: dict[tuple[str, str], threading.Lock] = {}
_emotion_locks_guard = threading.Lock()


def _get_emotion_lock(user_id: str, agent_id: str) -> threading.Lock:
    """Get or create a per-user-agent lock for emotional state serialization."""
    key = (user_id, agent_id)
    if key not in _emotion_locks:
        with _emotion_locks_guard:
            if key not in _emotion_locks:
                _emotion_locks[key] = threading.Lock()
    return _emotion_locks[key]


async def _process_emotion_pre_llm(
    user_id: str, agent_id: str, user_message: str, session_id: str | None = None
) -> tuple[str | None, list[tuple[str, float]]]:
    """
    Process emotional state BEFORE LLM call.

    1. Load/create emotional state
    2. Apply time-based decay
    3. Detect triggers from user message (LLM or regex)
    4. Apply trigger deltas
    5. Return emotional context block for prompt injection

    Returns (context_block, detected_triggers).
    """
    try:
        lock = _get_emotion_lock(user_id, agent_id)
        if not lock.acquire(timeout=5.0):
            logger.warning("Emotion lock timeout for %s", (user_id, agent_id))
            return None, []
        try:
            # Load state and profile
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            profile_data = EmotionalStateRepository.get_agent_profile(agent_id)

            # Get agent baseline from DB
            agent = AgentRepository.get_by_id(agent_id)
            if not agent:
                return None, []

            # Build profile from DB (emotional_profile column has all settings)
            profile = AgentProfile.from_db(agent, profile_data)

            engine = EmotionEngine(profile)

            # Convert DB row to EmotionalState
            # Load persisted mood_weights from DB, or initialize from agent's mood_baseline
            mood_weights = EmotionalStateRepository.parse_mood_weights(state_row)

            # FIX: Initialize mood_weights from mood_baseline if empty (Bug #1)
            if not mood_weights:
                from services.emotion_engine import get_mood_list
                mood_weights = {mood: profile.mood_baseline.get(mood, 0) for mood in get_mood_list()}
                logger.info("[Emotion] Initialized mood_weights from mood_baseline for %s/%s", user_id, agent_id)

            # Load V2 trigger calibration
            cal_json = {}
            raw_cal = state_row.get('trigger_calibration_json')
            if raw_cal:
                try:
                    cal_json = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
                except (json.JSONDecodeError, TypeError):
                    cal_json = {}
            calibrations: dict[str, ContextualTriggerCalibration] = {}
            for k, v in cal_json.items():
                if isinstance(v, dict):
                    calibrations[k] = ContextualTriggerCalibration.from_dict(v)

            state = EmotionalState.from_db_row(state_row, calibrations=calibrations, mood_weights=mood_weights)

            # Apply decay since last interaction
            last_updated = state_row.get('last_updated') or 0
            if last_updated:
                import time as time_module
                elapsed = time_module.time() - last_updated
                state = engine.apply_decay(state, elapsed)
                engine.apply_mood_decay(state, elapsed)

            # Classifier-based trigger detection
            normalized_user_message = (user_message or "").strip()
            recent_context_triggers = (
                EmotionalStateRepository.get_recent_trigger_labels(user_id, agent_id, limit_events=5)
                if normalized_user_message
                else []
            )
            classifier_triggers = (
                engine.detect_triggers(
                    normalized_user_message,
                    recent_context_triggers=recent_context_triggers,
                )
                if normalized_user_message
                else []
            )

            # Normalize to canonical trigger keys so designer presets always apply.
            trigger_map = {}
            for trigger, intensity in classifier_triggers:
                canonical = normalize_trigger(trigger) or trigger
                if canonical not in trigger_map or intensity > trigger_map[canonical]:
                    trigger_map[canonical] = intensity
            triggers = list(trigger_map.items())

            # Snapshot state before triggers for V2 event logging
            state_before_dict = state.to_dict()

            # Accumulate V/A deltas during trigger loop, then project onto moods
            total_va_delta = {'valence': 0.0, 'arousal': 0.0}
            for trigger, intensity in triggers:
                cal = state.trigger_calibration.get(trigger)
                deltas = engine.apply_trigger_calibrated(state, trigger, intensity, cal)
                for axis in ('valence', 'arousal'):
                    total_va_delta[axis] += deltas.get(axis, 0.0)

            if triggers:
                mood_deltas = engine.calculate_mood_deltas_from_va(total_va_delta)
                if mood_deltas:
                    engine.apply_mood_deltas(state, mood_deltas)
                    logger.debug("[Emotion] Mood deltas (V/A projected): %s", {k: round(v, 3) for k, v in mood_deltas.items() if abs(v) > 0.001})

            # Save updated state (including mood_weights + V2 dimensions)
            EmotionalStateRepository.update(
                user_id, agent_id,
                mood_weights=state.mood_weights,
                valence=state.valence,
                arousal=state.arousal,
                dominance=state.dominance,
                trust=state.trust,
                attachment=state.attachment,
                familiarity=state.familiarity,
                intimacy=state.intimacy,
                playfulness_safety=state.playfulness_safety,
                conflict_tolerance=state.conflict_tolerance,
            )

            # Generate context block for prompt
            context = engine.generate_context_block(state)
            logger.info("[Emotion] Pre-LLM context for %s/%s:\n%s", user_id, agent_id, context)
            return context, triggers
        finally:
            lock.release()

    except Exception:
        logger.exception("Emotion engine error (pre-LLM), continuing without emotional context")
        return None, []


def _process_emotion_post_llm(
    user_id: str,
    agent_id: str,
    behavior: dict,
    session_id: str | None = None,
    pre_llm_triggers: list[tuple[str, float]] | None = None,
    user_message: str | None = None,
) -> None:
    """
    Process emotional state AFTER LLM response.

    1. Apply mood shifts from agent's behavior tags.
    2. V2: Infer outcome from multiple signals.
    3. V2: Learn from outcome (update trigger calibrations).
    4. V2: Update relationship dimensions.
    """
    try:
        if not behavior:
            return

        lock = _get_emotion_lock(user_id, agent_id)
        if not lock.acquire(timeout=5.0):
            logger.warning("Emotion lock timeout for %s", (user_id, agent_id))
            return
        try:
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
            agent = AgentRepository.get_by_id(agent_id)

            if not agent:
                return

            profile = AgentProfile.from_db(agent, profile_data)
            engine = EmotionEngine(profile)

            # Load state with V2 fields
            cal_json = {}
            raw_cal = state_row.get('trigger_calibration_json')
            if raw_cal:
                try:
                    cal_json = json.loads(raw_cal) if isinstance(raw_cal, str) else raw_cal
                except (json.JSONDecodeError, TypeError):
                    cal_json = {}
            calibrations: dict[str, ContextualTriggerCalibration] = {}
            for k, v in cal_json.items():
                if isinstance(v, dict):
                    calibrations[k] = ContextualTriggerCalibration.from_dict(v)

            state = EmotionalState.from_db_row(state_row, calibrations=calibrations)

            state_before_dict = state.to_dict()

            # 1. Apply mood self-report trigger (existing behavior)
            mood = behavior.get('mood')
            mood_to_trigger = {
                'happy': ('joy', 0.3),
                'sad': ('sadness', 0.3),
                'angry': ('anger', 0.2),
                'embarrassed': ('embarrassment', 0.2),
                'excited': ('excitement', 0.4),
            }

            if mood and mood in mood_to_trigger:
                trigger, intensity = mood_to_trigger[mood]
                intensity *= behavior.get('mood_intensity', 1.0)
                engine.apply_trigger(state, trigger, intensity)

            # 2. V2: Infer outcome from multiple signals
            outcome, confidence = infer_outcome_multisignal(
                next_user_message=user_message,
                agent_behavior=behavior,
            )

            # 3. V2: Learn from outcome (update trigger calibrations)
            calibration_updates: dict[str, dict] = {}
            if pre_llm_triggers and outcome != "neutral":
                updated = engine.learn_from_outcome(state, pre_llm_triggers, outcome, confidence)
                calibration_updates = {k: v.to_dict() for k, v in updated.items()}

                if calibration_updates:
                    all_cals = {
                        k: (v.to_dict() if hasattr(v, 'to_dict') else v)
                        for k, v in state.trigger_calibration.items()
                    }
                    EmotionalStateRepository.update_calibration_json(user_id, agent_id, all_cals)
                    logger.info("[Emotion] Learned from %s outcome (conf=%.2f): %s",
                                outcome, confidence, list(calibration_updates.keys()))

            # 4. V2: Update relationship dimensions
            dimension_deltas: dict[str, float] = {}
            if pre_llm_triggers:
                dimension_deltas = engine.update_relationship_dimensions(state, pre_llm_triggers, outcome)
                if dimension_deltas:
                    logger.info("[Emotion] Dimension updates: %s", dimension_deltas)

            # Save all updated state (no interaction increment — pre_llm already counted it)
            EmotionalStateRepository.update(
                user_id, agent_id,
                increment_interaction=False,
                valence=state.valence,
                arousal=state.arousal,
                intimacy=state.intimacy,
                playfulness_safety=state.playfulness_safety,
                conflict_tolerance=state.conflict_tolerance,
                trust=state.trust,
            )

            # 5. V2: Log event (always, even without triggers)
            EmotionalStateRepository.log_event_v2(
                user_id=user_id,
                agent_id=agent_id,
                session_id=session_id,
                message_snippet=user_message,
                triggers=pre_llm_triggers or [],
                state_before=state_before_dict,
                state_after=state.to_dict(),
                agent_behavior=behavior,
                outcome=outcome,
                calibration_updates=calibration_updates or None,
            )
        finally:
            lock.release()

    except Exception:
        logger.exception("Emotion engine error (post-LLM), ignoring")

router = APIRouter(prefix="/api", tags=["chat"])

# Strong references to background tasks so they don't get GC'd mid-execution.
# See: https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task
_background_tasks: set[asyncio.Task] = set()


def _spawn_background(coro) -> asyncio.Task:
    """Schedule a coroutine as a background task with a prevented GC reference."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


def _ctx_value(game_context, *keys):
    """Read a value from either dict-style or model-style game context."""
    if game_context is None:
        return None

    if isinstance(game_context, dict):
        for key in keys:
            if key in game_context:
                value = game_context.get(key)
                if value is not None:
                    return value
        return None

    for key in keys:
        if hasattr(game_context, key):
            value = getattr(game_context, key)
            if value is not None:
                return value
    return None


def _resolve_trusted_prompt_instructions(agent_id: str, game_context) -> str:
    """Resolve per-game prompt instructions from server-side registry/config."""
    game_id = _ctx_value(game_context, "game_id", "gameId")
    if not isinstance(game_id, str) or not game_id.strip():
        return ""

    effective = GameRepository.get_effective_game_for_agent(agent_id, game_id.strip())
    if not effective:
        return ""

    prompt = effective.get("prompt_override") or effective.get("prompt_instructions") or ""
    if not isinstance(prompt, str):
        return ""
    return prompt.strip()


def inject_game_context(
    message: str,
    game_context,
    prompt_instructions: str | None = None,
) -> str:
    """Append game context to the user's message for the LLM prompt."""
    if not game_context:
        return message

    game_id = _ctx_value(game_context, "game_id", "gameId") or "unknown"
    if prompt_instructions is None:
        # Backward-compatible fallback for callsites/tests that don't inject trusted prompts.
        prompt_instructions = _ctx_value(game_context, "prompt_instructions", "promptInstructions") or ""
    state = _ctx_value(game_context, "state_text", "state") or ""
    last_move = _ctx_value(game_context, "last_user_move", "lastUserMove") or ""
    avatar_move = _ctx_value(game_context, "avatar_move", "avatarMove")
    valid_moves = _ctx_value(game_context, "valid_moves", "validMoves") or []
    status = _ctx_value(game_context, "status") or "in_progress"

    # Build context block: Layer 2 (prompt instructions) + Layer 3 (game state)
    context_block = f"\n\n---\n[game: {game_id}]\n"

    if prompt_instructions:
        context_block += f"\n{prompt_instructions}\n"

    context_block += f"\n{state}\n"

    if last_move:
        context_block += f"The user just played: {last_move}\n"

    if avatar_move:
        context_block += f"You played: {avatar_move}\nReact to this game state naturally.\n"
    elif valid_moves:
        moves_str = ", ".join(str(move) for move in valid_moves[:30])
        context_block += f"It's your turn. Legal moves: {moves_str}\n"
        context_block += "Choose a move and include it as [move:your_move] in your response.\n"

    if status == "game_over":
        context_block += "The game is over. React to the outcome.\n"

    context_block += "---"

    return message + context_block


def _time_of_day_bucket_utc(now_utc: datetime) -> str:
    hour = now_utc.hour
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 22:
        return "evening"
    return "night"


def _build_first_turn_context(
    user_id: str,
    agent_id: str,
    *,
    agent_workspace: str | None,
) -> str | None:
    """Build deterministic first-turn facts block in UTC."""
    now_utc = datetime.now(timezone.utc)
    lines = [
        "Session facts (UTC):",
        f"- now_utc: {now_utc.isoformat()}",
        f"- time_of_day_utc: {_time_of_day_bucket_utc(now_utc)}",
    ]

    try:
        prior_state = EmotionalStateRepository.get(user_id, agent_id)
        last_interaction = prior_state.get("last_interaction") if prior_state else None
        if isinstance(last_interaction, (int, float)):
            days_since = max(0, int((now_utc.timestamp() - float(last_interaction)) // 86400))
            lines.append(f"- days_since_last_interaction: {days_since}")
    except Exception:
        logger.exception("Failed building first-turn interaction facts for %s/%s", user_id, agent_id)

    if agent_workspace:
        try:
            upcoming = WorkspaceEventsService.get_upcoming(
                Path(agent_workspace),
                user_id,
                agent_id,
                days=7,
                now_utc=now_utc,
            )
            if upcoming:
                lines.append("- upcoming_events_next_7_days:")
                for event in upcoming[:3]:
                    event_type = str(event.get("type") or "event")
                    event_date = str(event.get("date") or "")
                    event_note = str(event.get("note") or "").strip()
                    if event_note:
                        lines.append(f"  - {event_type} on {event_date}: {event_note}")
                    else:
                        lines.append(f"  - {event_type} on {event_date}")
        except Exception:
            logger.exception("Failed loading first-turn upcoming events for %s/%s", user_id, agent_id)

    if len(lines) <= 1:
        return None
    return "\n".join(lines)


def _ensure_workspace_milestones(
    *,
    agent_workspace: str,
    user_id: str,
    agent_id: str,
    interaction_count: int,
    runtime_trigger: bool,
    game_id: str | None,
) -> None:
    """Best-effort auto milestone persistence to workspace events file."""
    try:
        WorkspaceEventsService.ensure_auto_milestones(
            Path(agent_workspace),
            user_id,
            agent_id,
            interaction_count=interaction_count,
            runtime_trigger=runtime_trigger,
            game_id=game_id,
        )
    except Exception:
        logger.exception("Failed writing auto milestones for %s/%s", user_id, agent_id)


def _safe_get_mood_snapshot(user_id: str, agent_id: str) -> dict | None:
    """Best-effort mood snapshot for debug/UI payloads."""
    try:
        return get_mood_snapshot(user_id, agent_id)
    except Exception:
        logger.exception("Failed loading mood snapshot for %s/%s", user_id, agent_id)
        return None



def _build_llm_messages(
    session_id: str,
    current_msg: str,
    game_context,
    emotional_context: str | None = None,
    trusted_game_prompt: str = "",
    first_turn_context: str | None = None,
) -> list[dict]:
    """Build the messages array for the LLM: [summary] + recent history + current message."""
    messages: list[dict] = []

    # Prepend compacted summary as system context if available
    summary = SessionRepository.get_summary(session_id)
    if summary:
        messages.append({
            "role": "system",
            "content": f"Previous conversation summary:\n{summary}",
        })

    history = MessageRepository.get_last_n(session_id, settings.chat_history_limit)
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)

    # Build current message with contexts
    current_content = current_msg
    
    # Inject emotional context first (affects tone)
    if emotional_context:
        current_content = emotional_context + "\n\n" + current_content

    # Deterministic first-turn facts (UTC), no stylistic instructions.
    if first_turn_context:
        current_content = first_turn_context + "\n\n" + current_content
    
    # Then game context (specific to game state)
    current_content = inject_game_context(
        current_content,
        game_context,
        prompt_instructions=trusted_game_prompt,
    )
    
    messages.append({"role": "user", "content": current_content})

    return messages


async def _maybe_compact_session(session_id: str) -> dict | None:
    """Run session compaction if message count exceeds threshold.

    On failure, logs the error and continues — compaction is best-effort.
    Returns compaction metadata if compaction occurred, None otherwise.
    """
    msg_count = SessionRepository.get_message_count(session_id)
    if msg_count <= settings.compact_threshold:
        return None

    logger.info("Session %s has %d messages (threshold=%d), compacting",
                session_id, msg_count, settings.compact_threshold)

    try:
        from services.compaction import CompactionService

        all_msgs = MessageRepository.get_all_for_session(session_id)
        split_at = len(all_msgs) - settings.compact_keep_recent
        if split_at <= 0:
            return None

        old_msgs = all_msgs[:split_at]

        # Merge with existing summary if present
        existing_summary = SessionRepository.get_summary(session_id)
        to_summarize: list[dict] = []
        if existing_summary:
            to_summarize.append({"role": "system", "content": f"Prior summary: {existing_summary}"})
        to_summarize.extend({"role": m["role"], "content": m["content"]} for m in old_msgs)

        summary = await CompactionService.summarize_messages(to_summarize)

        # Persist summary and prune old messages
        SessionRepository.update_summary(session_id, summary)
        deleted = MessageRepository.delete_oldest(session_id, settings.compact_keep_recent)
        logger.info("[Compaction] Session %s: deleted %d msgs, kept %d, summary %d chars",
                     session_id, deleted, settings.compact_keep_recent, len(summary))
        logger.info("[Compaction] Summary: %s", summary[:500] + "..." if len(summary) > 500 else summary)

        return {
            "compacted": True,
            "messages_before": msg_count,
            "messages_deleted": deleted,
            "messages_kept": settings.compact_keep_recent,
            "summary_chars": len(summary),
        }

    except Exception:
        logger.exception("Compaction failed for session %s, continuing with full history", session_id)
        return {"compacted": False, "error": "Compaction failed"}


@router.post("/chat")
async def chat(
    request: ChatRequest,
    token: str = Depends(verify_token),
    stream: int = Query(0),
    user_id: str = Depends(get_user_id),
    agent_id: str = Depends(get_agent_id),
    session_id: str | None = Depends(get_session_id)
):
    start_time = time.time()

    user = UserRepository.get_by_id(user_id)
    if not user:
        raise not_found("User")

    if not UserRepository.can_access_agent(user_id, agent_id):
        raise forbidden("User cannot access this agent")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")

    clawdbot_agent_id = agent["clawdbot_agent_id"]
    agent_workspace = agent.get("workspace")

    if session_id:
        session = SessionRepository.get_by_id(session_id)
        if not session or not SessionRepository.user_can_access(user_id, session_id):
            raise forbidden("Cannot access this session")
    else:
        session = SessionRepository.get_or_create_default(user_id, agent_id)

    sid = session["id"]

    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(
                request,
                start_time,
                agent,
                clawdbot_agent_id,
                sid,
                user_id,
                agent_id,
                agent_workspace=agent_workspace,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming
    try:
        games_v2_enabled_for_agent = settings.is_games_v2_enabled_for_agent(agent_id)
        game_context = request.game_context if games_v2_enabled_for_agent else None
        runtime_trigger = bool(request.runtime_trigger) if games_v2_enabled_for_agent else False
        if not games_v2_enabled_for_agent and (request.runtime_trigger or request.game_context):
            logger.info("[Chat] Ignoring game payload because Games V2 rollout is disabled for agent %s", agent_id)
        emotion_input_message = "" if runtime_trigger else request.message
        is_first_turn = (not runtime_trigger) and (MessageRepository.get_conversation_count(sid) == 0)
        first_turn_context = (
            _build_first_turn_context(
                user_id,
                agent_id,
                agent_workspace=agent_workspace if isinstance(agent_workspace, str) else None,
            )
            if is_first_turn
            else None
        )

        # Process emotional state before LLM (detect triggers, apply decay)
        emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
            user_id, agent_id, emotion_input_message, sid
        )
        emotion_snapshot = _safe_get_mood_snapshot(user_id, agent_id)
        trusted_game_prompt = _resolve_trusted_prompt_instructions(agent_id, game_context)

        # Build messages array: raw history + current message with contexts
        messages = _build_llm_messages(
            sid,
            request.message,
            game_context,
            emotional_context,
            trusted_game_prompt=trusted_game_prompt,
            first_turn_context=first_turn_context,
        )

        # Store user/runtime trigger message BEFORE calling LLM (cleaned up on failure).
        user_origin = "game_runtime" if runtime_trigger else "user"
        user_msg = MessageRepository.add(sid, "user", request.message, origin=user_origin)
        user_msg_id = user_msg["id"]
        chat_mode = normalize_chat_mode(agent.get("chat_mode"))

        try:
            if chat_mode == "direct":
                direct_client = DirectLLMClient(
                    api_base=resolve_direct_api_base(agent),
                )
                direct_messages = prepend_workspace_soul(
                    normalize_messages_for_direct(messages),
                    agent_workspace if isinstance(agent_workspace, str) else None,
                )
                result = await run_tool_loop(
                    client=direct_client,
                    model=resolve_direct_model(agent),
                    messages=direct_messages,
                    workspace=agent_workspace if isinstance(agent_workspace, str) else None,
                    claw_agent_id=clawdbot_agent_id,
                    user_tag=f"emilia:{sid}",
                    timeout_s=60.0,
                )
            else:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{settings.clawdbot_url}/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.clawdbot_token}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": f"agent:{clawdbot_agent_id}",
                            "messages": messages,
                            "stream": False,
                            "user": f"emilia:{sid}",
                        }
                    )

                    if response.status_code != 200:
                        raise service_unavailable("Chat")
                result = response.json()
        except ValueError as exc:
            if user_msg_id:
                MessageRepository.delete_by_id(user_msg_id)
            raise HTTPException(status_code=503, detail=str(exc))
        except httpx.HTTPStatusError:
            if user_msg_id:
                MessageRepository.delete_by_id(user_msg_id)
            raise service_unavailable("Chat")
        except Exception:
            # LLM failed — remove orphaned user message
            if user_msg_id:
                MessageRepository.delete_by_id(user_msg_id)
            raise

        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)

        # Store assistant response with metadata
        behavior = parsed.get("behavior", {})
        usage = result.get("usage") or {}
        MessageRepository.add(
            sid, "assistant", parsed["response_text"],
            origin="assistant",
            model=result.get("model"),
            processing_ms=processing_ms,
            usage_prompt_tokens=usage.get("prompt_tokens"),
            usage_completion_tokens=usage.get("completion_tokens"),
            behavior_intent=behavior.get("intent"),
            behavior_mood=behavior.get("mood"),
            behavior_mood_intensity=behavior.get("mood_intensity"),
            behavior_energy=behavior.get("energy"),
            behavior_move=behavior.get("move"),
            behavior_game_action=behavior.get("game_action"),
        )

        SessionRepository.update_last_used(sid)
        SessionRepository.increment_message_count(sid)

        if isinstance(agent_workspace, str) and agent_workspace.strip():
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            interaction_count = int(state_row.get("interaction_count") or 0)
            game_id_value = _ctx_value(game_context, "game_id", "gameId")
            game_id = game_id_value.strip() if isinstance(game_id_value, str) and game_id_value.strip() else None
            _spawn_background(asyncio.to_thread(
                _ensure_workspace_milestones,
                agent_workspace=agent_workspace,
                user_id=user_id,
                agent_id=agent_id,
                interaction_count=interaction_count,
                runtime_trigger=runtime_trigger,
                game_id=game_id,
            ))

        # Process emotional state after LLM in background thread (M1 fix: avoid blocking event loop)
        _spawn_background(asyncio.to_thread(
            _process_emotion_post_llm,
            user_id, agent_id, behavior, sid,
            pre_llm_triggers, None if runtime_trigger else request.message,
        ))

        # Fire-and-forget: compact in background so response returns immediately
        _spawn_background(_maybe_compact_session(sid))

        resp = {
            "response": parsed["response_text"],
            "session_id": sid,
            "processing_ms": processing_ms,
            "model": result.get("model"),
            "behavior": behavior,
            "usage": result.get("usage"),
        }

        if emotional_context or pre_llm_triggers or emotion_snapshot:
            resp["emotion_debug"] = {
                "triggers": [[t, round(i, 3)] for t, i in pre_llm_triggers],
                "context_block": emotional_context,
                "snapshot": emotion_snapshot,
            }

        return resp

    except httpx.TimeoutException:
        raise timeout_error("Chat")
    except httpx.ConnectError:
        raise service_unavailable("Chat")


async def _stream_chat_sse(
    request: ChatRequest,
    start_time: float,
    agent: dict,
    clawdbot_agent_id: str,
    session_id: str,
    user_id: str,
    agent_id: str,
    agent_workspace: str | None = None,
):
    """SSE streaming chat"""
    try:
        games_v2_enabled_for_agent = settings.is_games_v2_enabled_for_agent(agent_id)
        game_context = request.game_context if games_v2_enabled_for_agent else None
        runtime_trigger = bool(request.runtime_trigger) if games_v2_enabled_for_agent else False
        if not games_v2_enabled_for_agent and (request.runtime_trigger or request.game_context):
            logger.info("[SSE] Ignoring game payload because Games V2 rollout is disabled for agent %s", agent_id)
        emotion_input_message = "" if runtime_trigger else request.message
        is_first_turn = (not runtime_trigger) and (MessageRepository.get_conversation_count(session_id) == 0)
        first_turn_context = (
            _build_first_turn_context(
                user_id,
                agent_id,
                agent_workspace=agent_workspace if isinstance(agent_workspace, str) else None,
            )
            if is_first_turn
            else None
        )

        # Process emotional state before LLM (detect triggers, apply decay)
        emotional_context, pre_llm_triggers = await _process_emotion_pre_llm(
            user_id, agent_id, emotion_input_message, session_id
        )
        emotion_snapshot = _safe_get_mood_snapshot(user_id, agent_id)
        trusted_game_prompt = _resolve_trusted_prompt_instructions(agent_id, game_context)

        # Build messages array: raw history + current message with contexts
        messages = _build_llm_messages(
            session_id,
            request.message,
            game_context,
            emotional_context,
            trusted_game_prompt=trusted_game_prompt,
            first_turn_context=first_turn_context,
        )

        # Store user/runtime trigger message BEFORE calling LLM (cleaned up on failure).
        user_origin = "game_runtime" if runtime_trigger else "user"
        user_msg = MessageRepository.add(session_id, "user", request.message, origin=user_origin)
        user_msg_id = user_msg["id"]

        try:
            _llm_success = False
            chat_mode = normalize_chat_mode(agent.get("chat_mode"))
            full_content = ""
            usage = None
            max_response_chars = 50_000  # Guard against runaway LLM output

            if chat_mode == "direct":
                direct_client = DirectLLMClient(
                    api_base=resolve_direct_api_base(agent),
                )
                direct_messages = prepend_workspace_soul(
                    normalize_messages_for_direct(messages),
                    agent_workspace if isinstance(agent_workspace, str) else None,
                )

                try:
                    tool_result = await run_tool_loop(
                        client=direct_client,
                        model=resolve_direct_model(agent),
                        messages=direct_messages,
                        workspace=agent_workspace if isinstance(agent_workspace, str) else None,
                        claw_agent_id=clawdbot_agent_id,
                        user_tag=f"emilia:{session_id}",
                        timeout_s=120.0,
                    )
                    usage = tool_result.get("usage")
                    choices = tool_result.get("choices", [])
                    if choices:
                        content = (choices[0].get("message") or {}).get("content", "")
                        if content:
                            full_content = content
                            yield f"data: {json.dumps({'content': content})}\n\n"
                except ValueError as exc:
                    if user_msg_id:
                        MessageRepository.delete_by_id(user_msg_id)
                    yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                    return
                except httpx.HTTPStatusError as exc:
                    if user_msg_id:
                        MessageRepository.delete_by_id(user_msg_id)
                    status_code = exc.response.status_code if exc.response else 503
                    yield f"data: {json.dumps({'error': f'API error ({status_code})'})}\n\n"
                    return
            else:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    async with client.stream(
                        "POST",
                        f"{settings.clawdbot_url}/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.clawdbot_token}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": f"agent:{clawdbot_agent_id}",
                            "messages": messages,
                            "stream": True,
                            "stream_options": {"include_usage": True},
                            "user": f"emilia:{session_id}",
                        }
                    ) as response:
                        if response.status_code != 200:
                            if user_msg_id:
                                MessageRepository.delete_by_id(user_msg_id)
                            yield f"data: {json.dumps({'error': 'API error'})}\n\n"
                            return

                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue

                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                continue

                            try:
                                data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            if "usage" in data:
                                usage = data["usage"]

                            choices = data.get("choices", [])
                            if not choices:
                                continue

                            delta = choices[0].get("delta", {})
                            chunk = delta.get("content", "")

                            if chunk:
                                full_content += chunk
                                if len(full_content) > max_response_chars:
                                    logger.warning("[SSE] Response exceeded %d chars, truncating", max_response_chars)
                                    break
                                yield f"data: {json.dumps({'content': chunk})}\n\n"

                            if choices[0].get("finish_reason"):
                                break

            # Final response - extract behavior tags from full content
            clean_full, behavior = extract_avatar_commands(full_content)
            clean_full = coalesce_response_text(clean_full, full_content)
            processing_ms = int((time.time() - start_time) * 1000)

            # Store assistant response with metadata
            usage_data = usage or {}
            MessageRepository.add(
                session_id, "assistant", clean_full,
                origin="assistant",
                model=None,
                processing_ms=processing_ms,
                usage_prompt_tokens=usage_data.get("prompt_tokens"),
                usage_completion_tokens=usage_data.get("completion_tokens"),
                behavior_intent=behavior.get("intent"),
                behavior_mood=behavior.get("mood"),
                behavior_mood_intensity=behavior.get("mood_intensity"),
                behavior_energy=behavior.get("energy"),
                behavior_move=behavior.get("move"),
                behavior_game_action=behavior.get("game_action"),
            )

            avatar_data = {}
            if behavior.get("intent"):
                avatar_data["intent"] = behavior["intent"]
            if behavior.get("mood"):
                avatar_data["mood"] = behavior["mood"]
                avatar_data["intensity"] = behavior["mood_intensity"]
            if behavior.get("energy"):
                avatar_data["energy"] = behavior["energy"]
            if behavior.get("move"):
                avatar_data["move"] = behavior["move"]
            if behavior.get("game_action"):
                avatar_data["game_action"] = behavior["game_action"]
            if avatar_data:
                yield f"event: avatar\ndata: {json.dumps(avatar_data)}\n\n"

            # Emit emotion debug info (triggers + context block + structured snapshot).
            if emotional_context or pre_llm_triggers or emotion_snapshot:
                emotion_debug = {
                    "triggers": [[t, round(i, 3)] for t, i in pre_llm_triggers],
                    "context_block": emotional_context,
                    "snapshot": emotion_snapshot,
                }
                yield f"event: emotion\ndata: {json.dumps(emotion_debug)}\n\n"

            SessionRepository.update_last_used(session_id)
            SessionRepository.increment_message_count(session_id)

            if isinstance(agent_workspace, str) and agent_workspace.strip():
                state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
                interaction_count = int(state_row.get("interaction_count") or 0)
                game_id_value = _ctx_value(game_context, "game_id", "gameId")
                game_id = (
                    game_id_value.strip()
                    if isinstance(game_id_value, str) and game_id_value.strip()
                    else None
                )
                _spawn_background(asyncio.to_thread(
                    _ensure_workspace_milestones,
                    agent_workspace=agent_workspace,
                    user_id=user_id,
                    agent_id=agent_id,
                    interaction_count=interaction_count,
                    runtime_trigger=runtime_trigger,
                    game_id=game_id,
                ))

            # Process emotional state after LLM in background thread (M1 fix)
            _spawn_background(asyncio.to_thread(
                _process_emotion_post_llm,
                user_id, agent_id, behavior, session_id,
                pre_llm_triggers, None if runtime_trigger else request.message,
            ))

            # Send done event FIRST so UI unblocks immediately
            logger.info("[SSE] Yielding done event at %dms", processing_ms)
            final = {
                "done": True,
                "response": clean_full,
                "session_id": session_id,
                "processing_ms": processing_ms,
                "behavior": behavior
            }
            if usage:
                final["usage"] = usage

            yield f"data: {json.dumps(final)}\n\n"
            logger.info("[SSE] Done event yielded, spawning background compaction")

            _llm_success = True

            # Fire-and-forget: compact in background so stream closes immediately
            _spawn_background(_maybe_compact_session(session_id))

        except Exception:
            # LLM failed — remove orphaned user message
            if not _llm_success and user_msg_id:
                MessageRepository.delete_by_id(user_msg_id)
            raise

    except Exception:
        logger.exception("Streaming error")
        yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile,
    token: str = Depends(verify_token)
):
    """Transcribe audio via STT service"""
    try:
        audio_data = await audio.read()
        content_type = audio.content_type or "audio/webm"
        filename = audio.filename or "recording.webm"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.stt_service_url}/transcribe",
                files={"audio": (filename, audio_data, content_type)}
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="STT failed")

            return response.json()

    except httpx.TimeoutException:
        raise timeout_error("STT")
    except httpx.ConnectError:
        raise service_unavailable("STT")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription error")
        raise service_unavailable("Transcription")


@router.post("/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    """Text-to-speech via ElevenLabs with-timestamps API for lip sync alignment"""
    from services.elevenlabs import ElevenLabsService

    if not settings.elevenlabs_api_key:
        raise service_unavailable("TTS")

    voice_id = request.voice_id or settings.elevenlabs_voice_id

    if agent_id and not request.voice_id:
        agent = AgentRepository.get_by_id(agent_id)
        if agent and agent.get("voice_id"):
            voice_id = agent["voice_id"]

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        result = await ElevenLabsService.synthesize(text, voice_id)
        return result
    except TTSError as e:
        raise service_unavailable(str(e))
