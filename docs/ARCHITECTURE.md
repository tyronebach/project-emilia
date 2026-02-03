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

### Agent Routing + Access Control
Agent routing is controlled by the database mapping of users → agents:
- Requests include `X-User-Id` and `X-Agent-Id`
- Backend verifies access via `user_agents` and `session_participants`
- Agent routing uses the stored `clawdbot_agent_id` from the `agents` table

Guardrails:
- `CLAWDBOT_TOKEN` is **required** via env (no defaults)
- `AUTH_TOKEN` is **required** via env (dev-only default requires `AUTH_ALLOW_DEV_TOKEN=1`)
- CORS should remain an explicit allowlist for any internet exposure

---

## Health Checks

### Backend `/api/health`
**Purpose:** Verify frontend → backend connectivity

**Expected response:**
```json
{
  "status": "ok",
  "version": "5.5.3"
}
```

**Note:** This endpoint does not probe downstream services.

---

## Connection Verification (2026-01-30)

### Gateway → Backend
```bash
# Gateway reachable on localhost
curl -I http://localhost:18789/health \
  -H "Authorization: Bearer 98c881b6e395081ac71e0ac24694b84048d3e41c81b2d95b"
# → 200 OK (returns HTML UI)

# Chat completions endpoint working
curl http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer 98c881b6e395081ac71e0ac24694b84048d3e41c81b2d95b" \
  -H "Content-Type: application/json" \
  -H "x-clawdbot-agent-id: emilia" \
  -d '{"model":"clawdbot","messages":[{"role":"user","content":"test"}],"stream":false}'
# → 200 OK with valid JSON response ✅
```

### Backend Status
```bash
curl http://localhost:8080/api/health | jq .
# → Backend API healthy ✅
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
