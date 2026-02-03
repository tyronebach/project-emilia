#!/usr/bin/env python3
"""
Emilia Web App - Backend API
SQLite database for users, agents, sessions
Integrates with Clawdbot Brain for AI responses
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from schemas import HealthResponse
from routers import (
    users_router,
    agents_router,
    sessions_router,
    chat_router,
    memory_router,
    admin_router
)


# ============ APP SETUP ============

app = FastAPI(title="Emilia API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users_router)
app.include_router(agents_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(admin_router)


# ============ HEALTH ============

@app.get("/api/health", response_model=HealthResponse)
async def health():
    return {"status": "ok", "version": "5.5.3"}


# ============ STARTUP ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
