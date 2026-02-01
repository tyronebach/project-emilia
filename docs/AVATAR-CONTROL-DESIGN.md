# Avatar Control System — Design Document

**Version:** 1.1  
**Date:** 2026-01-31  
**Author:** Ram (v1.0), Beatrice (v1.1 revisions)  
**Status:** Draft

### Revision Notes (v1.1)
- Removed second LLM for mood detection — Emilia emits mood/animation tags directly
- Added WebSocket → REST fallback for ElevenLabs TTS
- Clarified Rose as test model, production avatar TBD after MVP
- Updated architecture diagram and implementation timeline
- Added `parse_agent_response()` implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Lip Sync System](#lip-sync-system)
4. [Emotion & Mood System](#emotion--mood-system)
5. [Animation System](#animation-system)
6. [Backend Orchestration](#backend-orchestration)
7. [Implementation Plan](#implementation-plan)
8. [References](#references)

---

## Overview

### Goals

Control Emilia's VRM avatar with:
- **Lip sync** — Mouth movements synchronized to TTS audio
- **Emotions** — Facial expressions based on text sentiment/mood
- **Idle motion** — Natural breathing, blinking, micro-movements
- **Triggered animations** — Gestures, poses, reactions

### Current State

| Component | Status |
|-----------|--------|
| VRM loader (Rose) | ✅ Implemented |
| Three.js + @pixiv/three-vrm | ✅ Integrated |
| Idle blink animation | ✅ Basic implementation |
| ElevenLabs TTS | ✅ Working (REST API) |
| Lip sync | ❌ Not implemented |
| Emotion detection | ❌ Not implemented |
| Animation triggers | ❌ Not implemented |

### Avatar Model

**Current:** Rose (CC0 open-source test model from VRoid Hub)  
**Production:** TBD after MVP complete — will commission custom Emilia model

Rose uses standard VRM blend shapes (Oculus visemes + standard expressions), so all lip sync and emotion code will transfer to the production model without changes. The VRM spec guarantees blend shape compatibility.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Chat UI     │───▶│ Avatar       │◀───│ Animation    │      │
│  │              │    │ Controller   │    │ Mixer        │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   ▲               │
│         │                   │                   │               │
│         ▼                   ▼                   │               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  TTS Audio   │───▶│ Lip Sync     │    │ VRM Blend    │      │
│  │  Player      │    │ Engine       │───▶│ Shapes       │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Docker/FastAPI)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  /api/chat   │───▶│  Tag Parser  │───▶│ Avatar       │      │
│  │              │    │ (regex only) │    │ Commands     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                                       │               │
│         ▼                                       ▼               │
│  ┌──────────────┐                        ┌──────────────┐      │
│  │  ElevenLabs  │───────────────────────▶│ Response     │      │
│  │  WS (or REST)│  (audio + timestamps)  │ Stream       │      │
│  └──────────────┘                        └──────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Clawdbot Gateway (unchanged)                   │
├─────────────────────────────────────────────────────────────────┤
│  /tools/invoke sessions_send → Emilia Agent                     │
│  Emilia emits: [MOOD:happy:0.7] [ANIM:wave] Hello!              │
│  Backend parses tags, strips them, forwards to TTS              │
└─────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. User message → Backend → Clawdbot Gateway → Emilia Agent
2. Emilia responds with mood/animation tags embedded
3. Backend parses tags (regex, no LLM), strips them from text
4. Clean text → ElevenLabs TTS (WebSocket or REST fallback)
5. Frontend receives: text + audio + timestamps + avatar commands

---

## Lip Sync System

### Approach: Phoneme-to-Viseme Mapping

VRM avatars use **blend shapes** (morph targets) for facial expressions. For lip sync, we map phonemes from TTS to visemes (visual mouth shapes).

### VRM Blend Shape Standards

VRM supports two viseme standards:

#### 1. Oculus Visemes (15 shapes) — Recommended
```
sil    — Silent/neutral
PP     — p, b, m
FF     — f, v
TH     — th
DD     — t, d, n
kk     — k, g
CH     — ch, j, sh
SS     — s, z
nn     — n (nasal)
RR     — r
aa     — a (father)
E      — e (bed)
I      — i (see)
O      — o (go)
U      — u (blue)
```

#### 2. ARKit Blend Shapes (52 shapes)
More granular but complex. Includes `jawOpen`, `mouthSmile`, `mouthFunnel`, etc.

### ElevenLabs Integration Options

#### Option A: Character Timestamps (Current API)
ElevenLabs WebSocket returns character-level timing:
```json
{
  "audio": "base64...",
  "alignment": {
    "chars": ["H", "e", "l", "l", "o"],
    "charStartTimesMs": [0, 50, 100, 150, 200],
    "charDurationsMs": [50, 50, 50, 50, 100]
  }
}
```

**Process:**
1. Convert characters → phonemes (using CMU dict or rules)
2. Map phonemes → visemes
3. Interpolate blend shapes over duration

#### Option B: Audio-Driven Lip Sync
Analyze audio waveform in real-time without timestamps.

**Libraries:**
- [HeadAudio](https://github.com/met4citizen/HeadAudio) — WebGPU-based viseme detection
- [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) — Offline analysis

#### Option C: Microsoft Azure Speech SDK
Returns viseme IDs directly with timestamps. Supports 100+ languages.

### Recommended: Option A with REST Fallback

1. **Primary:** ElevenLabs WebSocket with `sync_alignment=true` for real-time timestamps
2. **Fallback:** ElevenLabs REST API (no timestamps = no lip sync, but audio works)
3. **Future:** Audio-driven analysis for non-ElevenLabs sources

#### WebSocket Failure Handling

```python
async def generate_speech(text: str) -> dict:
    """Generate TTS with graceful degradation."""
    try:
        # Try WebSocket first (has timestamps)
        result = await elevenlabs_websocket_tts(text)
        return {
            "audio": result.audio,
            "alignment": result.alignment,
            "has_lip_sync": True
        }
    except WebSocketError as e:
        logger.warning(f"WebSocket TTS failed, falling back to REST: {e}")
        # Fallback to REST (no timestamps)
        audio = await elevenlabs_rest_tts(text)
        return {
            "audio": audio,
            "alignment": None,
            "has_lip_sync": False
        }
```

Frontend handles `has_lip_sync: false` by keeping mouth neutral during speech.

### Phoneme-to-Viseme Mapping Table

```javascript
const PHONEME_TO_VISEME = {
  // Silence
  '': 'sil', ' ': 'sil',
  
  // Bilabial
  'p': 'PP', 'b': 'PP', 'm': 'PP',
  
  // Labiodental
  'f': 'FF', 'v': 'FF',
  
  // Dental
  'θ': 'TH', 'ð': 'TH',  // th sounds
  
  // Alveolar
  't': 'DD', 'd': 'DD', 'n': 'DD', 'l': 'DD',
  
  // Velar
  'k': 'kk', 'g': 'kk', 'ŋ': 'kk',
  
  // Postalveolar
  'ʃ': 'CH', 'ʒ': 'CH', 'tʃ': 'CH', 'dʒ': 'CH',
  
  // Sibilant
  's': 'SS', 'z': 'SS',
  
  // Rhotic
  'r': 'RR', 'ɹ': 'RR',
  
  // Vowels
  'ɑ': 'aa', 'æ': 'aa', 'a': 'aa',
  'ɛ': 'E', 'e': 'E',
  'i': 'I', 'ɪ': 'I',
  'o': 'O', 'ɔ': 'O', 'ʊ': 'O',
  'u': 'U', 'ʌ': 'aa',
};
```

### Lip Sync Implementation

```javascript
class LipSyncEngine {
  constructor(vrm) {
    this.vrm = vrm;
    this.currentViseme = 'sil';
    this.targetViseme = 'sil';
    this.blendSpeed = 0.15; // Interpolation speed
  }

  // Called with ElevenLabs alignment data
  processAlignment(alignment, audioCurrentTime) {
    const { chars, charStartTimesMs, charDurationsMs } = alignment;
    
    // Find current character based on audio time
    const timeMs = audioCurrentTime * 1000;
    let currentChar = '';
    
    for (let i = 0; i < chars.length; i++) {
      const start = charStartTimesMs[i];
      const end = start + charDurationsMs[i];
      if (timeMs >= start && timeMs < end) {
        currentChar = chars[i].toLowerCase();
        break;
      }
    }
    
    // Map to viseme
    this.targetViseme = this.charToViseme(currentChar);
  }

  charToViseme(char) {
    // Simplified mapping (expand with full phoneme rules)
    const vowels = 'aeiou';
    const bilabial = 'pbm';
    const labiodental = 'fv';
    const dental = 'td';
    const velar = 'kg';
    const sibilant = 'sz';
    
    if (vowels.includes(char)) return char === 'a' ? 'aa' : char.toUpperCase();
    if (bilabial.includes(char)) return 'PP';
    if (labiodental.includes(char)) return 'FF';
    if (dental.includes(char)) return 'DD';
    if (velar.includes(char)) return 'kk';
    if (sibilant.includes(char)) return 'SS';
    if (char === 'r') return 'RR';
    return 'sil';
  }

  update(deltaTime) {
    // Smoothly interpolate between visemes
    const blendShapes = this.vrm.expressionManager;
    
    // Reset all viseme blend shapes
    VISEME_NAMES.forEach(name => {
      const current = blendShapes.getValue(name) || 0;
      const target = name === this.targetViseme ? 1.0 : 0.0;
      const newValue = current + (target - current) * this.blendSpeed;
      blendShapes.setValue(name, newValue);
    });
  }
}
```

---

## Emotion & Mood System

### Goal

Detect emotional content in LLM responses and trigger appropriate facial expressions.

### Emotion Categories

```javascript
const EMOTIONS = {
  neutral:  { expression: 'neutral', intensity: 0.0 },
  happy:    { expression: 'happy', intensity: 0.7 },
  sad:      { expression: 'sad', intensity: 0.6 },
  angry:    { expression: 'angry', intensity: 0.5 },
  surprised:{ expression: 'surprised', intensity: 0.8 },
  thinking: { expression: 'thinking', intensity: 0.4 },
  confused: { expression: 'confused', intensity: 0.5 },
  shy:      { expression: 'shy', intensity: 0.6 },
  love:     { expression: 'love', intensity: 0.8 },
};
```

### VRM Expression Blend Shapes

Standard VRM expressions:
- `happy` / `joy`
- `angry`
- `sad` / `sorrow`
- `surprised`
- `relaxed`
- `neutral`

Custom expressions (model-dependent):
- `thinking` (eyebrows up, eyes up)
- `shy` (blush + eyes down)
- `love` (heart eyes, if available)

### Mood Detection: Agent-Emitted Tags (Recommended)

Instead of inferring mood from text with a second LLM, **Emilia emits mood/animation tags directly** in her response. This is:
- **Zero additional cost** — no second LLM call
- **Zero additional latency** — tags are part of the response
- **More accurate** — Emilia knows her own emotional state

#### Tag Format

Emilia's SOUL.md instructs her to prefix responses with:

```
[MOOD:<emotion>:<intensity>] [ANIM:<animation>] Response text...
```

**Examples:**
```
[MOOD:happy:0.7] Good morning! I hope you slept well.
[MOOD:shy:0.6] Oh... you remembered that about me?
[MOOD:happy:0.8] [ANIM:wave] Hello! It's so nice to see you again!
[MOOD:thinking:0.5] [ANIM:thinking_pose] Hmm, let me think about that...
```

#### Backend Parsing

```python
import re

def parse_avatar_tags(text: str) -> dict:
    """Parse mood and animation tags from agent response."""
    result = {
        "text": text,
        "mood": "neutral",
        "intensity": 0.5,
        "animation": None
    }
    
    # Parse mood tag: [MOOD:emotion:intensity]
    mood_match = re.match(r'\[MOOD:(\w+):([\d.]+)\]\s*', text)
    if mood_match:
        result["mood"] = mood_match.group(1)
        result["intensity"] = float(mood_match.group(2))
        text = text[mood_match.end():]
    
    # Parse animation tag: [ANIM:animation]
    anim_match = re.match(r'\[ANIM:(\w+)\]\s*', text)
    if anim_match:
        result["animation"] = anim_match.group(1)
        text = text[anim_match.end():]
    
    result["text"] = text.strip()
    return result
```

#### Fallback: Keyword Detection

If tags are missing (agent error or legacy response), fall back to keyword detection:

```python
MOOD_KEYWORDS = {
    'happy': ['happy', 'glad', 'excited', 'wonderful', '😊', '😄'],
    'sad': ['sad', 'sorry', 'unfortunately', '😢', '😔'],
    'surprised': ['wow', 'amazing', 'incredible', '😮'],
    'thinking': ['hmm', 'let me think', 'perhaps', '🤔'],
    'shy': ['blush', 'embarrassed', '😳'],
}

def detect_mood_fallback(text: str) -> dict:
    """Fallback mood detection via keywords."""
    lower = text.lower()
    for mood, keywords in MOOD_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return {"mood": mood, "intensity": 0.6}
    return {"mood": "neutral", "intensity": 0.5}
```

#### Complete Parsing Flow

```python
def parse_agent_response(raw_text: str) -> dict:
    """Parse agent response with fallback."""
    result = parse_avatar_tags(raw_text)
    
    # If no mood tag found, use keyword fallback
    if result["mood"] == "neutral" and not raw_text.startswith("[MOOD:"):
        fallback = detect_mood_fallback(result["text"])
        result["mood"] = fallback["mood"]
        result["intensity"] = fallback["intensity"]
    
    return result
```

### Expression Blending

```javascript
class ExpressionController {
  constructor(vrm) {
    this.vrm = vrm;
    this.currentExpression = { mood: 'neutral', intensity: 0.5 };
    this.targetExpression = { mood: 'neutral', intensity: 0.5 };
    this.blendSpeed = 0.08; // Slower than lip sync for natural feel
  }

  setMood(mood, intensity = 0.7) {
    this.targetExpression = { mood, intensity };
  }

  update(deltaTime) {
    const expressions = this.vrm.expressionManager;
    
    // Blend out current expression
    if (this.currentExpression.mood !== this.targetExpression.mood) {
      const currentVal = expressions.getValue(this.currentExpression.mood) || 0;
      const newVal = Math.max(0, currentVal - this.blendSpeed);
      expressions.setValue(this.currentExpression.mood, newVal);
      
      if (newVal <= 0.01) {
        this.currentExpression = this.targetExpression;
      }
    }
    
    // Blend in target expression
    const targetVal = expressions.getValue(this.targetExpression.mood) || 0;
    const goalVal = this.targetExpression.intensity;
    const newVal = targetVal + (goalVal - targetVal) * this.blendSpeed;
    expressions.setValue(this.targetExpression.mood, newVal);
  }
}
```

---

## Animation System

### Idle Animations

Always-running subtle movements for life-like presence.

```javascript
class IdleAnimationSystem {
  constructor(vrm) {
    this.vrm = vrm;
    this.blinkTimer = 0;
    this.blinkInterval = 3000 + Math.random() * 2000; // 3-5 seconds
    this.breathTimer = 0;
    this.microMovementTimer = 0;
  }

  update(deltaTime) {
    this.updateBlink(deltaTime);
    this.updateBreathing(deltaTime);
    this.updateMicroMovements(deltaTime);
  }

  updateBlink(deltaTime) {
    this.blinkTimer += deltaTime * 1000;
    
    if (this.blinkTimer >= this.blinkInterval) {
      this.triggerBlink();
      this.blinkTimer = 0;
      this.blinkInterval = 3000 + Math.random() * 2000;
    }
  }

  triggerBlink() {
    const expressions = this.vrm.expressionManager;
    
    // Quick blink animation
    const blinkDuration = 150; // ms
    const startTime = performance.now();
    
    const animateBlink = () => {
      const elapsed = performance.now() - startTime;
      const t = elapsed / blinkDuration;
      
      if (t < 0.5) {
        // Closing
        expressions.setValue('blinkLeft', t * 2);
        expressions.setValue('blinkRight', t * 2);
      } else if (t < 1.0) {
        // Opening
        expressions.setValue('blinkLeft', (1 - t) * 2);
        expressions.setValue('blinkRight', (1 - t) * 2);
      } else {
        expressions.setValue('blinkLeft', 0);
        expressions.setValue('blinkRight', 0);
        return;
      }
      
      requestAnimationFrame(animateBlink);
    };
    
    requestAnimationFrame(animateBlink);
  }

  updateBreathing(deltaTime) {
    this.breathTimer += deltaTime;
    
    // Subtle chest/shoulder movement
    const breathCycle = Math.sin(this.breathTimer * 0.5) * 0.002;
    const spine = this.vrm.humanoid.getBoneNode('spine');
    if (spine) {
      spine.position.y += breathCycle;
    }
  }

  updateMicroMovements(deltaTime) {
    this.microMovementTimer += deltaTime;
    
    // Very subtle head sway
    const head = this.vrm.humanoid.getBoneNode('head');
    if (head) {
      head.rotation.y = Math.sin(this.microMovementTimer * 0.3) * 0.01;
      head.rotation.x = Math.sin(this.microMovementTimer * 0.2) * 0.005;
    }
  }
}
```

### Triggered Animations

Pre-defined poses/gestures triggered by context.

```javascript
const ANIMATION_TRIGGERS = {
  // Greeting
  wave: {
    trigger: ['hello', 'hi', 'hey', 'greetings'],
    animation: 'wave',
    duration: 2000,
  },
  
  // Thinking
  thinking: {
    trigger: ['let me think', 'hmm', 'considering'],
    animation: 'thinking_pose',
    duration: 3000,
  },
  
  // Excitement
  excited: {
    trigger: ['amazing', 'wonderful', 'fantastic'],
    animation: 'jump',
    duration: 1500,
  },
  
  // Nod
  nod: {
    trigger: ['yes', 'agree', 'correct', 'exactly'],
    animation: 'nod',
    duration: 1000,
  },
  
  // Shake head
  shake: {
    trigger: ['no', 'not', "don't", 'disagree'],
    animation: 'head_shake',
    duration: 1000,
  },
};
```

### Animation Sources

1. **Procedural** — Generate from code (nod, shake, blink)
2. **Mixamo** — Free animation library, FBX format, retarget to VRM
3. **Custom** — Created in Blender, exported as GLB

---

## Backend Orchestration

### Enhanced Chat Response

Modify `/api/chat` to parse agent-emitted avatar tags:

```python
@app.post("/api/chat")
async def chat(
    message: str,
    session_id: str = "default",
):
    # Get LLM response (includes mood/anim tags)
    raw_response = await get_llm_response(message, session_id)
    
    # Parse avatar tags from response
    parsed = parse_agent_response(raw_response.text)
    
    # Generate TTS with timestamps (uses cleaned text, no tags)
    tts_result = await generate_speech(parsed["text"])
    
    return {
        "text": parsed["text"],
        "audio": tts_result["audio"],
        "alignment": tts_result.get("alignment"),
        "has_lip_sync": tts_result["has_lip_sync"],
        "avatar": {
            "mood": parsed["mood"],
            "intensity": parsed["intensity"],
            "animation": parsed["animation"],
        }
    }
```

**Key points:**
- Agent response arrives with tags: `[MOOD:happy:0.7] [ANIM:wave] Hello!`
- `parse_agent_response()` extracts mood/animation and cleans the text
- TTS receives clean text (no tags in audio)
- Frontend receives structured avatar commands

### ElevenLabs WebSocket Proxy

For real-time streaming with timestamps:

```python
@app.websocket("/api/tts/stream")
async def tts_stream(websocket: WebSocket):
    await websocket.accept()
    
    async with elevenlabs_ws_client() as eleven_ws:
        # Forward text chunks from client to ElevenLabs
        async def forward_text():
            async for message in websocket.iter_json():
                await eleven_ws.send(message)
        
        # Forward audio + alignment from ElevenLabs to client
        async def forward_audio():
            async for message in eleven_ws:
                # Message includes audio + alignment data
                await websocket.send_json(message)
        
        await asyncio.gather(forward_text(), forward_audio())
```

### API Contract

```typescript
interface ChatResponse {
  text: string;
  audio?: string;  // base64 audio
  alignment?: {
    chars: string[];
    charStartTimesMs: number[];
    charDurationsMs: number[];
  };
  avatar?: {
    mood: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking' | 'shy' | 'love';
    intensity: number;  // 0.0 - 1.0
    animation?: string; // e.g., 'wave', 'nod', 'thinking_pose'
  };
}
```

---

## Implementation Plan

### Phase 1: Lip Sync (3-4 days)

1. **Day 1:** ElevenLabs WebSocket integration
   - Upgrade from REST to WebSocket API
   - Receive character timestamps with audio
   
2. **Day 2:** Phoneme-to-viseme mapping
   - Implement character → viseme conversion
   - Create blend shape interpolation engine
   
3. **Day 3:** VRM integration
   - Connect lip sync engine to Rose model
   - Test with various speech samples
   
4. **Day 4:** Polish
   - Tune interpolation speeds
   - Handle edge cases (silence, long pauses)

### Phase 2: Emotion System (1-2 days)

1. **Day 1:** Backend parsing + expression blending
   - Implement `parse_agent_response()` for mood/anim tags
   - Add keyword fallback for missing tags
   - Connect mood to VRM expressions
   - Implement smooth transitions
   
2. **Day 2:** Integration + testing
   - Wire into chat response pipeline
   - Test end-to-end with various moods
   - Verify fallback behavior

**Note:** Emilia's SOUL.md already updated to emit mood/animation tags. No additional LLM integration needed.

### Phase 3: Animation System (2-3 days)

1. **Day 1:** Idle animations
   - Enhance blink system
   - Add breathing, micro-movements
   
2. **Day 2:** Triggered animations
   - Implement trigger detection
   - Add basic procedural animations (nod, shake)
   
3. **Day 3:** Polish
   - Tune timings
   - Add Mixamo animation support

### Phase 4: Backend Orchestration (1-2 days)

1. Modify `/api/chat` response format
2. Add WebSocket proxy for TTS streaming
3. Parallel mood parsing
4. End-to-end testing

---

## References

### Libraries & Projects

| Name | URL | Notes |
|------|-----|-------|
| TalkingHead | https://github.com/met4citizen/TalkingHead | Full lip-sync + expression system |
| HeadAudio | https://github.com/met4citizen/HeadAudio | Audio-driven lip sync (WebGPU) |
| @pixiv/three-vrm | https://github.com/pixiv/three-vrm | VRM loader for Three.js |
| Rhubarb Lip Sync | https://github.com/DanielSWolf/rhubarb-lip-sync | Offline phoneme extraction |

### Documentation

| Topic | URL |
|-------|-----|
| Oculus Visemes | https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/ |
| VRChat Visemes | https://wiki.vrchat.com/wiki/Visemes |
| ElevenLabs WebSocket | https://elevenlabs.io/docs/api-reference/websockets |
| Azure Viseme Events | https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme |

### VRM Blend Shapes

Standard VRM 0.x expressions:
```
joy, angry, sorrow, fun, surprised, 
blinkLeft, blinkRight, blink,
lookUp, lookDown, lookLeft, lookRight,
neutral
```

Oculus Visemes (for lip sync):
```
viseme_sil, viseme_PP, viseme_FF, viseme_TH,
viseme_DD, viseme_kk, viseme_CH, viseme_SS,
viseme_nn, viseme_RR, viseme_aa, viseme_E,
viseme_I, viseme_O, viseme_U
```

---

## Summary

| Component | Approach | Latency | Complexity |
|-----------|----------|---------|------------|
| Lip sync | ElevenLabs WebSocket timestamps + viseme mapping | Real-time | Medium |
| Lip sync fallback | REST API (no sync, neutral mouth) | Real-time | Low |
| Mood | Agent-emitted tags + keyword fallback | 0ms | Low |
| Idle | Procedural (blink, breathe, sway) | N/A | Low |
| Animations | Agent-emitted triggers + procedural | Instant | Low |

**Total estimated implementation time:** 7-10 days

### Clawdbot Integration

| Change | Location | Impact |
|--------|----------|--------|
| Mood/animation tags | `/home/tbach/clawd-emilia/SOUL.md` | ✅ Done |
| Backend parsing | `emilia-webapp/backend/main.py` | Pending |
| No second LLM | N/A | Zero additional cost |

**Architecture:** All avatar logic runs in backend Docker container. Clawdbot gateway unchanged except for Emilia's persona file.

---

**Document:** `/home/tbach/clawd/emilia-project/emilia-webapp/docs/AVATAR-CONTROL-DESIGN.md`  
**Author:** Ram 🩷
