# Emilia Web App API

Base URL: `http://localhost:8080`

## Authentication

All endpoints (except `/api/health`) require Bearer token authentication:
```
Authorization: Bearer <token>
```

Default dev token: `emilia-dev-token-2026` (when `AUTH_ALLOW_DEV_TOKEN=1`)

---

## Endpoints

### Health Check
```
GET /api/health
```
No auth required.

**Response:**
```json
{
  "status": "ok",
  "api": "healthy",
  "stt": { "healthy": true, "url": "..." },
  "brain": { "healthy": true, "url": "..." }
}
```

---

### Users

#### List Users
```
GET /api/users
```

**Response:**
```json
{
  "users": [
    {
      "id": "thai",
      "display_name": "Thai",
      "avatar_count": 1
    }
  ]
}
```

#### Get User Details
```
GET /api/users/{user_id}
```

**Response:**
```json
{
  "id": "thai",
  "display_name": "Thai",
  "avatars": [
    {
      "id": "emilia-thai",
      "display_name": "Emilia",
      "agent_id": "emilia-thai"
    }
  ]
}
```

#### Select Avatar
```
POST /api/users/{user_id}/select-avatar/{avatar_id}
```

**Response:**
```json
{
  "user_id": "thai",
  "avatar_id": "emilia-thai",
  "agent_id": "emilia-thai"
}
```

---

### Chat

```
POST /api/chat?stream=1
```

**Headers:**
```
Authorization: Bearer <token>
X-User-Id: thai
X-Avatar-Id: emilia-thai
```

**Body:**
```json
{
  "message": "Hello!",
  "session_id": "my-session-123"
}
```

#### Non-Streaming (`stream=0`)

**Response:**
```json
{
  "response": "Hi there!",
  "agent_id": "emilia-thai",
  "processing_ms": 1234,
  "model": "gpt-5.2"
}
```

#### Streaming (`stream=1`)

Returns SSE (Server-Sent Events):

```
event: avatar
data: {"mood": "happy", "intensity": 0.7}

data: {"content": "Hi"}
data: {"content": " there"}
data: {"content": "!"}

data: {"done": true, "response": "Hi there!", "processing_ms": 1234, "model": "gpt-5.2", "moods": [...], "animations": [...]}
```

---

### Sessions

#### List Sessions
```
GET /api/sessions/list
```

**Response:**
```json
{
  "sessions": [
    {
      "session_key": "agent:emilia-thai:openai-user:my-session",
      "display_id": "my-session",
      "updated_at": 1769976338403,
      "model": "gpt-5.2"
    }
  ]
}
```

#### Get Session History
```
GET /api/sessions/history/{session_id}
```

**Response:**
```json
{
  "session_id": "my-session",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "timestamp": "2026-02-01T12:00:00Z"
    },
    {
      "role": "assistant", 
      "content": "Hi there!",
      "timestamp": "2026-02-01T12:00:01Z"
    }
  ]
}
```

---

### Speech (TTS)

#### Get Available Voices
```
GET /api/voices
```

**Response:**
```json
{
  "voices": [
    {"key": "rachel", "id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "desc": "Young, calm"},
    {"key": "matilda", "id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "desc": "Warm, friendly"}
  ]
}
```

#### Text-to-Speech
```
POST /api/speak
```

**Body:**
```json
{
  "text": "Hello world!",
  "voice_id": "21m00Tcm4TlvDq8ikWAM"
}
```

**Response:**
```json
{
  "audio_base64": "<base64 mp3 data>",
  "text_length": 12,
  "processing_ms": 456,
  "has_lip_sync": true,
  "alignment": {
    "characters": ["H", "e", "l", ...],
    "character_start_times_seconds": [0.0, 0.05, ...],
    "character_end_times_seconds": [0.05, 0.1, ...]
  }
}
```

---

### Transcription (STT)

```
POST /api/transcribe
Content-Type: multipart/form-data
```

**Form Data:**
- `audio`: Audio file (webm, wav, etc.)

**Response:**
```json
{
  "text": "Hello world",
  "language": "en",
  "confidence": 0.95,
  "processing_ms": 234,
  "api_total_ms": 250
}
```

---

### Memory

#### Get Main Memory
```
GET /api/memory
```

**Response:**
```json
{
  "filename": "MEMORY.md",
  "content": "# Memory\n\n...",
  "size_bytes": 1234,
  "last_modified": "2026-02-01T12:00:00Z"
}
```

#### List Memory Files
```
GET /api/memory/list
```

**Response:**
```json
{
  "workspace": "/home/tbach/clawd-emilia",
  "files": ["2026-02-01.md", "2026-01-31.md", "2026-01-30.md"]
}
```

#### Get Memory File
```
GET /api/memory/{filename}
```

**Response:**
```json
{
  "filename": "2026-02-01.md",
  "content": "# Daily notes...",
  "size_bytes": 500,
  "last_modified": "2026-02-01T12:00:00Z"
}
```

#### Update Main Memory
```
POST /api/memory
```

**Body:**
```json
{
  "content": "New content...",
  "append": false
}
```

#### Update Memory File
```
POST /api/memory/{filename}
```

**Body:**
```json
{
  "content": "New content...",
  "append": true
}
```

---

## Error Responses

All errors return:
```json
{
  "error": "Error message",
  "status_code": 400,
  "detail": "Request: POST /api/chat"
}
```

Common status codes:
- `400` - Bad request (missing params)
- `401` - Unauthorized (invalid token)
- `403` - Forbidden (avatar doesn't belong to user)
- `404` - Not found (user/avatar/session)
- `503` - Service unavailable (TTS key missing)
