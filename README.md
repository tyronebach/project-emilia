# Emilia Web App - v3.3 ✅

**Voice + Text Chat with Avatar Display**

Web interface with **dual input modes** (voice PTT + text typing), STT transcription, Clawdbot LLM agent integration, **voice responses** via ElevenLabs TTS, and **avatar display area** ready for VRM/Live2D.

**Built by Ram for Emilia waifu project**

---

## Features (v3.3)

✅ **Dual Input Modes** 🆕
- **Text input** - Type messages in text box (Enter to send)
- **Push-to-Talk** - Compact voice button next to text input
- Keyboard support (spacebar for PTT)
- Both modes share same conversation flow
- Choose voice or text per message

✅ **Avatar Display Area** 🆕
- Left panel reserved for VRM/Live2D avatar
- 350px container ready for integration
- Placeholder with hint text
- Responsive (hides on mobile)

✅ **Conversation History**
- Scrollable chat view
- Message timestamps
- Performance metrics per message
- User vs Assistant bubbles
- Auto-scroll to latest

✅ **Brain Integration**
- Clawdbot Gateway (**Emilia-only**)
- Session-based conversations
- Context-aware replies

**Security note:** this app must *never* route to `main`/Beatrice. The backend is locked to `x-clawdbot-agent-id: emilia` and will fail closed if misconfigured.

✅ **Text-to-Speech** 🎙️
- ElevenLabs voice synthesis
- Auto-play voice responses (when enabled)
- Sarah voice (mature, reassuring)
- Fast turbo model (~500ms generation)
- Speaking state indicator
- **TTS toggle** - Voice on/off in header (persists to localStorage)

✅ **Session Management** 🆕
- Session switcher dropdown
- Switch between existing Emilia sessions
- Refresh button to reload session list
- New session button

✅ **Dashboard Mode** 🆕
- Memory viewer (read-only) - MEMORY.md + daily logs
- Chat filters - reasoning, thinking, tokens, metadata
- Stats panel - message count, tokens, latency
- State log with timestamps

✅ **Enhanced UI**
- Clear conversation button
- Collapsible debug panel
- Modern dark theme
- Responsive design
- Status indicators
- Speaking state (green pulse)

---

## Security Notes (READ THIS)
For MVP local we still enforce a few invariants so we don’t accidentally punch through guardrails:
- This app must be **Emilia-only** (never route to `main`/Beatrice)
- CORS must be an explicit allowlist (no wildcard with credentials)
- Secrets must come from env (no hardcoded defaults)

See: `SECURITY-NOTES.md`

---

## Quick Start

### Local Development

```bash
cd /home/tbach/clawd/emilia-project/emilia-webapp

# Start services
docker compose up -d --build

# View logs
docker-compose logs -f

# Open in browser
open http://localhost:3000
```

**Services:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/api/health

---

## Architecture

```
User Browser (localhost:3000)
    ↓
Frontend (nginx)
    ↓ (REST API)
Backend (FastAPI :8080)
    ↓ (HTTP)
STT Service (192.168.88.252:8765)
    ↓ (CUDA)
RTX 3060
```

---

## Usage

1. **Allow microphone access** when prompted
2. **Hold the button** (or spacebar) to record
3. **Speak** your message
4. **Release** to stop and transcribe
5. **View transcription** below the button

**Current behavior:** Complete voice conversation loop - records → transcribes → sends to Emilia → displays text → **speaks voice response**

---

## API Endpoints

### GET /api/health
Health check for backend + STT service

**Response:**
```json
{
  "status": "ok",
  "api": "healthy",
  "stt_service": {
    "healthy": true,
    "url": "http://192.168.88.252:8765",
    "info": { ... }
  }
}
```

### POST /api/transcribe
Transcribe audio file

**Headers:**
- `Authorization: Bearer emilia-dev-token-2026`

**Body:**
- `audio`: audio file (multipart/form-data)

**Response:**
```json
{
  "text": "transcribed text here",
  "language": "en",
  "language_probability": 0.987,
  "duration_ms": 2340,
  "processing_ms": 456,
  "api_total_ms": 489
}
```

---

## Configuration

### Backend (backend/main.py)

```python
STT_SERVICE_URL = "http://192.168.88.252:8765"
AUTH_TOKEN = "emilia-dev-token-2026"  # Change in production
ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:8080"]
```

### Frontend (frontend/app.js)

```javascript
const API_URL = 'http://localhost:8080';
const AUTH_TOKEN = 'emilia-dev-token-2026';
```

---

## Development

### Backend only:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8080
```

### Run tests:
```bash
cd backend
source .venv/bin/activate
pytest -q
```

### Frontend only:
```bash
cd frontend
python -m http.server 3000
# Or use any static file server
```

### Full stack:
```bash
docker-compose up --build
```

---

## Testing

**Manual test:**
1. Open http://localhost:3000
2. Hold PTT button
3. Say "Test message one two three"
4. Release
5. Should see transcription appear

**API test:**
```bash
# Health check
curl http://localhost:8080/api/health | jq .

# Transcribe (with audio file)
curl -X POST http://localhost:8080/api/transcribe \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -F "audio=@test.webm" \
  | jq .
```

---

## Performance

**Expected latency (localhost → 192.168.88.252):**
- Audio capture: ~10ms
- Upload to backend: ~20ms
- Backend → STT: ~5ms (LAN)
- STT processing: 200-800ms (depends on audio length)
- **Total: ~250-850ms** ✅

**Target met:** Under 1 second end-to-end

---

## Next Steps (Milestone 2+)

- [ ] **Brain integration** - Send transcription to LLM
- [ ] **TTS integration** - Convert response to voice
- [ ] **Streaming response** - SSE for real-time LLM output
- [ ] **Voice playback** - Auto-play TTS response
- [ ] **Session management** - Multi-turn conversations
- [ ] **Auth improvement** - OAuth or JWT

---

## Troubleshooting

**"Microphone access denied":**
- Chrome/Firefox: Check site permissions
- HTTPS required for production (localhost works without)

**"STT Service Offline":**
- Verify STT service is running: `curl http://192.168.88.252:8765/health`
- Check network connectivity to 192.168.88.252

**"API Offline":**
- Backend not running: `docker-compose up backend`
- Check logs: `docker-compose logs backend`

**No audio recorded:**
- Check browser console for MediaRecorder errors
- Verify microphone is not muted
- Try different browser (Chrome recommended)

---

## Browser Support

✅ **Chrome/Edge** (recommended)  
✅ **Firefox**  
✅ **Safari** (limited codec support)  
⚠️ **Mobile browsers** (basic support, may have latency)

---

## File Structure

```
emilia-webapp/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile           # Backend container
├── frontend/
│   ├── index.html           # UI structure
│   ├── app.js               # PTT logic + API client
│   └── style.css            # Modern dark theme
├── docker-compose.yml       # Full stack orchestration
├── nginx.conf               # Frontend web server config
└── README.md                # This file
```

---

**Status:** ✅ v3.1 - Text Input + Avatar Prep  
**Next:** Avatar Integration (VRM/Live2D), Replay button, Voice selection  
**Built by:** Ram 🩷  
**Version:** v3.1.0 | 2026-01-30
