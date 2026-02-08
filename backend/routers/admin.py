"""Admin/manage routes"""
from fastapi import APIRouter, Depends
from dependencies import verify_token
from core.exceptions import not_found
from db.repositories import AgentRepository, SessionRepository, MessageRepository
from db.connection import get_db
from config import settings
from schemas import (
    AgentUpdate, AgentsListResponse, SessionsListResponse,
    AgentDeleteResponse, DeleteResponse, StatusResponse
)

router = APIRouter(prefix="/api/manage", tags=["admin"])


@router.get("/sessions", response_model=SessionsListResponse)
async def list_all_sessions(token: str = Depends(verify_token)):
    sessions = SessionRepository.get_all()
    return SessionsListResponse(sessions=sessions, count=len(sessions))


@router.delete("/sessions/agent/{agent_id}", response_model=AgentDeleteResponse)
async def delete_agent_sessions(agent_id: str, token: str = Depends(verify_token)):
    count = SessionRepository.delete_by_agent(agent_id)
    return AgentDeleteResponse(deleted=count, agent_id=agent_id)


@router.delete("/sessions/all", response_model=DeleteResponse)
async def delete_all_sessions(token: str = Depends(verify_token)):
    count = SessionRepository.delete_all()
    return DeleteResponse(deleted=count)


@router.get("/agents", response_model=AgentsListResponse)
async def get_manage_agents(token: str = Depends(verify_token)):
    agents = AgentRepository.get_all()
    return AgentsListResponse(agents=agents, count=len(agents))


@router.put("/agents/{agent_id}", response_model=StatusResponse)
async def update_manage_agent(
    agent_id: str,
    update: AgentUpdate,
    token: str = Depends(verify_token)
):
    agent = AgentRepository.get_by_id(agent_id)
    if not agent:
        raise not_found("Agent")
    AgentRepository.update(agent_id, update.model_dump(exclude_unset=True))
    return StatusResponse(status="ok", agent_id=agent_id)


@router.get("/debug/compaction/{session_id}")
async def get_compaction_debug(session_id: str, token: str = Depends(verify_token)):
    """Get compaction debug info for a session."""
    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise not_found("Session")
    
    # Get actual message count from messages table
    with get_db() as conn:
        actual_count = conn.execute(
            "SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
            (session_id,)
        ).fetchone()["count"]
    
    return {
        "session_id": session_id,
        "session_name": session.get("name"),
        "message_count_cached": session.get("message_count", 0),
        "message_count_actual": actual_count,
        "summary": session.get("summary"),
        "summary_length": len(session.get("summary") or ""),
        "summary_updated_at": session.get("summary_updated_at"),
        "compaction_count": session.get("compaction_count", 0),
        "config": {
            "threshold": settings.compact_threshold,
            "keep_recent": settings.compact_keep_recent,
            "model": settings.compact_model,
        },
        "should_compact": actual_count > settings.compact_threshold,
    }


@router.post("/debug/compaction/{session_id}/trigger")
async def trigger_compaction(session_id: str, token: str = Depends(verify_token)):
    """Manually trigger compaction for a session."""
    from services.compaction import CompactionService
    
    session = SessionRepository.get_by_id(session_id)
    if not session:
        raise not_found("Session")
    
    all_msgs = MessageRepository.get_all_for_session(session_id)
    if len(all_msgs) <= settings.compact_keep_recent:
        return {
            "status": "skipped",
            "reason": f"Only {len(all_msgs)} messages, need more than {settings.compact_keep_recent} to compact"
        }
    
    split_at = len(all_msgs) - settings.compact_keep_recent
    old_msgs = all_msgs[:split_at]
    
    # Build messages to summarize
    existing_summary = SessionRepository.get_summary(session_id)
    to_summarize = []
    if existing_summary:
        to_summarize.append({"role": "system", "content": f"Prior summary: {existing_summary}"})
    to_summarize.extend({"role": m["role"], "content": m["content"]} for m in old_msgs)
    
    # Generate summary
    summary = await CompactionService.summarize_messages(to_summarize)
    
    # Persist
    SessionRepository.update_summary(session_id, summary)
    deleted = MessageRepository.delete_oldest(session_id, settings.compact_keep_recent)
    
    return {
        "status": "ok",
        "messages_summarized": len(old_msgs),
        "messages_deleted": deleted,
        "summary_length": len(summary),
        "summary_preview": summary[:500] + "..." if len(summary) > 500 else summary,
    }
