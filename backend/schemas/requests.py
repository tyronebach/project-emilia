"""
Pydantic request models for API endpoints.
"""
# Phase 1.5 COMPLETE - 2026-02-08
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any


class ChatRequest(BaseModel):
    """Chat message request."""
    message: str = Field(..., min_length=1, max_length=10000, description="User message")
    # Optional game context for prompt injection.
    game_context: dict | None = None

    @field_validator('message')
    @classmethod
    def strip_message(cls, v: str) -> str:
        """Strip whitespace from message."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Message cannot be empty")
        return stripped


class CreateSessionRequest(BaseModel):
    """Create session request."""
    agent_id: str = Field(..., min_length=1, max_length=100, description="Agent ID")
    name: Optional[str] = Field(None, max_length=200, description="Session name")

    @field_validator('agent_id')
    @classmethod
    def strip_agent_id(cls, v: str) -> str:
        """Strip whitespace from agent_id."""
        return v.strip()

    @field_validator('name')
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        """Strip whitespace from name."""
        return v.strip() if v else None


class UpdateSessionRequest(BaseModel):
    """Update session request."""
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="New session name")

    @field_validator('name')
    @classmethod
    def strip_and_validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Strip whitespace from name and validate."""
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Name cannot be empty if provided")
            return stripped
        return None


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

    @field_validator('display_name', 'voice_id', 'vrm_model', 'workspace')
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

    @field_validator("id", "display_name", "clawdbot_agent_id", "vrm_model", "voice_id", "workspace")
    @classmethod
    def strip_agent_fields(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v else None


class UserPreferencesUpdate(BaseModel):
    """Update user preferences."""
    preferences: Dict[str, Any] = Field(default_factory=dict, description="Preferences to merge")
