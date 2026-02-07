"""Pydantic response models for API endpoints."""
from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    id: str
    display_name: str
    preferences: str = "{}"
    created_at: int
    avatar_count: int | None = None

    model_config = ConfigDict(from_attributes=True)


class AgentResponse(BaseModel):
    id: str
    display_name: str
    clawdbot_agent_id: str
    vrm_model: str = "emilia.vrm"
    voice_id: str | None = None
    workspace: str | None = None
    created_at: int
    owners: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionResponse(BaseModel):
    id: str
    agent_id: str
    name: str | None = None
    created_at: int
    last_used: int
    message_count: int = 0
    participants: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class MessageHistoryItem(BaseModel):
    role: str
    content: str
    timestamp: str | None = None


class SessionHistoryResponse(BaseModel):
    messages: list[MessageHistoryItem]
    session_id: str
    count: int


class ChatResponse(BaseModel):
    response: str
    session_id: str
    processing_ms: int
    model: str | None = None
    behavior: dict = {}
    usage: dict | None = None


class TTSResponse(BaseModel):
    audio_base64: str
    alignment: dict | None = None
    voice_id: str
    duration_estimate: float


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = None


class HealthResponse(BaseModel):
    status: str
    version: str


class UsersListResponse(BaseModel):
    users: list[UserResponse]
    count: int


class AgentsListResponse(BaseModel):
    agents: list[AgentResponse]
    count: int


class SessionsListResponse(BaseModel):
    sessions: list[SessionResponse]
    count: int


class MemoryFilesResponse(BaseModel):
    workspace: str
    files: list[str]


class MemoryContentResponse(BaseModel):
    filename: str
    content: str


class DeleteResponse(BaseModel):
    deleted: int


class AgentDeleteResponse(BaseModel):
    deleted: int
    agent_id: str


class StatusResponse(BaseModel):
    status: str
    agent_id: str | None = None
    message: str | None = None
