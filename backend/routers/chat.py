"""Chat and media routes (chat, transcribe, speak)"""
# Phase 1.6 COMPLETE - 2026-02-08
# Phase 3.1 COMPLETE - 2026-02-08
import asyncio
import time
import json
import logging
import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from dependencies import verify_token, get_user_id, get_agent_id, get_optional_agent_id, get_session_id
from schemas import ChatRequest, SpeakRequest
from config import settings
from core.exceptions import TTSError
from parse_chat import parse_chat_completion, extract_avatar_commands
from db.repositories import UserRepository, AgentRepository, SessionRepository, MessageRepository, EmotionalStateRepository
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile
from services.config_loader import get_trigger_mood_map

logger = logging.getLogger(__name__)


async def _run_llm_trigger_batch(
    user_id: str, 
    agent_id: str, 
    messages: list[str],
    engine: EmotionEngine
) -> None:
    """
    Background task: Run LLM trigger classification on batched messages.
    
    Results are stored in pending_triggers for the next turn.
    This runs async and doesn't block the chat response.
    """
    try:
        triggers = await engine.detect_triggers_llm_batch(messages)
        if triggers:
            EmotionalStateRepository.set_pending_triggers(user_id, agent_id, triggers)
            logger.info("[EmotionBatch] Stored %d pending triggers for next turn", len(triggers))
    except Exception:
        logger.exception("[EmotionBatch] Background trigger detection failed")


async def _process_emotion_pre_llm(user_id: str, agent_id: str, user_message: str, session_id: str | None = None) -> str | None:
    """
    Process emotional state BEFORE LLM call.

    1. Load/create emotional state
    2. Apply time-based decay
    3. Detect triggers from user message (LLM or regex)
    4. Apply trigger deltas
    5. Return emotional context block for prompt injection

    Returns context block string or None if emotion engine disabled/error.
    """
    try:
        # Load state and profile
        state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
        profile_data = EmotionalStateRepository.get_agent_profile(agent_id)

        # Get agent baseline from DB
        agent = AgentRepository.get_by_id(agent_id)
        if not agent:
            return None

        # Build profile from DB (emotional_profile column has all settings)
        profile = AgentProfile.from_db(agent, profile_data)

        engine = EmotionEngine(profile)

        # Convert DB row to EmotionalState
        # Load persisted mood_weights from DB, or initialize from agent's mood_baseline
        mood_weights = {}
        if state_row.get('mood_weights_json'):
            mood_weights = json.loads(state_row['mood_weights_json'])
        
        # FIX: Initialize mood_weights from mood_baseline if empty (Bug #1)
        if not mood_weights:
            from services.emotion_engine import get_mood_list
            mood_weights = {mood: profile.mood_baseline.get(mood, 0) for mood in get_mood_list()}
            logger.info("[Emotion] Initialized mood_weights from mood_baseline for %s/%s", user_id, agent_id)

        state = EmotionalState(
            valence=state_row['valence'] or 0.0,
            arousal=state_row['arousal'] or 0.0,
            dominance=state_row['dominance'] or 0.0,
            trust=state_row['trust'] or 0.5,
            attachment=state_row['attachment'] or 0.3,
            familiarity=state_row['familiarity'] or 0.0,
            mood_weights=mood_weights,
        )

        # Apply decay since last interaction
        last_updated = state_row.get('last_updated') or 0
        if last_updated:
            import time as time_module
            elapsed = time_module.time() - last_updated
            state = engine.apply_decay(state, elapsed)
            engine.apply_mood_decay(state, elapsed)

        # Async trigger detection with batching (no blocking on LLM)
        # 1. Pop pending LLM triggers from previous batch
        # 2. Run instant regex detection on current message
        # 3. Combine and apply
        # 4. Buffer message for next LLM batch (every 4 messages)
        
        pending_triggers = EmotionalStateRepository.pop_pending_triggers(user_id, agent_id)
        regex_triggers = engine.detect_triggers(user_message)
        
        # Combine pending (from LLM batch) + regex (instant)
        # Deduplicate by trigger name, taking max intensity
        trigger_map = {}
        for trigger, intensity in pending_triggers + regex_triggers:
            if trigger not in trigger_map or intensity > trigger_map[trigger]:
                trigger_map[trigger] = intensity
        triggers = list(trigger_map.items())
        
        # Buffer message for async LLM batch classification
        if settings.llm_trigger_detection:
            buffer = EmotionalStateRepository.append_to_buffer(user_id, agent_id, user_message, max_size=4)
            
            # Fire background LLM batch when buffer is full
            if len(buffer) >= 4:
                asyncio.create_task(_run_llm_trigger_batch(
                    user_id, agent_id, buffer.copy(), engine
                ))
                EmotionalStateRepository.clear_buffer(user_id, agent_id)

        for trigger, intensity in triggers:
            deltas = engine.apply_trigger(state, trigger, intensity)

            # Log event
            if deltas:
                EmotionalStateRepository.log_event(
                    user_id=user_id,
                    agent_id=agent_id,
                    trigger_type='user_message',
                    trigger_value=trigger,
                    session_id=session_id,
                    delta_valence=deltas.get('valence'),
                    delta_arousal=deltas.get('arousal'),
                    delta_dominance=deltas.get('dominance'),
                    delta_trust=deltas.get('trust'),
                    delta_attachment=deltas.get('attachment'),
                    state_after=state.to_dict(),
                )

        # Apply mood system: trigger_mood_map from relationship config
        if triggers:
            relationship_type = state_row.get('relationship_type') or 'friend'
            trigger_mood_map = get_trigger_mood_map(relationship_type)
            if trigger_mood_map:
                mood_deltas = engine.calculate_mood_deltas(triggers, trigger_mood_map)
                engine.apply_mood_deltas(state, mood_deltas)
                logger.debug("[Emotion] Mood deltas applied: %s", {k: v for k, v in mood_deltas.items() if v != 0})

        # Save updated state (including mood_weights)
        # FIX: Don't use `or None` - empty dict {} is falsy but valid (Bug #2)
        EmotionalStateRepository.update(
            user_id, agent_id,
            mood_weights=state.mood_weights,
            valence=state.valence,
            arousal=state.arousal,
            dominance=state.dominance,
            trust=state.trust,
            attachment=state.attachment,
            familiarity=state.familiarity,
        )
        
        # Generate context block for prompt
        context = engine.generate_context_block(state)
        logger.info("[Emotion] Pre-LLM context for %s/%s:\n%s", user_id, agent_id, context)
        return context
        
    except Exception:
        logger.exception("Emotion engine error (pre-LLM), continuing without emotional context")
        return None


