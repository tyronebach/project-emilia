"""API Routers"""
from .users import router as users_router
from .agents import router as agents_router
from .sessions import router as sessions_router
from .chat import router as chat_router
from .memory import router as memory_router
from .admin import router as admin_router
from .games import router as games_router

__all__ = [
    "users_router",
    "agents_router",
    "sessions_router",
    "chat_router",
    "memory_router",
    "admin_router",
    "games_router",
]
