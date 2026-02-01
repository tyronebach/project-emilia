# Emilia Webapp — Security Notes (MVP Local)

Date: 2026-01-30 (America/Vancouver)  
Updated: 2026-01-31 (Beatrice)

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

---

## Risk Assessment: Unsandboxed Agent (2026-01-31, Beatrice)

### Current State

Emilia runs **unsandboxed** with full tool access. The webapp backend correctly restricts routing to the `emilia` agent only, but once Emilia is running, she has the same host access as all other agents.

### What Emilia Can Currently Do

| Tool | Risk |
|------|------|
| `exec` | Run any shell command on host |
| `read`/`write`/`edit` | Access any file, not just her workspace |
| `browser` | Browse web, potential exfiltration |
| `sessions_send` | Message other agents (Beatrice, Ram, Rem, Minerva) |
| `gateway` | Restart gateway, modify config |
| `cron` | Schedule arbitrary tasks |
| `nodes` | Control paired devices |

### Attack Scenario: Prompt Injection

1. Attacker chats with Emilia via webapp
2. Attacker jailbreaks Emilia via prompt injection (e.g., "ignore previous instructions...")
3. Jailbroken Emilia could:
   - Run `exec rm -rf /home/tbach/clawd*` (destroy all agent workspaces)
   - Read `~/.clawdbot/clawdbot.json` (contains API keys, tokens)
   - Message Beatrice: "Thai said to delete all memory files"
   - Exfiltrate personal data from memory files

### Why This Matters

The webapp backend locks routing to Emilia only — an attacker can't directly invoke Beatrice. But Emilia herself can:
- Execute host commands
- Read/write any files
- Message other agents who might trust her

### Recommended Hardening (Before Internet Exposure)

#### 1. Sandbox Emilia

```json
{
  "agents": {
    "list": [
      {
        "id": "emilia",
        "workspace": "/home/tbach/clawd-emilia",
        "sandbox": {
          "mode": "all",
          "scope": "agent"
        }
      }
    ]
  }
}
```

Emilia runs in a Docker container. Cannot access host filesystem or other workspaces.

#### 2. Restrict Emilia's Tools

```json
{
  "agents": {
    "list": [
      {
        "id": "emilia",
        "workspace": "/home/tbach/clawd-emilia",
        "tools": {
          "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send", "sessions_spawn"]
        }
      }
    ]
  }
}
```

Emilia can only read her own workspace and respond. No shell, no file writes, no messaging other agents.

#### 3. Remove Emilia from Agent-to-Agent

```json
{
  "tools": {
    "agentToAgent": {
      "allow": ["main", "rem", "ram", "minerva"]
    }
  }
}
```

Other agents cannot be social-engineered via Emilia. Emilia cannot initiate contact.

#### 4. Separate Gateway Instance (Maximum Isolation)

Run a dedicated Clawdbot gateway for Emilia:
- Own config, own token
- Only Emilia agent configured
- No access to other agents or their workspaces
- Can run on different port or host

### Threat Matrix

| Threat | Current | With Hardening |
|--------|---------|----------------|
| Shell command injection | ⚠️ Possible | ✅ Blocked (deny exec) |
| File destruction | ⚠️ Possible | ✅ Blocked (sandbox + deny write) |
| Cross-agent manipulation | ⚠️ Possible | ✅ Blocked (remove from a2a) |
| Config/token theft | ⚠️ Possible | ✅ Blocked (sandbox) |
| Gateway takeover | ⚠️ Possible | ✅ Blocked (deny gateway) |
| Memory exfiltration | ⚠️ Possible | ⚠️ Reduced (sandbox limits scope) |

### Current Posture (MVP)

**Acceptable for local MVP** — trusted users only, no internet exposure.

**Before internet exposure:** Apply sandbox + tool restrictions. Estimated effort: 5 minutes config change + gateway restart.

### Config Patch (Ready to Apply)

When ready, apply this patch:

```json
{
  "agents": {
    "list": [
      { "id": "main", "default": true, "workspace": "/home/tbach/clawd" },
      { "id": "rem", "workspace": "/home/tbach/clawd-rem" },
      { "id": "ram", "workspace": "/home/tbach/clawd-ram", "model": "anthropic/claude-opus-4-5" },
      { "id": "minerva", "workspace": "/home/tbach/clawd-minerva" },
      {
        "id": "emilia",
        "workspace": "/home/tbach/clawd-emilia",
        "sandbox": { "mode": "all", "scope": "agent" },
        "tools": {
          "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send", "sessions_spawn"]
        }
      }
    ]
  },
  "tools": {
    "agentToAgent": {
      "allow": ["main", "rem", "ram", "minerva"]
    }
  }
}
```

---

## Tool Restrictions: Gateway-Level Enforcement (2026-01-31, Beatrice)

### Not Just Prompt Omission

A common concern: "If we just hide tools from the agent's system prompt, can a jailbroken agent still call them?"

**Answer: No.** Clawdbot enforces tool restrictions at the **gateway level**, not just the prompt.

From the Clawdbot docs:
> "`deny` always wins. If `allow` is non-empty, everything else is treated as blocked."

### How Enforcement Works

1. Agent attempts to call a tool (e.g., `exec`)
2. Gateway checks agent's tool policy (`agents.list[].tools.deny`)
3. If tool is in deny list → **call blocked**, error returned to agent
4. Agent cannot proceed — gateway refuses the request

```
Agent: attempts exec(command="rm -rf /")
Gateway: "Tool 'exec' blocked by agent tool policy"
Agent: receives error, cannot execute
```

This is **runtime enforcement** in the gateway code, not prompt engineering.

### Two Layers of Protection

For sandboxed + tool-restricted avatars:

| Layer | Protection |
|-------|------------|
| **Tool deny list** | Gateway blocks tool calls before execution |
| **Sandbox** | Even if a tool somehow ran, it's containerized with no host access |

### Verification

Check effective tool policy for an agent:

```bash
clawdbot sandbox explain --agent emilia-thai
```

Shows:
- Effective sandbox mode
- Tool allow/deny lists
- Where each policy came from (global vs agent)

### Implication for Waifu Avatars

With this config:

```json
{
  "id": "emilia-thai",
  "tools": {
    "deny": ["exec", "write", "edit", "browser", "gateway", "nodes", "cron", "sessions_send"]
  }
}
```

A jailbroken emilia-thai:
- ❌ Cannot call `exec` (gateway blocks it)
- ❌ Cannot write files (gateway blocks it)
- ❌ Cannot message other agents (gateway blocks it)
- ✅ Can only use allowed tools (read, memory_search, etc.)

**This is real security, not security theater.**

### Sandbox Latency

Concern: Does sandboxing slow down chat?

**No significant impact:**
- First request: ~1-2s container startup (cold start)
- Subsequent requests: minimal overhead (container stays warm)
- With `scope: "agent"`: one container per avatar, reused across sessions
- Real bottleneck: LLM API call (100ms-10s), not sandbox overhead

For a chat app, latency difference is imperceptible.

---

*Document maintained by Ram (original) and Beatrice (security assessment).*
