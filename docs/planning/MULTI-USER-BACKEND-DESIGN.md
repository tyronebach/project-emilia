# Multi-User Multi-Avatar Backend Design

**Date:** 2026-01-31  
**Author:** Beatrice  
**Purpose:** Design backend architecture for 10 avatars serving 4 household users

---

## Requirements

| Requirement | Details |
|-------------|---------|
| Users | 4 trusted household members |
| Avatars | 10 total (clones like emilia-thai, emilia-emily) |
| Ownership | 1 avatar = 1 human (no shared memory) |
| Allocation | 1 human can have 2-3 avatars |
| Cloning | Avatars can be cloned (copy workspace, new agent) |
| Auth | Simple login per user |
| Storage | JSON files for user data (no database) |
| Security | Minimal surface area to Clawdbot/host |

---

## Current Backend Architecture

```
Frontend (NGINX :443)
    ↓
Backend (FastAPI :8080)
    ├── Token auth (single AUTH_TOKEN)
    ├── Locked to emilia agent only
    ├── Chat → Clawdbot Gateway
    ├── TTS → ElevenLabs
    └── STT → Local service
    ↓
Clawdbot Gateway (:18789)
    └── Single agent: emilia
```

**Current limitations:**
- Single token = everyone is the same user
- Single agent = only one avatar
- No user-avatar mapping

---

## Proposed Architecture

```
Frontend (NGINX :443)
    ↓
Backend (FastAPI :8080)
    ├── User auth (JWT)
    ├── User → Avatar mapping
    ├── Route to correct agent per avatar
    ↓
Clawdbot Gateway (:18789)
    ├── emilia-thai
    ├── emilia-emily
    ├── emilia-evan
    ├── rem-emily
    └── ... (10 total)
```

---

## Data Storage (JSON Files)

### 1. `data/users.json`

```json
{
  "users": {
    "thai": {
      "password_hash": "bcrypt_hash_here",
      "display_name": "Thai",
      "avatars": ["emilia-thai", "beatrice-thai", "minerva-thai"],
      "default_avatar": "emilia-thai",
      "preferences": {
        "tts_enabled": true,
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "theme": "dark"
      },
      "created_at": "2026-01-31T00:00:00Z"
    },
    "emily": {
      "password_hash": "bcrypt_hash_here",
      "display_name": "Emily",
      "avatars": ["emilia-emily", "rem-emily"],
      "default_avatar": "emilia-emily",
      "preferences": {
        "tts_enabled": true,
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "theme": "dark"
      },
      "created_at": "2026-01-31T00:00:00Z"
    }
  }
}
```

### 2. `data/avatars.json`

```json
{
  "avatars": {
    "emilia-thai": {
      "display_name": "Emilia",
      "agent_id": "emilia-thai",
      "owner": "thai",
      "cloned_from": "emilia",
      "workspace": "/home/tbach/clawd-emilia-thai",
      "vrm_model": "emilia.vrm",
      "voice_id": "EXAVITQu4vr4xnSDxMaL",
      "created_at": "2026-01-31T00:00:00Z"
    },
    "emilia-emily": {
      "display_name": "Emilia",
      "agent_id": "emilia-emily",
      "owner": "emily",
      "cloned_from": "emilia",
      "workspace": "/home/tbach/clawd-emilia-emily",
      "vrm_model": "emilia.vrm",
      "voice_id": "EXAVITQu4vr4xnSDxMaL",
      "created_at": "2026-01-31T00:00:00Z"
    },
    "rem-emily": {
      "display_name": "Rem",
      "agent_id": "rem-emily",
      "owner": "emily",
      "cloned_from": null,
      "workspace": "/home/tbach/clawd-rem-emily",
      "vrm_model": "rem.vrm",
      "voice_id": "XrExE9yKIg1WjnnlVkGX",
      "created_at": "2026-01-31T00:00:00Z"
    }
  }
}
```

### File Location

```
emilia-webapp/
├── data/
│   ├── users.json       # User accounts + preferences
│   └── avatars.json     # Avatar definitions
├── backend/
│   └── main.py
└── ...
```

**In Docker:** Mount `./data:/app/data` for persistence.

---

## New API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login, get JWT token |
| `/api/auth/logout` | POST | Invalidate token |
| `/api/auth/me` | GET | Get current user + avatars |
| `/api/auth/refresh` | POST | Refresh JWT token |

