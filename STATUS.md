# Emilia Web App - Current Status

**Version:** 3.5.0  
**Date:** 2026-01-31  
**Status:** ✅ Feature Complete (MVP Dashboard + VRM Avatar)  
**Tests:** 28 passed

---

## Completed Features

### v3.4.x (Current)
- [x] SSE streaming responses
- [x] Stop button (interrupt generation/TTS)
- [x] Replay button (re-hear messages)
- [x] Voice ring animation
- [x] Auto-focus input
- [x] Mobile responsive CSS
- [x] Error handling improvements
- [x] pytest coverage (28 tests)

### v3.3.x
- [x] **Memory viewer read-only** - contentEditable removed, POST returns 403
- [x] **TTS toggle** - Default OFF, persists to localStorage
- [x] **Session switcher** - Dropdown + /api/sessions/list
- [x] **Filter/parsing fixes** - Meta filter works, array content handled

### v3.2.x
- [x] Dashboard mode (3-panel layout)
- [x] Memory viewer (MEMORY.md + daily logs)
- [x] Chat filters (reasoning, thinking, tokens, metadata)
- [x] Stats panel
- [x] State log

### v3.1.x
- [x] Text input + send button
- [x] Avatar placeholder area
- [x] Compact PTT button

### v3.0.x
- [x] Clawdbot Gateway integration
- [x] ElevenLabs TTS
- [x] Full conversation loop

### v1-2.x
- [x] Push-to-Talk recording
- [x] STT transcription
- [x] Basic UI

---

## VRM Avatar Status

| Feature | Status | Notes |
|---------|--------|-------|
| VRM loader | ✅ | Three.js + @pixiv/three-vrm |
| Rose model | ✅ | Default: `arweave.net/Ea1KXujzJatQgCFSMzGOzp_UtHqB1pyia--U3AtkMAY` |
| Idle blink | ✅ | Implemented in avatar.js |
| Lip sync API | ✅ | Stub exists, needs ElevenLabs phoneme data |

## Not Implemented

| Feature | Priority | Notes |
|---------|----------|-------|
| Lip sync (full) | Medium | ElevenLabs phonemes → viseme blend shapes |
| Voice picker UI | Low | Backend ready, no frontend |
| Live2D | Low | Alternative to VRM |

---

## Test Status

```
$ pytest -q
28 passed, 113 warnings in 0.39s
```

Warnings are Python 3.14 asyncio deprecations in FastAPI/Starlette — not actionable.

---

## Known Issues

None blocking.

---

## Next Sprint Candidates

1. **VRM avatar integration** - Scope: ~2-3 days
   - Three.js setup
   - @pixiv/three-vrm loader
   - Basic idle animation
   - Rose model loading

2. **Lip sync** - Scope: ~2-3 days (after VRM)
   - ElevenLabs streaming with timestamps
   - Phoneme → viseme mapping
   - Blend shape animation

3. **Voice selection** - Scope: ~0.5 day
   - Frontend dropdown
   - Wire to existing backend

---

**Ready for Thai to test.**

— Ram 🩷
