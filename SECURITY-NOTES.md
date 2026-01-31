# Emilia Webapp — Security Notes (MVP Local)

Date: 2026-01-30 (America/Vancouver)

## Incident: Cross-agent routing to Beatrice ("main")
**What happened:** The waifu backend could accidentally route requests to Beatrice if the agent id env var was missing/mis-set.

**Root cause:** `backend/main.py` defaulted `CLAWDBOT_AGENT_ID` to `"main"`.

**Fix (implemented):**
- Backend defaults `CLAWDBOT_AGENT_ID` to `"emilia"`.
- Backend **fails closed** at startup if `CLAWDBOT_AGENT_ID` is anything other than `emilia`:
  - `ALLOWED_CLAWDBOT_AGENT_IDS = {"emilia"}`

## Hardening: CORS
**Issue:** CORS was too permissive:
- `allow_origins=ALLOWED_ORIGINS + ["*"]`
- `allow_credentials=True`

This combination is unsafe and can lead to unexpected cross-origin authenticated requests.

**Fix (implemented):**
- CORS is now strict allowlist only:
  - `allow_origins=ALLOWED_ORIGINS`
  - `allow_methods=["POST","GET","OPTIONS"]`
  - `allow_headers=["Authorization","Content-Type"]`

## Hardening: Secrets / tokens
**Issue:** Secrets were previously present as hardcoded defaults in code.

**Fix (implemented):**
- `CLAWDBOT_TOKEN` must be provided via environment; backend fails on startup if missing.
- `AUTH_TOKEN` must be provided via environment; backend fails on startup if missing.
- Dev convenience only:
  - `AUTH_ALLOW_DEV_TOKEN=1` allows using `emilia-dev-token-2026` when `AUTH_TOKEN` is not set.

## Hardening: Memory viewer read-only (2026-01-31)
**Issue:** Dashboard mode had editable memory fields that could POST to /api/memory endpoints.

**Fix (implemented):**
- Frontend: removed `contentEditable` on memory panes, disabled save-on-blur
- Backend: POST /api/memory and POST /api/memory/{filename} return 403
- Memory is view-only from the webapp

## Local MVP posture (current)
- Deployment is local-only; gateway is bound to loopback.
- Still, the backend must never be able to route to non-Emilia agents.

## Future (internet-exposed) checklist
If/when you expose this beyond local MVP:
- Remove dev token path (`AUTH_ALLOW_DEV_TOKEN=0`), require strong secrets.
- Rotate gateway token; ideally use a dedicated gateway/token limited to Emilia-only.
- Strict CORS to only the real domain.
- Rate limiting, logging, IP allowlist.
- Consider running a separate Clawdbot gateway instance for Emilia-only.
