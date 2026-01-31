# Changelog

All notable changes to Emilia Web App will be documented in this file.

---

## [3.5.0] - 2026-01-31

### Added
- **VRM Avatar Panel** - Collapsible avatar display integrated into main dashboard
- **Rose Model** - Default VRM from 100Avatars (Arweave hosted)
- **Avatar State Persistence** - Collapse state saved to localStorage
- **Load Status Indicator** - Shows "Loading...", "Rose ✓", or "Error" in panel header

### Technical
- Import map for three.js + @pixiv/three-vrm CDN modules
- Avatar panel above chat filters, collapsible with chevron toggle
- Custom events `avatarLoaded` / `avatarError` dispatched by avatar.js
- CSS for `.avatar-panel`, `.avatar-panel.collapsed` transitions
- Mobile responsive: smaller height, hidden in landscape

### VRM Details
- Model: Rose (Avatar 057) from 100Avatars R1 collection
- URL: `https://arweave.net/Ea1KXujzJatQgCFSMzGOzp_UtHqB1pyia--U3AtkMAY`
- License: CC0 (no attribution required)
- Features: Idle blink animation, lip sync API stub

---

## [3.4.0] - 2026-01-31

### Added
- **SSE Streaming** - Chat responses now stream in real-time via Server-Sent Events
- **Stop Button** - Interrupt generation or TTS playback mid-stream
- **Replay Button** - Play icon on assistant messages to re-hear TTS
- **Voice Ring Animation** - Visual ring pulses outward while Emilia speaks
- **Auto-focus Input** - Text input focused on page load for immediate typing

### Technical
- `GET /api/chat?stream=1` returns SSE with `{content: "..."}` chunks
- `AbortController` integration for cancellable fetch requests
- `currentAudio` tracking for stop functionality
- CSS `@keyframes voice-ring-pulse` with staggered multi-ring effect
- `textInput.focus()` in init for auto-focus

---

## [3.3.0] - 2026-01-31

### Added
- **TTS toggle** - Voice checkbox in header (default OFF), persisted to localStorage
- **Session switcher** - Dropdown to switch between Emilia sessions
- **Session list API** - `GET /api/sessions/list` calls gateway tools/invoke
- **Sessions hint** - UI warning when gateway blocks session listing
- **Parse tests** - pytest suite for `parse_chat.py`

### Changed
- **Memory viewer read-only** - Removed contentEditable, no more save-on-blur (security)
- **Parsing** - Handles `message.content` as string OR array of content parts
- **Meta filter** - Now actually hides `.message-meta` when unchecked

### Fixed
- TTS no longer fires when toggle is OFF
- Reasoning/thinking extraction from array-style content parts

### Technical
- Added `backend/parse_chat.py` module
- Added `backend/tests/test_parse_chat.py` (2 tests)
- Use venv for Python dev: `python3 -m venv backend/.venv`

---

## [3.2.0] - 2026-01-30

### Added - Dashboard Mode (Full Agent Debug View)
- **Memory viewer panel** - Left sidebar with MEMORY.md + daily logs tabs
- **Editable memory** - Click to edit memory files, auto-save on blur
- **Live memory updates** - Auto-refresh every 5s to see Emilia's changes
- **Memory write API** - POST /api/memory and POST /api/memory/{filename}
- **Chat filters** - Toggle reasoning, thinking, tokens, metadata display
- **Reasoning display** - LLM reasoning shown in chat (when present)
- **Thinking display** - Extended thinking shown in chat (when present)
- **Token usage** - Per-message token stats (prompt + completion + total)
- **Stats panel** - Right sidebar with message count, total tokens, avg latency, model
- **State log** - Real-time state transition log with timestamps
- **Enhanced metadata** - Chat responses include model, finish_reason, usage, reasoning, thinking

### Changed
- **Backend version** - Updated to 3.2.0
- **Frontend layout** - 3-panel dashboard (memory + chat + stats)
- **Chat response** - Now includes full metadata (model, tokens, reasoning)
- **Docker volume** - Emilia workspace mounted read-write (was read-only)
- **Memory endpoints** - Now support both read (GET) and write (POST)

### Technical
- Added `MemoryUpdateRequest` Pydantic model
- Added POST /api/memory for MEMORY.md updates
- Added POST /api/memory/{filename} for daily file updates
- Enhanced chat response with reasoning/thinking extraction
- Dashboard JavaScript extensions (~300 LOC)
- Memory auto-refresh with 5s polling
- Editable pre tags with contentEditable
- Stats tracking (messages, tokens, latency)
- State logging with timestamps
- Enhanced `addMessage()` with reasoning/thinking/tokens
- Filter toggles for chat display options

---

## [3.1.0] - 2026-01-30

### Added - UI Redesign + Text Input
- **Text input box** - Type messages instead of voice-only PTT
- **Send button** - Click or press Enter to send text
- **Avatar display area** - Placeholder for VRM/Live2D avatar (left panel)
- **Redesigned layout** - Avatar (left) + Chat (right) + Input (bottom)
- **Compact PTT button** - Smaller voice button next to text input
- **Text/voice flexibility** - Choose between typing or speaking

