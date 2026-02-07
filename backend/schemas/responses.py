"""
Pydantic response models for API endpoints.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any


class UserResponse(BaseModel):
    """User response model."""
    id: str
    display_name: str
    preferences: str = "{}"
    created_at: int
    avatar_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AgentResponse(BaseModel):
    """Agent response model."""
    id: str
    display_name: str
    clawdbot_agent_id: str
    vrm_model: str = "emilia.vrm"
    voice_id: Optional[str] = None
    workspace: Optional[str] = None
    created_at: int
    owners: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(BaseModel):
    """Session response model."""
    id: str
    agent_id: str
    name: Optional[str] = None
    created_at: int
    last_used: int
    message_count: int = 0
    participants: List[str] = []

    model_config = ConfigDict(from_attributes=True)


class MessageHistoryItem(BaseModel):
    """Single message in chat history."""
    role: str
    content: str
    timestamp: Optional[str] = None


class SessionHistoryResponse(BaseModel):
    """Session history response."""
    messages: List[MessageHistoryItem]
    session_id: str
    count: int
    error: Optional[str] = None


class ChatResponse(BaseModel):
    """Chat completion response."""
    response: str
    session_id: str
    processing_ms: int
    model: Optional[str] = None
    behavior: dict = {}
    usage: Optional[dict] = None


class TTSResponse(BaseModel):
    """Text-to-speech response."""
    audio_base64: str
    alignment: Optional[dict] = None
    voice_id: str
    duration_estimate: float


class TranscriptionResponse(BaseModel):
    """Speech-to-text transcription response."""
    text: str
    language: Optional[str] = None
    duration: Optional[float] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str


class UsersListResponse(BaseModel):
    """List of users response."""
    users: List[UserResponse]
    count: int


class AgentsListResponse(BaseModel):
    """List of agents response."""
    agents: List[AgentResponse]
    count: int


class SessionsListResponse(BaseModel):
    """List of sessions response."""
    sessions: List[SessionResponse]
    count: int


class MemoryFilesResponse(BaseModel):
    """Memory files listing."""
    workspace: str
    files: List[str]


class MemoryContentResponse(BaseModel):
    """Memory file content."""
    filename: str
    content: str


class DeleteResponse(BaseModel):
    """Generic delete response."""
    deleted: bool | int


class AgentDeleteResponse(BaseModel):
    """Agent sessions delete response."""
    deleted: int
    agent_id: str


class StatusResponse(BaseModel):
    """Generic status response."""
    status: str
    agent_id: Optional[str] = None
    message: Optional[str] = None
