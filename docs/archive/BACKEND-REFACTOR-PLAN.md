# Archived: Backend Refactor Plan - Multi-User (No Auth)

**Status:** Archived — superseded by the current SQLite-backed, authenticated backend.

**Date:** 2026-02-01  
**Author:** Ram  
**Status:** In Progress

---

## Goal

Transform single-user backend into multi-user system with avatar routing.
**No authentication** - trusted household environment (like Simply Piano on iPad).

**Users:** Thai, Emily  
**Avatars:** emilia-thai (→ Thai), emilia-emily (→ Emily)

---

## Design: Simply Piano Style

Users tap their name on a selection screen → see their avatars → tap avatar → chat.
No passwords, no JWT, no login. Just user selection.

---

## Data Storage

### `data/users.json`
```json
{
  "users": {
    "thai": {
      "display_name": "Thai",
      "avatars": ["emilia-thai"],
      "default_avatar": "emilia-thai",
      "preferences": {
        "tts_enabled": true,
        "theme": "dark"
      },
      "sessions": {
        "emilia-thai": "thai-emilia-main"
      }
    },
    "emily": {
      "display_name": "Emily",
      "avatars": ["emilia-emily"],
      "default_avatar": "emilia-emily",
      "preferences": {
        "tts_enabled": true,
        "theme": "dark"
      },
      "sessions": {
        "emilia-emily": null
      }
    }
  }
}
```

### `data/avatars.json`
```json
{
  "avatars": {
    "emilia-thai": {
      "display_name": "Emilia",
      "agent_id": "emilia-thai",
      "owner": "thai",
      "vrm_model": "emilia.vrm",
      "voice_id": "EXAVITQu4vr4xnSDxMaL"
    },
    "emilia-emily": {
      "display_name": "Emilia",
      "agent_id": "emilia-emily",
      "owner": "emily",
      "vrm_model": "emilia.vrm",
      "voice_id": "EXAVITQu4vr4xnSDxMaL"
    }
  }
}
```

---

## API Changes

### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List all users (for selection screen) |
| `/api/users/{user_id}` | GET | Get user details + their avatars |
| `/api/users/{user_id}/avatars` | GET | List avatars for user |
| `/api/users/{user_id}/select-avatar/{avatar_id}` | POST | Set active avatar, get/create session |

### Modified Endpoints

| Endpoint | Method | Changes |
|----------|--------|---------|
| `/api/chat` | POST | Add `X-User-Id` and `X-Avatar-Id` headers |
| `/api/sessions/list` | GET | Filter by active avatar's agent |
| `/api/speak` | POST | Use avatar's voice_id |

### Removed

- All `/api/auth/*` endpoints (no auth needed)
- Token verification middleware

---

## Request Flow

```
1. GET /api/users
   → Returns [{id: "thai", display_name: "Thai"}, {id: "emily", display_name: "Emily"}]

2. User taps "Thai"
   GET /api/users/thai
   → Returns {display_name: "Thai", avatars: ["emilia-thai"], ...}

3. User taps "Emilia" avatar
   POST /api/users/thai/select-avatar/emilia-thai
   → Returns {session_id: "thai-emilia-main", agent_id: "emilia-thai"}
   → If no session exists, creates one and saves to users.json

4. Chat with headers
   POST /api/chat
   Headers: X-User-Id: thai, X-Avatar-Id: emilia-thai
   Body: {message: "Hello", session_id: "thai-emilia-main"}
   → Routes to agent emilia-thai via x-clawdbot-agent-id header
```

---

## Backend Implementation

### 1. Create data files
- `data/users.json` - user accounts, preferences, session storage
- `data/avatars.json` - avatar definitions

### 2. Add user/avatar modules
- `backend/users.py` - load/save users.json, user lookup
- `backend/avatars.py` - load avatars.json, avatar lookup, agent routing

### 3. Modify main.py
- Remove token auth (keep simple API key for external access if needed)
- Add user endpoints
- Add X-User-Id, X-Avatar-Id header handling
- Route chat to correct agent based on avatar

### 4. Session management
- On avatar select: check users.json for existing session
- If none: create session ID like `{user}-{avatar}-{timestamp}`
- Save session ID back to users.json
- Return session ID to frontend

---

## Frontend Changes

### 1. User Selection Screen
- Grid/list of users (Thai, Emily)
- Tap to select → navigate to avatar selection

### 2. Avatar Selection Screen  
- Show user's avatars with VRM preview
- Tap to select → load chat with that avatar

### 3. Header Updates
- Show current user + avatar
- "Switch User" button → back to user selection

### 4. API Client Updates
- Include X-User-Id and X-Avatar-Id headers in all requests
- Store selected user/avatar in localStorage

---

## File Changes Summary

### New Files
- `data/users.json`
- `data/avatars.json`
- `backend/users.py`
- `backend/avatars.py`

### Modified Files
- `backend/main.py` - remove auth, add user/avatar routing
- `frontend/src/App.tsx` - add user/avatar selection routes
- `frontend/src/utils/api.ts` - add headers

---

## Implementation Order

1. Create `data/users.json` and `data/avatars.json`
2. Create `backend/users.py` with load/save functions
3. Create `backend/avatars.py` with avatar lookup
4. Modify `backend/main.py`:
   - Remove token verification from endpoints
   - Add `/api/users` endpoints
   - Add header-based avatar routing to `/api/chat`
5. Test backend with curl
6. Update frontend

---

## Security Note

This is intentionally auth-free for trusted household use.
For external access, keep `AUTH_TOKEN` env var check on sensitive endpoints.
