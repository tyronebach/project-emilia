"""
Custom exception classes for the application.
"""
from fastapi import HTTPException, status


class EmiliaException(Exception):
    """Base exception for Emilia application."""
    pass


class ServiceException(EmiliaException):
    """Base exception for external service errors."""
    pass


class ClawdbotError(ServiceException):
    """Clawdbot service error."""
    pass


class TTSError(ServiceException):
    """TTS service error."""
    pass


class STTError(ServiceException):
    """STT service error."""
    pass


class DatabaseError(EmiliaException):
    """Database operation error."""
    pass


class ValidationError(EmiliaException):
    """Validation error."""
    pass


# HTTP exception factories
def not_found(resource: str) -> HTTPException:
    """Create 404 exception."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{resource} not found"
    )


def forbidden(message: str = "Access denied") -> HTTPException:
    """Create 403 exception."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=message
    )


def bad_request(message: str) -> HTTPException:
    """Create 400 exception."""
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message
    )


def service_unavailable(service: str) -> HTTPException:
    """Create 503 exception."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"{service} service unavailable"
    )


def timeout_error(service: str) -> HTTPException:
    """Create 504 exception."""
    return HTTPException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        detail=f"{service} timeout"
    )


def server_error(message: str = "Internal server error") -> HTTPException:
    """Create 500 exception."""
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=message
    )