### Changed
- **Layout architecture** - New flexbox layout with avatar container
- **PTT button** - Now compact 50px button in input controls
- **Chat panel** - More prominent, takes full right side
- **Input controls** - Bottom bar with text box + send + PTT
- **Responsive design** - Avatar hides on mobile, chat expands

### Technical
- Added `sendTextMessage()` function
- Added text input and send button event handlers
- Text input enabled independently of mic (works always)
- PTT button class changed to `ptt-button-compact`
- New CSS grid layout for app structure
- Avatar container with placeholder styling

---

## [3.0.0] - 2026-01-30

### Added - Milestone 3: TTS Integration
- **ElevenLabs TTS** - High-quality voice synthesis integration
- **POST /api/speak** endpoint - Convert text to speech via ElevenLabs API
- **Auto-play responses** - Voice plays automatically after text appears
- **Speaking state** - New UI state with green pulsing button during playback
- **Voice selection** - Sarah voice (EXAVITQu4vr4xnSDxMaL) for Emilia
- **Fast model** - `eleven_turbo_v2_5` for sub-second generation
- **Seamless UX** - Text appears first, then voice plays automatically
- **Error handling** - Graceful fallback if TTS fails (text still shown)

### Changed
- **Complete conversation loop** - Now includes voice output
- **Backend version** - Updated to 3.0.0
- **Frontend version** - Updated to 3.0.0
- **Docker Compose** - Added ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL env vars

### Technical
- Added `speakText()` function for TTS playback
- Added `SpeakRequest` Pydantic model
- Updated `getAgentResponse()` to call TTS after text display
- Added speaking state to CSS with green pulse animation
- Audio elements created dynamically and cleaned up after playback
- Response headers include processing time and text length

---

## [2.0.0] - 2026-01-30

### Added
- **Conversation history** - Scrollable chat view showing all message exchanges
- **Message timestamps** - HH:MM:SS format on each message
- **Performance metrics** - Display language, duration, and processing time per message
- **Clear conversation button** - One-click history reset with confirmation
- **Collapsible debug panel** - Toggle debug log visibility via header button
- **Clear debug log button** - Reset debug output independently
- **Chat bubble layout** - Distinct styling for user (right, blue) vs assistant (left, gray)
- **Auto-scroll** - Conversation view automatically scrolls to latest message
- **Empty state** - Friendly prompt when no messages exist yet
- **Header controls** - Icon buttons for clear and debug toggle
- **Better state indicators** - Enhanced visual feedback for all states
- **Message metadata display** - Show performance stats below each message

### Changed
- **UI layout** - Replaced single-response view with persistent conversation history
- **PTT button size** - Reduced from 200px to 180px for better proportions
- **Container max-width** - Increased to 900px for more breathing room
- **Debug panel** - Now collapsible instead of always visible
- **Footer text** - Updated to reflect Milestone 2 completion

### Fixed
- **Mixed content blocking** - Added nginx reverse proxy for `/api/*`
- **Microphone retry** - Improved error handling and manual retry mechanism
- **Stream cleanup** - Properly dispose audio streams between retries
- **State management** - Better handling of error states and recovery

### Technical
- Frontend now uses relative URLs via nginx proxy
- Both containers on `network_mode: host` for localhost communication
- Nginx listens on ports 3000 (HTTP → redirect) and 3443 (HTTPS)
- Backend API proxied through frontend HTTPS endpoint
- v1 files backed up with `-v1` suffix

---

## [1.0.0] - 2026-01-29

### Added
- **Push-to-talk interface** - Hold button or spacebar to record
- **MediaRecorder integration** - WebM/Opus audio capture with fallback
- **STT service integration** - Faster Whisper on RTX 3060 (192.168.88.252:8765)
- **Transcription display** - Show transcribed text with metadata
- **Brain integration** - Connect to Clawdbot Gateway (Emilia agent)
- **Chat API** - Send transcribed text to LLM and receive response
- **Modern dark theme** - Custom CSS with indigo primary color
- **Status indicators** - Visual feedback for recording/processing states
- **Debug panel** - Timestamped log of all events and API calls
- **Touch support** - Mobile-friendly PTT button
- **Keyboard support** - Spacebar PTT control
- **Health checks** - Backend monitors STT and Brain service status
- **Docker deployment** - Full stack with docker-compose
- **HTTPS support** - Self-signed certificate for localhost
- **NGINX frontend** - Static file serving with SSL termination
- **FastAPI backend** - Python server for STT/Brain proxy
- **CORS configuration** - Development-friendly headers

### Technical
- Backend: Python 3.11, FastAPI, httpx
- Frontend: Vanilla JS, modern CSS, no frameworks
- Deployment: Docker Compose with nginx + Python services
- Network: Host mode for backend, port mapping for frontend
- Auth: Bearer token (static for dev)

---

## Version Scheme

Format: `MAJOR.MINOR.PATCH`

- **MAJOR**: New milestones (1.x = Milestone 1, 2.x = Milestone 2, etc.)
- **MINOR**: Feature additions within a milestone
- **PATCH**: Bug fixes and minor improvements

---

**Maintainer:** Ram 🩷  
**Project:** Emilia waifu voice assistant  
**Repository:** /home/tbach/clawd/emilia-project/emilia-webapp
