# Emilia Web App API

Base URL: `http://localhost:8080`

## Authentication

All endpoints (except `/api/health`) require:
```
Authorization: Bearer <token>
```
Dev token: `emilia-dev-token-2026` (when `AUTH_ALLOW_DEV_TOKEN=1`)

Most endpoints also require headers:
```
X-User-Id: <user_id>
X-Agent-Id: <agent_id>      # for agent-scoped requests
X-Session-Id: <session_id>  # for session-scoped requests
```

---

## Health

```
GET /api/health
```
No auth. Returns `{"status": "ok", "version": "2.0.0"}`.

---

## Users

### List Users
```
GET /api/users
```
Returns all users with agent counts.
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
    {"id": "emilia-thai", "display_name": "Emilia", "vrm_model": "emilia.vrm"},
    {"id": "rem", "display_name": "Rem", "vrm_model": "emilia.vrm"}
  ]
}
```

### Get User's Agents
```
GET /api/users/{user_id}/agents
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
  "vrm_model": "emilia.vrm",
  "voice_id": "...",
  "owners": ["thai"]
}
```

---

## Sessions

SQLite-backed session management. Sessions link users to agents and track conversation metadata.

### List Sessions (for agent)
```
GET /api/sessions
Headers: X-User-Id, X-Agent-Id
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
Headers: X-User-Id, X-Agent-Id
Body: {"agent_id": "emilia-thai", "name": "Optional Name"}
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
Returns `{"deleted": true}`.

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
  "count": 2
}
```

---

## Admin (Session Management)

### List All Sessions
```
GET /api/admin/sessions
```

### Delete All Sessions for Agent
```
DELETE /api/admin/sessions/agent/{agent_id}
```
Returns `{"deleted": 3, "agent_id": "emilia-thai"}`.

### Delete ALL Sessions
```
DELETE /api/admin/sessions/all
```

---

## Chat

### Stream Chat
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

data: {"done": true, "response": "Hi there!", "session_id": "uuid", "processing_ms": 1234, "model": "claude-sonnet-4-20250514", "moods": [...], "animations": [...]}
```

### Non-Stream Chat
```
POST /api/chat?stream=0
```
Returns complete response as JSON.

---

## Speech (TTS)

### Speak
```
POST /api/speak
Body: {"text": "Hello!", "voice_id": "optional"}
```
```json
{
  "audio_base64": "<base64 mp3>",
  "alignment": {
    "chars": ["H","e","l","l","o"],
    "charStartTimesMs": [0, 50, 100, 150, 200],
    "charDurationsMs": [50, 50, 50, 50, 100]
  }
}
```

### List Voices
```
GET /api/voices
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

### Get MEMORY.md
```
GET /api/memory
Headers: X-Agent-Id
```

### List Memory Files
```
GET /api/memory/list
Headers: X-Agent-Id
```

### Get Memory File
```
GET /api/memory/{filename}
Headers: X-Agent-Id
```

---

## Error Responses

```json
{"detail": "Error message"}
```

Status codes:
- `400` - Bad request
- `401` - Unauthorized (invalid token)
- `403` - Forbidden (cannot access resource)
- `404` - Not found
- `503` - Service unavailable
