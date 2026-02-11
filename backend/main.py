#!/usr/bin/env python3
"""Emilia Web App - Backend API"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from core.exceptions import ServiceException
from schemas import HealthResponse
from routers import (
    users_router,
    agents_router,
    sessions_router,
    chat_router,
    memory_router,
    admin_router,
    games_router,
    rooms_router,
)
from routers.emotional import router as emotional_router
from routers.designer_v2 import router as designer_v2_router

VERSION = "5.5.3"

app = FastAPI(title="Emilia API", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-Id", "X-Agent-Id", "X-Session-Id"],
)

app.include_router(users_router)
app.include_router(agents_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(admin_router)
app.include_router(games_router)
app.include_router(rooms_router)
app.include_router(emotional_router)
app.include_router(designer_v2_router)


@app.exception_handler(ServiceException)
async def service_exception_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return {"status": "ok", "version": VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