def _process_emotion_post_llm(user_id: str, agent_id: str, behavior: dict, session_id: str | None = None) -> None:
    """
    Process emotional state AFTER LLM response.
    
    Apply any mood shifts from the agent's own behavior tags.
    """
    try:
        if not behavior:
            return
        
        mood = behavior.get('mood')
        if not mood:
            return
        
        # Map LLM mood to emotional trigger (agent self-reported state)
        mood_to_trigger = {
            'happy': ('shared_joy', 0.3),
            'sad': ('empathy_needed', 0.3),
            'angry': ('conflict', 0.2),
            'embarrassed': ('vulnerability', 0.2),
            'excited': ('shared_joy', 0.4),
        }
        
        if mood in mood_to_trigger:
            trigger, intensity = mood_to_trigger[mood]
            intensity *= behavior.get('mood_intensity', 1.0)
            
            state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
            profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
            agent = AgentRepository.get_by_id(agent_id)
            
            if agent:
                profile = AgentProfile(
                    baseline_valence=agent.get('baseline_valence') or 0.2,
                    emotional_volatility=agent.get('emotional_volatility') or 0.5,
                    trigger_multipliers=profile_data.get('trigger_multipliers', {}),
                )
                engine = EmotionEngine(profile)
                
                state = EmotionalState(
                    valence=state_row['valence'] or 0.0,
                    arousal=state_row['arousal'] or 0.0,
                    trust=state_row['trust'] or 0.5,
                )
                
                deltas = engine.apply_trigger(state, trigger, intensity)
                
                if deltas:
                    EmotionalStateRepository.update(
                        user_id, agent_id,
                        valence=state.valence,
                        arousal=state.arousal,
                    )
                    EmotionalStateRepository.log_event(
                        user_id=user_id,
                        agent_id=agent_id,
                        trigger_type='self_mood',
                        trigger_value=mood,
                        session_id=session_id,
                        delta_valence=deltas.get('valence'),
                        delta_arousal=deltas.get('arousal'),
                        state_after=state.to_dict(),
                    )
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


def inject_game_context(message: str, game_context: dict | None) -> str:
    """Append game context to the user's message for the LLM prompt."""
    if not game_context:
        return message

    game_id = game_context.get("gameId", "unknown")
    prompt_instructions = game_context.get("promptInstructions") or ""
    state = game_context.get("state") or ""
    last_move = game_context.get("lastUserMove") or ""
    avatar_move = game_context.get("avatarMove")
    valid_moves = game_context.get("validMoves") or []
    status = game_context.get("status", "in_progress")

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


