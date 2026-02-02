# Emilia Web App API

Base URL: `http://localhost:8080`

---

## Authentication

All endpoints (except `/api/health`) require:
```
Authorization: Bearer <token>
```
Dev token: `emilia-dev-token-2026` (when `AUTH_ALLOW_DEV_TOKEN=1`)

Context headers:
```
X-User-Id: <user_id>         # Required for most endpoints
X-Agent-Id: <agent_id>       # For agent-scoped requests
X-Session-Id: <session_id>   # For session-scoped requests
```

---

## Health

```
GET /api/health
```
No auth required.
```json
{"status": "ok", "version": "2.0.0"}
```

---

## Users

### List Users
```
GET /api/users
```
```json
{
  "users": [
    {"id": "thai", "display_name": "Thai", "avatar_count": 2},
    {"id": "emily", "display_name": "Emily", "avatar_count": 1}
  ],
  "count": 2
}
```

### Get User + Agents
```
GET /api/users/{user_id}
```
```json
{
  "id": "thai",
  "display_name": "Thai",
  "agents": [
    {"id": "emilia-thai", "display_name": "Emilia", "vrm_model": "emilia.vrm"}
  ]
}
```

### Get User's Agents
```
GET /api/users/{user_id}/agents
```

### Get User's Sessions for Agent
```
GET /api/users/{user_id}/agents/{agent_id}/sessions
```

---

## Agents

### Get Agent
```
GET /api/agents/{agent_id}
```
```json
{
  "id": "emilia-thai",
  "display_name": "Emilia",
  "clawdbot_agent_id": "emilia-thai",
  "vrm_model": "emilia.vrm",
  "voice_id": "gNLojYp5VOiuqC8CTCmi",
  "workspace": "/home/tbach/clawd-emilia-thai",
  "owners": ["thai"]
}
```

---

## Sessions

### List Sessions
```
GET /api/sessions
Headers: X-User-Id, X-Agent-Id (optional)
```
```json
{
  "sessions": [
    {
      "id": "uuid",
      "agent_id": "emilia-thai",
      "name": "My Chat",
      "created_at": 1770009786,
      "last_used": 1770009869,
      "message_count": 5,
      "participants": ["thai"]
    }
  ],
  "count": 1
}
```

### Create Session
```
POST /api/sessions
Headers: X-User-Id
Body: {"agent_id": "emilia-thai", "name": "Optional Name"}
```

### Get Session
```
GET /api/sessions/{session_id}
```

### Update Session (Rename)
```
PATCH /api/sessions/{session_id}
Headers: X-User-Id
Body: {"name": "New Name"}
```

### Delete Session
```
DELETE /api/sessions/{session_id}
Headers: X-User-Id
```
```json
{"deleted": true}
```

### Get Session History
```
GET /api/sessions/{session_id}/history?limit=50
Headers: X-User-Id
```
Reads from Clawdbot's JSONL files.
```json
{
  "messages": [
    {"role": "user", "content": "Hi!", "timestamp": "2026-02-01T21:00:00Z"},
    {"role": "assistant", "content": "Hello!", "timestamp": "2026-02-01T21:00:01Z"}
  ],
  "session_id": "uuid",
  "count": 2
}
```

---

## Chat

### Send Message (Streaming)
```
POST /api/chat?stream=1
Headers: X-User-Id, X-Agent-Id, X-Session-Id
Body: {"message": "Hello!"}
```

Returns SSE stream:
```
event: avatar
data: {"mood": "happy", "intensity": 0.7}

data: {"content": "Hi"}
data: {"content": " there!"}

event: avatar
data: {"animation": "wave"}

data: {"done": true, "response": "Hi there!", "session_id": "uuid", "processing_ms": 1234, "usage": {...}}
```

### Send Message (Non-Streaming)
```
POST /api/chat?stream=0
Headers: X-User-Id, X-Agent-Id, X-Session-Id
Body: {"message": "Hello!"}
```
```json
{
  "response": "Hi there!",
  "session_id": "uuid",
  "processing_ms": 1234,
  "model": "...",
  "moods": [],
  "animations": [],
  "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
}
```

---

## Speech (TTS)

### Text to Speech
```
POST /api/speak
Headers: X-Agent-Id (optional, for agent-specific voice)
Body: {"text": "Hello!", "voice_id": "optional-override"}
```
```json
{
  "audio_base64": "<base64 mp3>",
  "alignment": {
    "chars": ["H","e","l","l","o"],
    "charStartTimesMs": [0, 50, 100, 150, 200],
    "charDurationsMs": [50, 50, 50, 50, 100]
  },
  "voice_id": "...",
  "duration_estimate": 0.5
}
```

---

## Transcription (STT)

```
POST /api/transcribe
Content-Type: multipart/form-data
Form: audio=<file>
```
```json
{"text": "Hello world", "language": "en", "processing_ms": 234}
```

---

## Memory

All memory endpoints require `?agent_id={agent_id}` parameter.

### Get MEMORY.md
```
GET /api/memory?agent_id={agent_id}
```
Returns plain text (text/markdown).

### List Memory Files
```
GET /api/memory/list?agent_id={agent_id}
```
```json
{
  "workspace": "/home/tbach/clawd-emilia-thai",
  "files": ["MEMORY.md", "2026-02-01.md", "2026-02-02.md"]
}
```

### Get Memory File
```
GET /api/memory/{filename}?agent_id={agent_id}
```
```json
{
  "filename": "2026-02-01.md",
  "content": "# Daily memory content..."
}
```

---

## Manage (Admin)

### List All Agents
```
GET /api/manage/agents
```
```json
{
  "agents": [
    {
      "id": "emilia-thai",
      "display_name": "Emilia",
      "clawdbot_agent_id": "emilia-thai",
      "vrm_model": "emilia.vrm",
      "voice_id": "...",
      "workspace": "/home/tbach/clawd-emilia-thai"
    }
  ]
}
```

### Update Agent
```
PUT /api/manage/agents/{agent_id}
Body: {"display_name": "...", "voice_id": "...", "vrm_model": "...", "workspace": "..."}
```
All fields optional.
```json
{"status": "ok", "agent_id": "emilia-thai"}
```

### List All Sessions
```
GET /api/manage/sessions
```

### Delete Agent's Sessions
```
DELETE /api/manage/sessions/agent/{agent_id}
```
```json
{"deleted": 3, "agent_id": "emilia-thai"}
```

### Delete ALL Sessions
```
DELETE /api/manage/sessions/all
```
```json
{"deleted": 10}
```

---

## Error Responses

```json
{"detail": "Error message"}
```

| Code | Meaning |
|------|---------|
| 400 | Bad request |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (cannot access resource) |
| 404 | Not found |
| 500 | Internal server error |
| 503 | Service unavailable |
| 504 | Timeout |

---

**Version:** 5.5.1
