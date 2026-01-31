# Emilia Web App - v3.4.1 ✅

**Voice + Text Chat with Full Dashboard**

Web interface with dual input modes (voice PTT + text), streaming responses, TTS voice output, session management, and full agent debug dashboard.

**Built by Ram for Emilia waifu project**

---

## Current Features (v3.4.1)

### Core Chat
| Feature | Status | Notes |
|---------|--------|-------|
| Text input | ✅ | Type messages, Enter to send |
| Push-to-Talk | ✅ | Hold button or spacebar |
| SSE streaming | ✅ | Real-time text as LLM generates |
| Stop button | ✅ | Interrupt generation or TTS |
| Replay button | ✅ | Re-hear any assistant message |
| Auto-focus | ✅ | Input focused on load |

### Voice (TTS)
| Feature | Status | Notes |
|---------|--------|-------|
| ElevenLabs TTS | ✅ | Sarah voice, turbo model |
| TTS toggle | ✅ | Off by default, persists to localStorage |
| Voice ring animation | ✅ | Visual pulse while speaking |
| Speaking indicator | ✅ | Green pulse state |

### Session Management
| Feature | Status | Notes |
|---------|--------|-------|
| Session switcher | ✅ | Dropdown to switch sessions |
| `/api/sessions/list` | ✅ | Lists available Emilia sessions |
| New session button | ✅ | Create fresh conversation |

### Dashboard Mode
| Feature | Status | Notes |
|---------|--------|-------|
| Memory viewer | ✅ | **Read-only** - MEMORY.md + daily logs |
| Chat filters | ✅ | Toggle reasoning, thinking, tokens, metadata |
| Stats panel | ✅ | Message count, tokens, latency, model |
| State log | ✅ | Real-time state transitions |

### Security
| Feature | Status | Notes |
|---------|--------|-------|
| Memory read-only | ✅ | POST returns 403, frontend disabled |
| Emilia-only routing | ✅ | Locked to `x-clawdbot-agent-id: emilia` |
| CORS allowlist | ✅ | No wildcard with credentials |
| Token auth | ✅ | Bearer token required |

### UI/UX
| Feature | Status | Notes |
|---------|--------|-------|
| Mobile responsive | ✅ | Touch-friendly, collapsible panels |
| Dark theme | ✅ | Modern styling |
| Error handling | ✅ | User-friendly error messages |
| Debug panel | ✅ | Collapsible dev tools |

---

## Not Yet Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| VRM avatar | ❌ | Placeholder div exists, no Three.js integration |
| Lip sync | ❌ | Needs ElevenLabs phoneme data + viseme mapping |
| Live2D | ❌ | Alternative to VRM, not started |
| Voice selection UI | ❌ | Backend supports it, no frontend picker |

---

## Quick Start

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

## API Endpoints

### Chat
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | GET | Send message, get response (supports `?stream=1` for SSE) |
| `/api/speak` | POST | TTS synthesis via ElevenLabs |

### Sessions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions/list` | GET | List available Emilia sessions |

### Memory (Read-Only)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/memory` | GET | Read MEMORY.md |
| `/api/memory/list` | GET | List memory/*.md files |
| `/api/memory/{filename}` | GET | Read specific memory file |
| `/api/memory` | POST | **Disabled** - returns 403 |
| `/api/memory/{filename}` | POST | **Disabled** - returns 403 |

### Transcription
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transcribe` | POST | Audio → text via STT service |

### Health
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Backend + STT service status |

---

## Development

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Run Tests
```bash
cd backend
source .venv/bin/activate
pytest -q
# Expected: 28 passed
```

### Frontend
```bash
cd frontend
python -m http.server 3000
```

### Full Stack
```bash
docker-compose up --build
```

---

## Architecture

```
User Browser (localhost:3000)
    ↓
Frontend (nginx)
    ↓ REST API / SSE
Backend (FastAPI :8080)
    ├─→ Clawdbot Gateway (chat, sessions)
    ├─→ ElevenLabs (TTS)
    └─→ STT Service (192.168.88.252:8765)
```

---

## File Structure

```
emilia-webapp/
├── backend/
│   ├── main.py              # FastAPI server (25k+ lines)
│   ├── parse_chat.py        # Response parsing module
│   ├── tests/               # pytest suite
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html           # Main dashboard UI
│   ├── app.js               # Core app logic (63k)
│   ├── style.css            # Dark theme + responsive
│   └── avatar.js            # VRM loader (placeholder)
├── docker-compose.yml
├── nginx.conf
├── CHANGELOG.md
├── SECURITY-NOTES.md
└── README.md
```

---

## Security Notes

See `SECURITY-NOTES.md` for full details.

**Key points:**
- Memory viewer is **read-only** (POST returns 403)
- App is locked to Emilia agent only
- Never routes to main/Beatrice
- CORS uses explicit allowlist
- Secrets from environment variables

---

**Version:** 3.4.1 | 2026-01-31  
**Tests:** 28 passed  
**Built by:** Ram 🩷
