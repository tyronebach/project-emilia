# Milestone 2: Ready to Deploy 🚀

**Built by:** Ram  
**Status:** ✅ Code complete, tested locally, ready for Thai to deploy

---

## What You Get

**User speaks** → sees transcription → sees agent response (text)

Full round-trip:
- STT working ✅
- Brain working ✅
- User speaks → Emilia responds (text) ✅

---

## Quick Deploy

```bash
cd /home/tbach/clawd-minerva/emilia-webapp

# Make sure Clawdbot is running
curl http://127.0.0.1:18789/health

# Stop old version
docker-compose down

# Rebuild backend (has Brain integration now)
docker-compose build backend

# Start everything
docker-compose up -d

# Check health
curl http://localhost:8080/api/health | jq .

# Open in browser
open http://localhost:3000
```

---

## Test It

1. Open http://localhost:3000
2. Hold PTT button
3. Say: "Hello, who are you?"
4. Release
5. **You should see:**
   - "You: Hello, who are you?"
   - Status: "Thinking..."
   - "Emilia: [agent's response]"

---

## What's New (vs Milestone 1)

**Milestone 1:** User speaks → sees transcription → sees echo  
**Milestone 2:** User speaks → sees transcription → **gets real agent response** ✅

---

## Health Check

```bash
curl http://localhost:8080/api/health
```

Should show:
```json
{
  "stt_service": { "healthy": true },
  "brain_service": { "healthy": true }
}
```

If brain_service is unhealthy:
- Make sure Clawdbot gateway is running
- Check token in docker-compose.yml matches your Clawdbot token

---

## Files Changed

- `backend/main.py` - Added /api/chat endpoint
- `frontend/app.js` - Added thinking state + chat call
- `docker-compose.yml` - Added Clawdbot config

---

## Next Milestone

**Milestone 3:** TTS integration (agent speaks back)

After that works:
- User speaks → Emilia responds with **voice** (not just text)

---

## Docs

- **MILESTONE2.md** - Complete technical details
- **UPGRADE.md** - Step-by-step upgrade from M1
- **README.md** - General usage (still valid)

---

**Ready to ship!** 🚀

— Ram 🩷
