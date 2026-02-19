"""
Pydantic request models for API endpoints.
"""
# Phase 1.5 COMPLETE - 2026-02-08
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, Dict, Any, Literal


class GameContextRequest(BaseModel):
    """Validated game context payload from frontend runtime."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    version: str = Field("1", min_length=1, max_length=16)
    game_id: str = Field(..., alias="gameId", min_length=1, max_length=100)
    state_text: str = Field("", alias="state", max_length=20000)
    last_user_move: str | None = Field(None, alias="lastUserMove", max_length=256)
    avatar_move: str | None = Field(None, alias="avatarMove", max_length=256)
    valid_moves: list[str] | None = Field(None, alias="validMoves")
    status: Literal["in_progress", "game_over"] = Field("in_progress")
    move_count: int = Field(0, alias="moveCount", ge=0, le=20000)
    turn: Literal["user", "avatar"] | None = Field(None)
    mode: Literal["interactive", "narrative", "spectator"] | None = Field(None)
    # Kept for compatibility with existing frontend payloads.
    prompt_instructions: str | None = Field(None, alias="promptInstructions", max_length=4000)

    @field_validator("game_id")
    @classmethod
    def strip_game_id(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("gameId cannot be empty")
        return stripped

    @field_validator("version", "state_text", "last_user_move", "avatar_move", "prompt_instructions")
    @classmethod
    def strip_optional_text(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip()

    @field_validator("valid_moves")
    @classmethod
    def validate_valid_moves(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) > 100:
            raise ValueError("validMoves cannot exceed 100 entries")

        cleaned: list[str] = []
        for item in v:
            move = (item or "").strip()
            if not move:
                continue
            if len(move) > 64:
                raise ValueError("validMoves entries must be <= 64 chars")
            cleaned.append(move)
        return cleaned


class ChatRequest(BaseModel):
    """Chat message request."""
    model_config = ConfigDict(populate_by_name=True)

    message: str = Field(..., min_length=1, max_length=10000, description="User message")
    room_id: Optional[str] = Field(None, max_length=100, description="Target room ID (skips auto-resolve)")
    # Optional validated game context for prompt injection.
    game_context: GameContextRequest | None = None
    runtime_trigger: bool = Field(
        False,
        alias="runtimeTrigger",
        description="Marks non-user runtime prompts (e.g. game turns) to skip user-history persistence.",
    )

    @field_validator('message')
    @classmethod
    def strip_message(cls, v: str) -> str:
        """Strip whitespace from message."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message cannot be empty")
        return stripped


