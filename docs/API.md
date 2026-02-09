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
X-User-Id: <user_id>         # Required for user/agent/session/memory endpoints
X-Agent-Id: <agent_id>       # Required for /api/chat, optional for /api/sessions
X-Session-Id: <session_id>   # Optional for /api/chat
```

---

## Health

```
GET /api/health
```
No auth required.
```json
{"status": "ok", "version": "5.5.3"}
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
Headers: X-User-Id
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
Headers: X-User-Id
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
{"deleted": 1}
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
data: {"intent": "greeting", "mood": "happy", "intensity": 0.7, "energy": "high"}

data: {"content": "Hi"}
data: {"content": " there!"}

data: {"done": true, "response": "Hi there!", "session_id": "uuid", "processing_ms": 1234, "behavior": {"intent": "greeting", "mood": "happy", "mood_intensity": 0.7, "energy": "high"}, "usage": {...}}
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
  "behavior": {
    "intent": "greeting",
    "mood": "happy",
    "mood_intensity": 0.7,
    "energy": "high"
  },
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

## User Preferences

```
PATCH /api/users/{user_id}/preferences
Content-Type: application/json
Body: {"preferences": {"voice_hands_free": true, "tts_enabled": true}}
```
```json
{
  "id": "user-123",
  "display_name": "Jane",
  "preferences": "{\"voice_hands_free\": true, \"tts_enabled\": true}",
  "created_at": 1738650000,
  "agents": []
}
```

---

## Memory

All memory endpoints require:
- `X-User-Id` header
- `?agent_id={agent_id}` query param

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

## Emotional State (Debug)

All endpoints require `Authorization: Bearer <token>`.

### Get Emotional State
```
GET /api/debug/emotional-state/{user_id}/{agent_id}
```
Returns current emotional state for a user-agent pair including clean state values, behavior levers, and relationship dimensions.

### Apply Trigger
```
POST /api/debug/emotional-trigger?user_id={user_id}&agent_id={agent_id}&trigger={trigger}&intensity=0.7
```
Manually apply a trigger for testing. Directly modifies the emotional state without going through chat.

### Reset Emotional State
```
POST /api/debug/emotional-reset/{user_id}/{agent_id}
```
Reset emotional state to agent baseline values. Clears trigger calibrations.

### Get Emotional Timeline
```
GET /api/debug/emotional-timeline/{user_id}/{agent_id}?limit=30
```
Get recent V2 emotional events for timeline/sparkline visualization. Limit range: 1-100.

### Apply Decay
```
POST /api/debug/emotional-decay/{user_id}/{agent_id}?seconds=3600
```
Manually apply time decay for testing. Simulates the passage of time without any triggers. Seconds range: 0-86400.

### Get Calibration
```
GET /api/debug/calibration/{user_id}/{agent_id}
```
Get user's trigger calibration profile for debugging, including relationship dimensions and interaction count.

---

## Designer V2

All endpoints require `Authorization: Bearer <token>`. Prefix: `/api/designer/v2`.

### Personalities

#### List Personalities
```
GET /api/designer/v2/personalities
```
Returns all agents as personality profiles (baseline, dynamics, mood, trust, trigger sensitivities, essence traits).

#### Get Personality
```
GET /api/designer/v2/personalities/{agent_id}
```
Returns personality DNA for a single agent.

#### Update Personality
```
PUT /api/designer/v2/personalities/{agent_id}
Body: {"name": "...", "baseline_valence": 0.2, "volatility": 1.0, "trigger_sensitivities": {...}, ...}
```
Update agent personality config. Supports column-level fields (name, baseline_valence, baseline_arousal, baseline_dominance, volatility, recovery_rate, vrm_model, voice_id) and profile-level fields (mood_decay_rate, mood_baseline, trust_gain_rate, trust_loss_rate, trigger_sensitivities, trigger_responses, description, essence_floors, essence_ceilings).

#### Reset Mood State
```
POST /api/designer/v2/personalities/{agent_id}/reset-mood-state
```
Reset ALL users' mood_weights and VAD back to the agent's baseline. Does not touch relationship dimensions. Returns count of users reset.

### Trigger Defaults

```
GET /api/designer/v2/trigger-defaults
```
Returns default trigger deltas for all 15 canonical triggers.

### Mood Groups

```
GET /api/designer/v2/mood-groups
```
Returns mood groups with labels, colors, and per-mood valence/arousal coordinates.

### Bonds

#### List Bonds
```
GET /api/designer/v2/bonds?agent_id={agent_id}
```
List all bonds, optionally filtered by agent_id. Returns trust, intimacy, interaction count, and last interaction.

#### Get Bond
```
GET /api/designer/v2/bonds/{user_id}/{agent_id}
```
Get full bond details for a user-agent pair including mood weights, dominant moods, and all relationship dimensions.

#### Compare Bonds
```
POST /api/designer/v2/bonds/compare
Body: {"agent_id": "...", "user_ids": ["user1", "user2"]}
```
Compare bonds across multiple users for the same agent.

#### Reset Bond
```
DELETE /api/designer/v2/bonds/{user_id}/{agent_id}
```
Reset a bond to baseline values and clear calibration.

### Calibration

#### Get Calibration
```
GET /api/designer/v2/calibration/{user_id}/{agent_id}
```
Get structured calibration profile with global and per-context-bucket breakdowns.

#### Reset All Calibration
```
DELETE /api/designer/v2/calibration/{user_id}/{agent_id}
```
Reset all trigger calibrations for a user-agent pair.

#### Reset Trigger Calibration
```
DELETE /api/designer/v2/calibration/{user_id}/{agent_id}/{trigger_type}
```
Reset calibration for a single trigger type.

### Simulation

```
POST /api/designer/v2/simulate
Body: {"agent_id": "...", "user_id": "...", "message": "Hello!"}
```
Dry-run trigger detection and state computation. Returns detected triggers with raw/effective intensities, state before/after, dimension deltas, mood shifts, and context block. Does not persist changes.

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

**Version:** 5.5.3

