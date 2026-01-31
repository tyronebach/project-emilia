# Upgrading from Milestone 1 to Milestone 2

Quick guide for Thai to upgrade the deployment.

---

## What Changed

**Milestone 2 adds:**
- Clawdbot Brain integration (agent responses)
- `/api/chat` endpoint
- "Thinking" state in UI
- Agent response display

---

## Prerequisites

✅ **Clawdbot must be running on the host**
```bash
# Check if Clawdbot is running
curl http://127.0.0.1:18789/health

# If not, start it
clawdbot gateway start
```

✅ **Clawdbot token** (already in docker-compose.yml)

---

## Upgrade Steps

### 1. Stop current deployment
```bash
cd /home/tbach/clawd-minerva/emilia-webapp
docker-compose down
```

### 2. Rebuild backend
```bash
docker-compose build backend
```

### 3. Start services
```bash
docker-compose up -d
```

### 4. Verify
```bash
# Check health (should show brain_service healthy)
curl http://localhost:8080/api/health | jq .

# Test chat API
curl -X POST http://localhost:8080/api/chat \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}' \
  | jq .
```

### 5. Test in browser
```bash
open http://localhost:3000
```

Hold PTT, say something, release → should see agent response!

---

## If Brain Service Shows Offline

**Check Clawdbot is running:**
```bash
clawdbot gateway status
```

**Check from inside container:**
```bash
docker exec emilia-backend curl http://host.docker.internal:18789/health
```

**If that fails:**
- Restart Clawdbot gateway
- Check firewall isn't blocking port 18789
- Verify token matches in both places

---

## Configuration

All in `docker-compose.yml`:
```yaml
environment:
  - CLAWDBOT_URL=http://host.docker.internal:18789
  - CLAWDBOT_TOKEN=98c881b6e395081ac71e0ac24694b84048d3e41c81b2d95b
  - CLAWDBOT_AGENT_ID=main
```

**To use a different agent:**
Change `CLAWDBOT_AGENT_ID=main` to `CLAWDBOT_AGENT_ID=emilia` (when ready)

---

## Rollback (if needed)

```bash
# Stop new version
docker-compose down

# Check out previous version
# Or use old backup

# Rebuild and start
docker-compose build
docker-compose up -d
```

---

**Status:** Ready to upgrade ✅