class SpeakRequest(BaseModel):
    """Text-to-speech request."""
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice_id: Optional[str] = Field(None, max_length=100, description="Voice ID override")

    @field_validator('text')
    @classmethod
    def strip_text(cls, v: str) -> str:
        """Strip whitespace from text."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Text cannot be empty")
        return stripped


class AgentUpdate(BaseModel):
    """Update agent configuration."""
    display_name: Optional[str] = Field(None, max_length=200, description="Agent display name")
    voice_id: Optional[str] = Field(None, max_length=100, description="Voice ID")
    vrm_model: Optional[str] = Field(None, max_length=200, description="VRM model filename")
    workspace: Optional[str] = Field(None, max_length=500, description="Workspace path")
    chat_mode: Optional[Literal["openclaw", "direct"]] = Field(
        None,
        description="Agent chat backend mode",
    )
    direct_model: Optional[str] = Field(None, max_length=200, description="Direct mode model override")
    direct_api_base: Optional[str] = Field(None, max_length=500, description="Direct mode API base URL")

    @field_validator('display_name', 'voice_id', 'vrm_model', 'workspace', 'direct_model', 'direct_api_base')
    @classmethod
    def strip_strings(cls, v: Optional[str]) -> Optional[str]:
        """Strip whitespace from string fields."""
        return v.strip() if v else None


class UserCreate(BaseModel):
    """Create user."""
    id: str = Field(..., min_length=1, max_length=100, description="User ID")
    display_name: str = Field(..., min_length=1, max_length=200, description="User display name")

    @field_validator("id", "display_name")
    @classmethod
    def strip_required(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Value cannot be empty")
        return stripped


class UserUpdate(BaseModel):
    """Update user."""
    display_name: Optional[str] = Field(None, min_length=1, max_length=200, description="User display name")

    @field_validator("display_name")
    @classmethod
    def strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            raise ValueError("Display name cannot be empty")
        return stripped


class AgentCreate(BaseModel):
    """Create agent."""
    id: str = Field(..., min_length=1, max_length=100, description="Agent ID")
    display_name: str = Field(..., min_length=1, max_length=200, description="Agent display name")
    clawdbot_agent_id: str = Field(..., min_length=1, max_length=200, description="OpenClaw agent ID")
    vrm_model: str = Field("emilia.vrm", max_length=200, description="VRM model filename")
    voice_id: Optional[str] = Field(None, max_length=100, description="Voice ID")
    workspace: Optional[str] = Field(None, max_length=500, description="Workspace path")
    chat_mode: Optional[Literal["openclaw", "direct"]] = Field(
        None,
        description="Agent chat backend mode",
    )
    direct_model: Optional[str] = Field(None, max_length=200, description="Direct mode model override")
    direct_api_base: Optional[str] = Field(None, max_length=500, description="Direct mode API base URL")

    @field_validator(
        "id",
        "display_name",
        "clawdbot_agent_id",
        "vrm_model",
        "voice_id",
        "workspace",
        "direct_model",
        "direct_api_base",
    )
    @classmethod
    def strip_agent_fields(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None


class UserPreferencesUpdate(BaseModel):
    """Update user preferences."""
    preferences: Dict[str, Any] = Field(default_factory=dict, description="Preferences to merge")


class GameRegistryCreate(BaseModel):
    """Create a game in the global registry."""
    id: str = Field(..., min_length=1, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=200)
    category: Literal["board", "card", "word", "creative"] = Field("board")
    description: str = Field(..., min_length=1, max_length=500)
    module_key: str = Field(..., min_length=1, max_length=100)
    active: bool = True
    move_provider_default: Literal["llm", "engine", "random"] = "llm"
    rule_mode: Literal["strict", "narrative", "spectator"] = "strict"
    prompt_instructions: str | None = Field(None, max_length=4000)
    version: str = Field("1", min_length=1, max_length=16)

    @field_validator("id", "display_name", "description", "module_key", "prompt_instructions", "version")
    @classmethod
    def strip_game_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if stripped == "":
            raise ValueError("String fields cannot be empty")
        return stripped


class GameRegistryUpdate(BaseModel):
    """Update a game in the global registry."""
    display_name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[Literal["board", "card", "word", "creative"]] = None
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    module_key: Optional[str] = Field(None, min_length=1, max_length=100)
    active: Optional[bool] = None
    move_provider_default: Optional[Literal["llm", "engine", "random"]] = None
    rule_mode: Optional[Literal["strict", "narrative", "spectator"]] = None
    prompt_instructions: Optional[str] = Field(None, max_length=4000)
    version: Optional[str] = Field(None, min_length=1, max_length=16)

    @field_validator("display_name", "description", "module_key", "prompt_instructions", "version")
    @classmethod
    def strip_optional_game_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if stripped == "":
            raise ValueError("String fields cannot be empty")
        return stripped


class AgentGameConfigUpdate(BaseModel):
    """Update per-agent game configuration."""
    enabled: Optional[bool] = None
    mode: Optional[Literal["strict", "narrative", "spectator"]] = None
    difficulty: Optional[float] = Field(None, ge=0.0, le=1.0)
    prompt_override: Optional[str] = Field(None, max_length=4000)
    workspace_required: Optional[bool] = None

    @field_validator("prompt_override")
    @classmethod
    def strip_prompt_override(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None


class SoulWindowEventsRequest(BaseModel):
    """Events mutation request for user-facing Soul Window endpoints."""
    model_config = ConfigDict(extra="forbid")

    action: Literal["add_milestone", "add_event", "remove_event"]
    id: Optional[str] = Field(None, min_length=1, max_length=120)
    item: Optional[Dict[str, Any]] = None

    @field_validator("id")
    @classmethod
    def strip_optional_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        return stripped

    @field_validator("item")
    @classmethod
    def validate_optional_item(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("item must be an object")
        return v


class CreateRoomRequest(BaseModel):
    """Create room request."""
    name: str = Field(..., min_length=1, max_length=100)
    agent_ids: list[str] = Field(..., min_length=1, max_length=5)
    room_type: Optional[Literal["dm", "group"]] = Field(None, description="Auto-detected from agent count if omitted")
    settings: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def strip_room_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Room name cannot be empty")
        return stripped

    @field_validator("agent_ids")
    @classmethod
    def clean_agent_ids(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        for agent_id in v:
            normalized = (agent_id or "").strip()
            if not normalized:
                continue
            if normalized not in cleaned:
                cleaned.append(normalized)
        if not cleaned:
            raise ValueError("agent_ids must include at least one valid agent ID")
        return cleaned


class UpdateRoomRequest(BaseModel):
    """Update room request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    settings: Optional[Dict[str, Any]] = None

    @field_validator("name")
    @classmethod
    def strip_optional_room_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            raise ValueError("Room name cannot be empty")
        return stripped


class AddRoomAgentRequest(BaseModel):
    """Add agent to room request."""
    agent_id: str = Field(..., min_length=1, max_length=100)
    response_mode: Literal["mention", "always", "manual"] = "mention"
    role: Literal["participant", "moderator", "observer"] = "participant"

    @field_validator("agent_id")
    @classmethod
    def strip_room_agent_id(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("agent_id cannot be empty")
        return stripped


class UpdateRoomAgentRequest(BaseModel):
    """Update room-agent settings request."""
    response_mode: Optional[Literal["mention", "always", "manual"]] = None
    role: Optional[Literal["participant", "moderator", "observer"]] = None


class RoomChatRequest(BaseModel):
    """Room chat request."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    message: str = Field(..., min_length=1, max_length=10000)
    mention_agents: list[str] | None = Field(None, max_length=10)
    game_context: GameContextRequest | None = None
    runtime_trigger: bool = Field(
        False,
        alias="runtimeTrigger",
        description="Marks non-user runtime prompts (e.g. game turns) to skip user-history persistence.",
    )

    @field_validator("message")
    @classmethod
    def strip_room_message(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message cannot be empty")
        return stripped

    @field_validator("mention_agents")
    @classmethod
    def clean_mention_agents(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned: list[str] = []
        for agent_id in v:
            normalized = (agent_id or "").strip()
            if not normalized:
                continue
            if normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned or None
