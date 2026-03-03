"""Pydantic response models for API endpoints."""
import json
from pydantic import BaseModel, ConfigDict, field_validator


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
    clawdbot_agent_id: str | None = None
    vrm_model: str | None = "emilia.vrm"
    voice_id: str | None = None
    workspace: str | None = None
    direct_model: str | None = None
    direct_api_base: str | None = None
    provider: str = "native"
    provider_config: dict = {}
    created_at: int
    owners: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("provider_config", mode="before")
    @classmethod
    def parse_provider_config(cls, v) -> dict:
        """Parse provider_config from JSON string if needed (DB stores TEXT)."""
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, TypeError):
                return {}
        return v if isinstance(v, dict) else {}


class AvatarBehavior(BaseModel):
    intent: str | None = None
    mood: str | None = None
    mood_intensity: float = 1.0
    energy: str | None = None
    move: str | None = None
    game_action: str | None = None


class ChatResponse(BaseModel):
    response: str
    room_id: str
    processing_ms: int
    model: str | None = None
    behavior: AvatarBehavior = AvatarBehavior()
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


class UserAgentsResponse(BaseModel):
    agents: list[AgentResponse]
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


class RoomAgentResponse(BaseModel):
    room_id: str
    agent_id: str
    display_name: str
    vrm_model: str | None = None
    voice_id: str | None = None
    role: str = "participant"
    response_mode: str = "mention"
    added_at: int | None = None
    added_by: str | None = None


class RoomParticipantResponse(BaseModel):
    room_id: str
    user_id: str
    display_name: str
    role: str = "member"
    joined_at: int | None = None


class RoomResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: int
    last_activity: int
    message_count: int = 0
    room_type: str = "group"
    settings: dict = {}


class RoomDetailResponse(RoomResponse):
    agents: list[RoomAgentResponse] = []
    participants: list[RoomParticipantResponse] = []


class RoomsListResponse(BaseModel):
    rooms: list[RoomResponse]
    count: int


class RoomAgentListResponse(BaseModel):
    room_id: str
    agents: list[RoomAgentResponse]
    count: int


class RoomMessageResponse(BaseModel):
    id: str
    room_id: str
    sender_type: str
    sender_id: str
    sender_name: str
    content: str
    timestamp: float
    origin: str | None = None
    model: str | None = None
    processing_ms: int | None = None
    usage_prompt_tokens: int | None = None
    usage_completion_tokens: int | None = None
    behavior: AvatarBehavior = AvatarBehavior()


class RoomHistoryResponse(BaseModel):
    messages: list[RoomMessageResponse]
    room_id: str
    count: int


class RoomChatAgentResponse(BaseModel):
    agent_id: str
    agent_name: str
    message: RoomMessageResponse
    processing_ms: int
    model: str | None = None
    usage: dict | None = None


class RoomChatResponse(BaseModel):
    room_id: str
    responses: list[RoomChatAgentResponse]
    count: int


class GameRegistryItemResponse(BaseModel):
    id: str
    display_name: str
    category: str
    description: str
    module_key: str
    active: bool = True
    move_provider_default: str = "llm"
    rule_mode: str = "strict"
    prompt_instructions: str | None = None
    version: str = "1"
    created_at: int | None = None
    updated_at: int | None = None

    model_config = ConfigDict(from_attributes=True)


class GameRegistryListResponse(BaseModel):
    games: list[GameRegistryItemResponse]
    count: int


class AgentGameConfigResponse(BaseModel):
    agent_id: str
    game_id: str
    enabled: bool = True
    mode: str | None = None
    difficulty: float | None = None
    prompt_override: str | None = None
    workspace_required: bool = False

    model_config = ConfigDict(from_attributes=True)


class AgentGameConfigListResponse(BaseModel):
    agent_id: str
    games: list[dict]
    count: int


class GameCatalogItemResponse(BaseModel):
    id: str
    display_name: str
    category: str
    description: str
    module_key: str
    move_provider_default: str
    rule_mode: str
    prompt_instructions: str | None = None
    effective_mode: str | None = None
    effective_difficulty: float | None = None
    version: str = "1"

    model_config = ConfigDict(from_attributes=True)


class GameCatalogResponse(BaseModel):
    agent_id: str
    games: list[GameCatalogItemResponse]
    count: int