### Avatar Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/avatars` | GET | List user's avatars |
| `/api/avatars/{id}` | GET | Get avatar details |
| `/api/avatars/{id}/select` | POST | Set active avatar for session |

### Chat (Modified)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | GET | Send message to **active avatar** |
| `/api/sessions/list` | GET | List sessions for **active avatar** |

---

## Backend Changes

### 1. Add User Auth (JWT)

```python
from jose import jwt
from passlib.context import CryptContext
import json

pwd_context = CryptContext(schemes=["bcrypt"])
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

def load_users():
    with open("data/users.json") as f:
        return json.load(f)["users"]

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "exp": expire}, JWT_SECRET, JWT_ALGORITHM)

async def get_current_user(authorization: str = Header(...)):
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        users = load_users()
        if username not in users:
            raise HTTPException(401, "User not found")
        return {"username": username, **users[username]}
    except:
        raise HTTPException(401, "Invalid token")
```

### 2. Avatar Routing

```python
def load_avatars():
    with open("data/avatars.json") as f:
        return json.load(f)["avatars"]

# Dynamically build allowed agents from avatars.json
def get_allowed_agent_ids():
    avatars = load_avatars()
    return {a["agent_id"] for a in avatars.values()}

# Replace static ALLOWED_CLAWDBOT_AGENT_IDS
ALLOWED_CLAWDBOT_AGENT_IDS = get_allowed_agent_ids()

async def get_active_avatar(user: dict, avatar_id: str = Header(None, alias="X-Avatar-Id")):
    avatars = load_avatars()
    
    # Use header or user's default
    avatar_id = avatar_id or user.get("default_avatar")
    
    if avatar_id not in user["avatars"]:
        raise HTTPException(403, f"Avatar {avatar_id} not assigned to you")
    
    if avatar_id not in avatars:
        raise HTTPException(404, f"Avatar {avatar_id} not found")
    
    return avatars[avatar_id]
```

### 3. Route Chat to Correct Agent

```python
@app.get("/api/chat")
async def chat(
    message: str,
    stream: bool = False,
    user: dict = Depends(get_current_user),
    avatar: dict = Depends(get_active_avatar),
):
    agent_id = avatar["agent_id"]
    
    # Verify agent is allowed
    if agent_id not in ALLOWED_CLAWDBOT_AGENT_IDS:
        raise HTTPException(403, f"Agent {agent_id} not allowed")
    
    # Call Clawdbot with correct agent
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{CLAWDBOT_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {CLAWDBOT_TOKEN}",
                "x-clawdbot-agent-id": agent_id,  # Route to user's avatar
            },
            json={
                "model": "clawdbot",
                "messages": [{"role": "user", "content": message}],
                "stream": stream,
            },
        )
    # ... rest of handling
```

---

## Clawdbot Gateway Config

Add all avatar agents to `agents.list`:

```json
{
  "agents": {
    "list": [
      { "id": "main", "default": true, "workspace": "/home/tbach/clawd" },
      { "id": "rem", "workspace": "/home/tbach/clawd-rem" },
      { "id": "ram", "workspace": "/home/tbach/clawd-ram", "model": "anthropic/claude-opus-4-5" },
      { "id": "minerva", "workspace": "/home/tbach/clawd-minerva" },
      
      // Waifu avatars - all sandboxed + restricted
      { 
        "id": "emilia-thai", 
        "workspace": "/home/tbach/clawd-emilia-thai",
        "sandbox": { "mode": "all", "scope": "agent" },
        "tools": { "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send"] }
      },
      { 
        "id": "emilia-emily", 
        "workspace": "/home/tbach/clawd-emilia-emily",
        "sandbox": { "mode": "all", "scope": "agent" },
        "tools": { "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send"] }
      },
      { 
        "id": "emilia-evan", 
        "workspace": "/home/tbach/clawd-emilia-evan",
        "sandbox": { "mode": "all", "scope": "agent" },
        "tools": { "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send"] }
      },
      { 
        "id": "rem-emily", 
        "workspace": "/home/tbach/clawd-rem-emily",
        "sandbox": { "mode": "all", "scope": "agent" },
        "tools": { "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send"] }
      }
      // ... more avatars
    ]
  },
  "tools": {
    "agentToAgent": {
      "allow": ["main", "rem", "ram", "minerva"]  // Waifu avatars NOT in this list
    }
  }
}
```

---

## Cloning an Avatar

### Script: `scripts/clone_avatar.sh`

