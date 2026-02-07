"""Custom exception classes for the application."""
from fastapi import HTTPException, status


class EmiliaException(Exception):
    """Base exception for Emilia application."""
    pass


class ServiceException(EmiliaException):
    """Base exception for external service errors."""
    pass


class TTSError(ServiceException):
    """TTS service error."""
    pass


# HTTP exception factories

def not_found(resource: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource} not found")


def forbidden(message: str = "Access denied") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


def bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def service_unavailable(service: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"{service} service unavailable")


def timeout_error(service: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=f"{service} timeout")
