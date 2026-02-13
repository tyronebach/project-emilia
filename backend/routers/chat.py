"""Chat and media routes (chat, transcribe, speak)"""
import asyncio
import time
import json
import logging
import threading
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
)
from services.background_tasks import spawn_background as _spawn_background_impl
from services.direct_llm import (
    DirectLLMClient,
    normalize_chat_mode,
    normalize_messages_for_direct,
    prepend_webapp_system_prompt,
    resolve_direct_api_base,
    resolve_direct_model,
)
from services.direct_tool_runtime import run_tool_loop
from services.emotion_runtime import (
    get_emotion_lock as _get_emotion_lock_impl,
    process_emotion_post_llm as _process_emotion_post_llm_impl,
    process_emotion_pre_llm as _process_emotion_pre_llm_impl,
)
from services.chat_context_runtime import (
    build_first_turn_context as _build_first_turn_context_impl,
    ctx_value as _ctx_value_impl,
    ensure_workspace_milestones as _ensure_workspace_milestones_impl,
    inject_game_context as _inject_game_context_impl,
    resolve_trusted_prompt_instructions as _resolve_trusted_prompt_instructions_impl,
    safe_get_mood_snapshot as _safe_get_mood_snapshot_impl,
)

logger = logging.getLogger(__name__)

def _get_emotion_lock(user_id: str, agent_id: str) -> threading.Lock:
    """Compatibility wrapper for shared emotion runtime helper."""
    return _get_emotion_lock_impl(user_id, agent_id)


async def _process_emotion_pre_llm(
    user_id: str, agent_id: str, user_message: str, session_id: str | None = None
) -> tuple[str | None, list[tuple[str, float]]]:
    """Compatibility wrapper for shared emotion runtime helper."""
    return await _process_emotion_pre_llm_impl(
        user_id,
        agent_id,
        user_message,
        session_id=session_id,
    )


def _process_emotion_post_llm(
    user_id: str,
    agent_id: str,
    behavior: dict,
    session_id: str | None = None,
    pre_llm_triggers: list[tuple[str, float]] | None = None,
    user_message: str | None = None,
) -> None:
    """Compatibility wrapper for shared emotion runtime helper."""
    _process_emotion_post_llm_impl(
        user_id,
        agent_id,
        behavior,
        session_id=session_id,
        pre_llm_triggers=pre_llm_triggers,
        user_message=user_message,
    )

router = APIRouter(prefix="/api", tags=["chat"])

def _spawn_background(coro) -> asyncio.Task:
    """Compatibility wrapper for shared background task scheduler."""
    return _spawn_background_impl(coro)


def _ctx_value(game_context, *keys):
    """Compatibility wrapper for shared runtime helper."""
    return _ctx_value_impl(game_context, *keys)


def _resolve_trusted_prompt_instructions(agent_id: str, game_context) -> str:
    """Compatibility wrapper for shared runtime helper."""
    return _resolve_trusted_prompt_instructions_impl(agent_id, game_context)


def inject_game_context(
    message: str,
    game_context,
    prompt_instructions: str | None = None,
) -> str:
    """Compatibility wrapper for shared runtime helper."""
    return _inject_game_context_impl(message, game_context, prompt_instructions=prompt_instructions)


def _build_first_turn_context(
    user_id: str,
    agent_id: str,
    *,
    agent_workspace: str | None,
) -> str | None:
    """Compatibility wrapper for shared runtime helper."""
    return _build_first_turn_context_impl(
        user_id,
        agent_id,
        agent_workspace=agent_workspace,
    )


def _ensure_workspace_milestones(
    *,
    agent_workspace: str,
    user_id: str,
    agent_id: str,
    interaction_count: int,
    runtime_trigger: bool,
    game_id: str | None,
) -> None:
    """Compatibility wrapper for shared runtime helper."""
    _ensure_workspace_milestones_impl(
        agent_workspace=agent_workspace,
        user_id=user_id,
        agent_id=agent_id,
        interaction_count=interaction_count,
        runtime_trigger=runtime_trigger,
        game_id=game_id,
    )


def _safe_get_mood_snapshot(user_id: str, agent_id: str) -> dict | None:
    """Compatibility wrapper for shared runtime helper."""
    return _safe_get_mood_snapshot_impl(user_id, agent_id)



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
                direct_messages = prepend_webapp_system_prompt(
                    normalize_messages_for_direct(messages),
                    agent_workspace if isinstance(agent_workspace, str) else None,
                    timezone=settings.default_timezone,
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
                # OpenClaw mode: inject only webapp-specific behavior format (for avatar animation)
                # OpenClaw handles time/memory/skills via its own system
                from services.direct_llm import build_webapp_system_instructions
                webapp_instructions = build_webapp_system_instructions(
                    chat_mode="openclaw",
                    include_behavior_format=True,
                )
                openclaw_messages = [
                    {"role": "system", "content": webapp_instructions},
                    *messages,
                ]

                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{settings.clawdbot_url}/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.clawdbot_token}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": f"agent:{clawdbot_agent_id}",
                            "messages": openclaw_messages,
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
                direct_messages = prepend_webapp_system_prompt(
                    normalize_messages_for_direct(messages),
                    agent_workspace if isinstance(agent_workspace, str) else None,
                    timezone=settings.default_timezone,
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
                # OpenClaw mode: inject only webapp-specific behavior format (for avatar animation)
                from services.direct_llm import build_webapp_system_instructions
                webapp_instructions = build_webapp_system_instructions(
                    chat_mode="openclaw",
                    include_behavior_format=True,
                )
                openclaw_messages = [
                    {"role": "system", "content": webapp_instructions},
                    *messages,
                ]

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
                            "messages": openclaw_messages,
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