def _build_llm_messages(
    session_id: str,
    current_msg: str,
    game_context: dict | None,
    emotional_context: str | None = None
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
    
    # Then game context (specific to game state)
    current_content = inject_game_context(current_content, game_context)
    
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
        raise HTTPException(status_code=404, detail="User not found")

    if not UserRepository.can_access_agent(user_id, agent_id):
        raise HTTPException(status_code=403, detail="User cannot access this agent")

    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    clawdbot_agent_id = agent["clawdbot_agent_id"]

    if session_id:
        session = SessionRepository.get_by_id(session_id)
        if not session or not SessionRepository.user_can_access(user_id, session_id):
            raise HTTPException(status_code=403, detail="Cannot access this session")
    else:
        session = SessionRepository.get_or_create_default(user_id, agent_id)

    sid = session["id"]

    if stream == 1:
        return StreamingResponse(
            _stream_chat_sse(request, start_time, clawdbot_agent_id, sid, user_id, agent_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming
    try:
        # Process emotional state before LLM (detect triggers, apply decay)
        emotional_context = await _process_emotion_pre_llm(user_id, agent_id, request.message, sid)
        
        # Build messages array: raw history + current message with contexts
        messages = _build_llm_messages(sid, request.message, request.game_context, emotional_context)

        # Store raw user message BEFORE calling LLM
        MessageRepository.add(sid, "user", request.message)

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
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Chat service error")

            result = response.json()

        parsed = parse_chat_completion(result)
        processing_ms = int((time.time() - start_time) * 1000)

        # Store assistant response with metadata
        behavior = parsed.get("behavior", {})
        usage = result.get("usage") or {}
        MessageRepository.add(
            sid, "assistant", parsed["response_text"],
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

        # Process emotional state after LLM (apply self-reported mood shifts)
        _process_emotion_post_llm(user_id, agent_id, behavior, sid)

        # Fire-and-forget: compact in background so response returns immediately
        _spawn_background(_maybe_compact_session(sid))

        return {
            "response": parsed["response_text"],
            "session_id": sid,
            "processing_ms": processing_ms,
            "model": result.get("model"),
            "behavior": behavior,
            "usage": result.get("usage")
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Service unavailable")


async def _stream_chat_sse(
    request: ChatRequest,
    start_time: float,
    clawdbot_agent_id: str,
    session_id: str,
    user_id: str,
    agent_id: str
):
    """SSE streaming chat"""
    try:
        # Process emotional state before LLM (detect triggers, apply decay)
        emotional_context = await _process_emotion_pre_llm(user_id, agent_id, request.message, session_id)
        
        # Build messages array: raw history + current message with contexts
        messages = _build_llm_messages(session_id, request.message, request.game_context, emotional_context)

        # Store raw user message BEFORE calling LLM
        MessageRepository.add(session_id, "user", request.message)

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
                }
            ) as response:
                if response.status_code != 200:
                    yield f"data: {json.dumps({'error': 'API error'})}\n\n"
                    return

                full_content = ""
                usage = None

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        continue

                    try:
                        data = json.loads(data_str)

                        if "usage" in data:
                            usage = data["usage"]

                        choices = data.get("choices", [])
                        if not choices:
                            continue

                        delta = choices[0].get("delta", {})
                        chunk = delta.get("content", "")

                        if chunk:
                            full_content += chunk
                            yield f"data: {json.dumps({'content': chunk})}\n\n"

                        if choices[0].get("finish_reason"):
                            break

                    except json.JSONDecodeError:
                        continue

                # Final response - extract behavior tags from full content
                clean_full, behavior = extract_avatar_commands(full_content)
                processing_ms = int((time.time() - start_time) * 1000)

                # Store assistant response with metadata
                usage_data = usage or {}
                MessageRepository.add(
                    session_id, "assistant", clean_full,
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

                SessionRepository.update_last_used(session_id)
                SessionRepository.increment_message_count(session_id)

                # Process emotional state after LLM (apply self-reported mood shifts)
                _process_emotion_post_llm(user_id, agent_id, behavior, session_id)

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

                # Fire-and-forget: compact in background so stream closes immediately
                _spawn_background(_maybe_compact_session(session_id))

    except Exception:
        logger.exception("Streaming error")
        yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
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
        raise HTTPException(status_code=504, detail="STT timeout")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="STT unavailable")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription error")
        raise HTTPException(status_code=500, detail="Transcription error")


@router.post("/speak")
async def speak(
    request: SpeakRequest,
    token: str = Depends(verify_token),
    agent_id: str | None = Depends(get_optional_agent_id)
):
    """Text-to-speech via ElevenLabs with-timestamps API for lip sync alignment"""
    from services.elevenlabs import ElevenLabsService

    if not settings.elevenlabs_api_key:
        raise HTTPException(status_code=503, detail="TTS not configured")

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
        raise HTTPException(status_code=503, detail=str(e))
