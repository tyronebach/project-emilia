"""Core module for Emilia backend."""
from .exceptions import (
    EmiliaException,
    ServiceException,
    TTSError,
    not_found,
    forbidden,
    bad_request,
    service_unavailable,
    timeout_error,
)

__all__ = [
    "EmiliaException",
    "ServiceException",
    "TTSError",
    "not_found",
    "forbidden",
    "bad_request",
    "service_unavailable",
    "timeout_error",
]
