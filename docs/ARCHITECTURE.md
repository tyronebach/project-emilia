# Emilia Web App - Architecture

**Three-tier deployment architecture**

---

## Network Layout

```
Internet
    ↓ HTTPS (443)
┌─────────────────────┐
│  NGINX (Frontend)   │  ← Only public-facing component
│  Port 443           │
└─────────────────────┘
    ↓ Internal (localhost/private)
┌─────────────────────┐
│  Backend (FastAPI)  │  ← Not exposed to internet
│  Port 8080          │
└─────────────────────┘
    ↓ Internal                    ↓ LAN
┌─────────────────────┐      ┌─────────────────────┐
│  Clawdbot Gateway   │      │  STT Service        │
│  Port 18789         │      │  192.168.88.252     │
│  (localhost only)   │      │  Port 8765          │
└─────────────────────┘      └─────────────────────┘
```

---

## Security Model

### Public Access
- **Frontend (NGINX):** HTTPS on port 443
  - Serves static files
  - Proxies `/api/*` → backend
  - SSL/TLS termination

### Private Access (No Internet Exposure)
- **Backend:** `localhost:8080`
  - Token auth required
  - Only accessible via frontend proxy or localhost
  
- **Clawdbot Gateway:** `localhost:18789`
  - Token auth (Bearer)
  - Bound to loopback (`bind: loopback`)
  - Backend connects internally

- **STT Service:** `192.168.88.252:8765` (LAN only)

### Agent Routing Hardening (CRITICAL)
This waifu app must **only** ever talk to the **Emilia** agent.

**Rule:** never “default” to `main` (Beatrice). If the backend ever routes to `main`, you’ve effectively bypassed the guardrails.

Enforcement:
- Docker env must set `CLAWDBOT_AGENT_ID=emilia`
- Backend code must **fail closed** if `CLAWDBOT_AGENT_ID` is anything other than `emilia`
  - See `backend/main.py`: `ALLOWED_CLAWDBOT_AGENT_IDS = {"emilia"}`
- Backend must **not** have hardcoded secrets:
  - `CLAWDBOT_TOKEN` is **required** via env (no defaults)
  - `AUTH_TOKEN` is **required** via env (dev-only default requires `AUTH_ALLOW_DEV_TOKEN=1`)
- CORS must be an explicit allowlist (no `"*"` when `allow_credentials=true`)

If you need multiple agents later, do it as **separate backends** (or separate gateway tokens) with explicit allowlists.

---

## Health Checks

### Backend `/api/health`
**Purpose:** Verify frontend → backend connectivity

**Expected response:**
```json
{
  "status": "ok",
  "api": "healthy",
  "stt_service": {
    "healthy": true,
    "url": "http://192.168.88.252:8765",
    "info": {...}
  },
  "brain_service": {
    "healthy": false,
    "url": "http://127.0.0.1:18789",
    "agent_id": "emilia",
    "info": {"error": "Expecting value: line 1 column 1 (char 0)"}
  }
}
```

**Note on `brain_service.healthy: false`:**
- Gateway `/health` endpoint returns HTML (control UI), not JSON
- **This is cosmetic** — actual API functionality verified via `/v1/chat/completions`
- Brain integration confirmed working ✅

---

## Connection Verification (2026-01-30)

### Gateway → Backend
```bash
# Gateway reachable on localhost
curl -I http://localhost:18789/health \
  -H "Authorization: Bearer REDACTED"
# → 200 OK (returns HTML UI)

# Chat completions endpoint working
curl http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer REDACTED" \
  -H "Content-Type: application/json" \
  -H "x-clawdbot-agent-id: emilia" \
  -d '{"model":"clawdbot","messages":[{"role":"user","content":"test"}],"stream":false}'
# → 200 OK with valid JSON response ✅
```

### Backend Status
```bash
curl http://localhost:8080/api/health | jq .
# → Backend API healthy, STT service connected ✅
```

---

## Deployment Notes

1. **Frontend:** Publicly accessible, SSL required in production
2. **Backend:** Internal only — no direct internet access
3. **Gateway:** Localhost binding — backend connects via `127.0.0.1:18789`
4. **STT Service:** LAN-only — no internet routing needed

**Security:** Only the NGINX frontend accepts connections from the internet. All backend services are isolated.

---

**Verified:** 2026-01-30  
**Engineer:** Ram 🩷
