"""Core module for Emilia backend."""
from .exceptions import (
    EmiliaException,
    ServiceException,
    ClawdbotError,
    TTSError,
    STTError,
    DatabaseError,
    ValidationError,
    not_found,
    forbidden,
    bad_request,
    service_unavailable,
    timeout_error,
    server_error,
)

__all__ = [
    "EmiliaException",
    "ServiceException",
    "ClawdbotError",
    "TTSError",
    "STTError",
    "DatabaseError",
    "ValidationError",
    "not_found",
    "forbidden",
    "bad_request",
    "service_unavailable",
    "timeout_error",
    "server_error",
]
