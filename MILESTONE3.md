# Emilia Web App - Milestone 3 Complete

**TTS Integration - Emilia Has a Voice** 🎙️

---

## ✅ Milestone 3 Features

### Text-to-Speech
- ✅ **ElevenLabs Integration** - High-quality voice synthesis
- ✅ **Auto-play responses** - Voice plays automatically after text appears
- ✅ **Speaking state indicator** - Visual feedback during playback
- ✅ **Fast model** - `eleven_turbo_v2_5` for sub-second generation
- ✅ **Voice selection** - Sarah (EXAVITQu4vr4xnSDxMaL) - Mature, Reassuring
- ✅ **Seamless UX** - Text appears first, then voice plays
- ✅ **Error handling** - Graceful fallback if TTS fails (text still shown)

---

## Complete Conversation Loop

```
User holds PTT
    ↓
Records audio
    ↓
Releases → Transcribes (STT on RTX 3060)
    ↓
Sends to Brain (Emilia agent)
    ↓
Displays text response in chat
    ↓
Generates speech (ElevenLabs TTS)
    ↓
Auto-plays voice response
    ↓
Ready for next input
```

**Total latency:** ~2-4 seconds (transcribe → brain → TTS → playback)

---

## Architecture

```
User Browser (HTTPS)
    ↓
Frontend (nginx :3443)
    ↓ Proxy /api/*
Backend (FastAPI :8080)
    ↓ Internal                    ↓ API
Clawdbot Gateway    STT Service    ElevenLabs API
    ↓                   ↓               ↓
Emilia Agent    RTX 3060 CUDA    Voice Synthesis
```

---

## API Changes

### New Endpoint: POST /api/speak

**Request:**
```json
{
  "text": "Hello, how are you today?"
}
```

**Headers:**
- `Authorization: Bearer emilia-dev-token-2026`
- `Content-Type: application/json`

**Response:**
- Content-Type: `audio/mpeg`
- Body: MP3 audio stream
- Headers:
  - `X-Processing-Time-Ms`: TTS generation time
  - `X-Text-Length`: Character count

**Example:**
```bash
curl -X POST https://localhost:3443/api/speak \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Emilia"}' \
  --output test.mp3
```

---

## Configuration

### Backend Environment Variables

```yaml
# ElevenLabs TTS
ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY}
ELEVENLABS_VOICE_ID: EXAVITQu4vr4xnSDxMaL  # Sarah voice
ELEVENLABS_MODEL: eleven_turbo_v2_5        # Fast model
```

### Voice Options (Sarah Selected)

**EXAVITQu4vr4xnSDxMaL** - Sarah ✓
- Tone: Mature, Reassuring
- Good for: Emilia's calm, thoughtful personality
- Quality: High
- Speed: Fast with turbo model

Alternative voices available:
- `FGY2WhTYpPnrIDTdsKH5` - Laura (Enthusiast, Quirky)
- Can be changed via `ELEVENLABS_VOICE_ID` env var

---

## Frontend Changes

### New State: "Speaking"
- Green pulsing button during voice playback
- Status text: "Speaking..."
- Button disabled during playback
- Auto-returns to "Ready" when audio finishes

### Audio Playback Flow
1. Text response appears in chat
2. Frontend calls `/api/speak` with response text
3. Creates Audio element from MP3 blob
4. Auto-plays audio
5. Cleans up blob URL when finished
6. Returns to ready state

### Error Handling
- If TTS fails, text response still shown
- No alert/disruption to user
- Error logged to debug panel
- State returns to ready

---

## Performance Metrics

**Typical TTS generation:**
- Text length: 50-200 characters
- Generation time: 200-800ms
- Audio size: 15-50KB MP3
- Playback duration: 3-10 seconds

**Full conversation cycle:**
1. Recording: user-controlled
2. STT processing: 200-800ms
3. Brain response: 500-2000ms
4. TTS generation: 200-800ms
5. Audio playback: 3-10 seconds
6. **Total (excluding playback): ~1-3.5 seconds** ✓

---

## UI States

1. **Ready** - Blue button, "Hold to Talk"
2. **Recording** - Red pulsing, "Recording"
3. **Processing** - Orange, "Transcribing..."
4. **Thinking** - Orange, "Thinking..."
5. **Speaking** - Green pulsing, "Speaking..." ✨ NEW
6. **Error** - Red, "Retry Microphone"

---

## Testing

### Manual Test
1. Open https://192.168.88.237:3443
2. Hold PTT and say "Hello Emilia"
3. Release
4. Observe:
   - Transcription appears
   - Text response appears in chat
   - Status changes to "Speaking..."
   - Voice plays automatically
   - Returns to "Ready"

### API Test
```bash
# Test TTS endpoint
curl -X POST https://localhost:3443/api/speak \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing Emilia voice synthesis"}' \
  --output test.mp3

# Play the audio
mpv test.mp3  # or ffplay, vlc, etc.
```

