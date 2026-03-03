#!/usr/bin/env python3
"""Emilia Web App - Backend API"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from core.exceptions import ServiceException
from schemas import HealthResponse
from services.memory.embedder import get_embedder
from routers import (
    users_router,
    agents_router,
    chat_router,
    memory_router,
    admin_router,
    games_router,
    rooms_router,
    soul_window_router,
    dreams_router,
)
from routers.emotional import router as emotional_router
from routers.designer_v2 import router as designer_v2_router
from services.dreams.scheduler import check_and_trigger_dreams

VERSION = "5.6.3"


async def _dream_scheduler_loop() -> None:
    while True:
        await check_and_trigger_dreams()
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_dream_scheduler_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Emilia API", version=VERSION, lifespan=lifespan)
get_embedder()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-Id", "X-Agent-Id"],
)

app.include_router(users_router)
app.include_router(agents_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(admin_router)
app.include_router(games_router)
app.include_router(rooms_router)
app.include_router(soul_window_router)
app.include_router(dreams_router)
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
    uvicorn.run(app, host="127.0.0.1", port=8080)