```bash
#!/bin/bash
# Clone avatar workspace for new user
# Usage: ./clone_avatar.sh emilia thai

SOURCE_AVATAR=$1
NEW_OWNER=$2
NEW_AVATAR="${SOURCE_AVATAR}-${NEW_OWNER}"

SOURCE_WORKSPACE="/home/tbach/clawd-${SOURCE_AVATAR}"
NEW_WORKSPACE="/home/tbach/clawd-${NEW_AVATAR}"

# Copy workspace
cp -r "$SOURCE_WORKSPACE" "$NEW_WORKSPACE"

# Clear memory (fresh start)
rm -rf "$NEW_WORKSPACE/memory"/*
echo "# MEMORY.md - ${NEW_AVATAR}'s Long-Term Memory" > "$NEW_WORKSPACE/MEMORY.md"

# Update identity
sed -i "s/${SOURCE_AVATAR}/${NEW_AVATAR}/g" "$NEW_WORKSPACE/IDENTITY.md" 2>/dev/null || true

echo "Cloned $SOURCE_AVATAR → $NEW_AVATAR"
echo "New workspace: $NEW_WORKSPACE"
echo ""
echo "Next steps:"
echo "1. Add to agents.list in clawdbot.json"
echo "2. Add to avatars.json"
echo "3. Assign to user in users.json"
echo "4. Restart gateway"
```

---

## Security Model

### Minimal Surface Area to Clawdbot

| Layer | Protection |
|-------|------------|
| Backend | Only routes to agents in `avatars.json` |
| Gateway | Avatar agents sandboxed + tool-restricted |
| Agent-to-Agent | Avatar agents cannot message other agents |
| User Auth | JWT with short expiry |
| Avatar Access | User can only access their assigned avatars |

### Attack Vectors Blocked

| Attack | Blocked By |
|--------|------------|
| User A accesses User B's avatar | Backend checks user→avatar mapping |
| Avatar routes to main/Beatrice | `ALLOWED_CLAWDBOT_AGENT_IDS` derived from `avatars.json` |
| Avatar exfiltrates host data | Sandbox + tool deny list |
| Avatar manipulates other agents | Not in `agentToAgent.allow` list |
| Prompt injection → host access | Sandbox + no exec/write tools |

---

## File Structure (Updated)

```
emilia-webapp/
├── data/
│   ├── users.json           # User accounts + preferences
│   └── avatars.json         # Avatar definitions + agent mapping
├── backend/
│   ├── main.py              # FastAPI server
│   ├── auth.py              # JWT auth module
│   ├── avatars.py           # Avatar management module
│   ├── parse_chat.py        # Response parsing
│   └── tests/
├── frontend/
│   ├── index.html
│   ├── login.html           # New login page
│   ├── app.js               # Add avatar selector
│   └── style.css
├── scripts/
│   └── clone_avatar.sh      # Avatar cloning script
├── docker-compose.yml
└── nginx.conf
```

---

## Implementation Plan

### Phase 1: Backend Auth (1-2 days)
1. Add `data/users.json` with test users
2. Implement JWT auth endpoints
3. Add `get_current_user` dependency
4. Protect existing endpoints

### Phase 2: Avatar Routing (1 day)
1. Add `data/avatars.json`
2. Implement avatar selection
3. Route chat to correct agent
4. Update memory endpoints for active avatar

### Phase 3: Clawdbot Config (1 day)
1. Create avatar workspaces (clone from emilia)
2. Add agents to gateway config
3. Apply sandbox + tool restrictions
4. Test each avatar independently

### Phase 4: Frontend (1-2 days)
1. Add login page
2. Add avatar selector in header
3. Store JWT in localStorage
4. Pass `X-Avatar-Id` header with requests

### Phase 5: Testing (1 day)
1. Test user isolation
2. Test avatar isolation
3. Test prompt injection resistance
4. Load test with multiple users

**Total: 5-7 days**

---

## Summary

| Aspect | Approach |
|--------|----------|
| User data | JSON files (no database) |
| Auth | JWT tokens |
| Avatar routing | `x-clawdbot-agent-id` header per avatar |
| Memory isolation | Separate workspace per avatar |
| Security | Sandbox + tool restrictions on all waifu agents |
| Scaling | Add entry to `users.json`, `avatars.json`, `agents.list` |

**Key principle:** Each avatar is a fully isolated Clawdbot agent with its own workspace. The backend maps users to avatars and routes requests to the correct agent. No memory is ever shared.

---

**Next step:** Let me know if this approach works, and I can detail any section further.