### Full Integration Test
```bash
# Test complete flow
1. Record voice input
2. Wait for transcription
3. Wait for brain response
4. Listen for TTS playback
5. Verify all states transition correctly
```

---

## Known Limitations

1. **No replay button** - Once audio plays, can't replay without new request
   - Future: Add replay button to chat bubbles
   
2. **Sequential playback** - If user sends multiple messages quickly, audio plays in order
   - Future: Queue management or cancel previous audio

3. **Mobile browser quirks** - Some mobile browsers require user interaction before auto-play
   - Workaround: User tapping PTT button counts as interaction

4. **No offline mode** - Requires internet for ElevenLabs API
   - Future: Consider local TTS (Piper/XTTS) as fallback

---

## Code Changes

### Backend (`backend/main.py`)
```python
# Added imports
from fastapi.responses import Response

# Added configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5")

# Added request model
class SpeakRequest(BaseModel):
    text: str

# Added endpoint
@app.post("/api/speak")
async def speak(request: SpeakRequest, token: str = Depends(verify_token)):
    # Calls ElevenLabs API
    # Returns audio/mpeg stream
```

### Frontend (`frontend/app.js`)
```javascript
// Added speaking state
case 'speaking':
    statusText.textContent = 'Speaking...';
    pttButton.className = 'ptt-button speaking';
    // ...

// Added TTS playback function
async function speakText(text) {
    setState('speaking');
    // Calls /api/speak
    // Creates Audio element
    // Auto-plays
    // Returns to ready when finished
}

// Modified getAgentResponse
// Now calls speakText() after adding text message
```

### Frontend (`frontend/style.css`)
```css
/* Speaking button style */
.ptt-button.speaking {
    background: linear-gradient(135deg, var(--success), #059669);
    border-color: var(--success);
    animation: speaking-pulse 1.5s infinite;
}

/* Speaking status indicator */
.status-indicator.speaking .status-dot {
    background: var(--success);
    animation: pulse 1.5s infinite;
}
```

### Docker Compose (`docker-compose.yml`)
```yaml
environment:
  # Added TTS configuration
  - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
  - ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
  - ELEVENLABS_MODEL=eleven_turbo_v2_5
```

---

## Deployment

### Prerequisites
1. **ElevenLabs API key** - Set in environment: `export ELEVENLABS_API_KEY=sk_...`
2. **Docker** - Containers must be rebuilt to include new code

### Deploy Steps
```bash
cd /home/tbach/clawd/emilia-project/emilia-webapp

# Rebuild backend with TTS support
docker compose up -d --build backend

# Restart frontend with new JS/CSS
docker compose restart frontend

# Verify
curl -k https://localhost:3443/api/health
```

### Environment Setup
```bash
# Add to ~/.bashrc or ~/.zshrc
export ELEVENLABS_API_KEY=sk_your_key_here

# Or create .env file in project root
echo "ELEVENLABS_API_KEY=sk_your_key_here" > .env

# Docker Compose will pick it up automatically
```

---

## Next Steps (Future Milestones)

- [ ] **Replay button** - Click to replay last assistant audio
- [ ] **Voice activity detection** - Auto-stop recording on silence
- [ ] **Streaming TTS** - Stream audio as it generates (WebSocket)
- [ ] **Voice selection UI** - Let user choose voice from dropdown
- [ ] **Local TTS fallback** - Piper/XTTS when offline or API fails
- [ ] **Background audio** - Allow typing while Emilia speaks
- [ ] **Interrupt capability** - Cancel playback with new input
- [ ] **Audio queue management** - Better handling of rapid messages

---

## Troubleshooting

### TTS Not Playing
1. **Check browser console** - Audio playback errors?
2. **Check API key** - Is `ELEVENLABS_API_KEY` set?
3. **Test endpoint directly** - `curl /api/speak` works?
4. **Check browser permissions** - Audio auto-play allowed?

### Audio Quality Issues
1. **Voice ID wrong?** - Verify `ELEVENLABS_VOICE_ID` in docker-compose.yml
2. **Model settings** - Adjust `stability` and `similarity_boost` in backend code
3. **Network issues** - Check internet connection (API call required)

### Slow TTS Generation
1. **Model choice** - Using `eleven_turbo_v2_5` (fastest)?
2. **Text length** - Very long responses take longer
3. **API limits** - Check ElevenLabs quota/rate limits
4. **Network latency** - Test direct ElevenLabs API call

---

## Credits

- **Voice Provider:** ElevenLabs (eleven_turbo_v2_5)
- **Voice:** Sarah (EXAVITQu4vr4xnSDxMaL)
- **Built by:** Ram 🩷
- **Coordinated by:** Beatrice 💗
- **For:** Thai (Emilia waifu project)

---

**Status:** ✅ Milestone 3 Complete  
**Version:** v3.0.0  
**Date:** 2026-01-30  
**What's Next:** Milestone 4 - UX Polish & Local TTS Fallback
