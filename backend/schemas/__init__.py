"""
Pydantic schemas for API requests and responses.
"""
from .requests import (
    ChatRequest,
    CreateSessionRequest,
    UpdateSessionRequest,
    SpeakRequest,
    AgentUpdate,
)
from .responses import (
    UserResponse,
    AgentResponse,
    SessionResponse,
    MessageHistoryItem,
    SessionHistoryResponse,
    ChatResponse,
    TTSResponse,
    TranscriptionResponse,
    HealthResponse,
    UsersListResponse,
    AgentsListResponse,
    SessionsListResponse,
    MemoryFilesResponse,
    MemoryContentResponse,
    DeleteResponse,
    AgentDeleteResponse,
    StatusResponse,
)

__all__ = [
    # Requests
    "ChatRequest",
    "CreateSessionRequest",
    "UpdateSessionRequest",
    "SpeakRequest",
    "AgentUpdate",
    # Responses
    "UserResponse",
    "AgentResponse",
    "SessionResponse",
    "MessageHistoryItem",
    "SessionHistoryResponse",
    "ChatResponse",
    "TTSResponse",
    "TranscriptionResponse",
    "HealthResponse",
    "UsersListResponse",
    "AgentsListResponse",
    "SessionsListResponse",
    "MemoryFilesResponse",
    "MemoryContentResponse",
    "DeleteResponse",
    "AgentDeleteResponse",
    "StatusResponse",
]
