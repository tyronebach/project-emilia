# Hands-Free Voice System Implementation Plan

**Goal:** Always-on, hands-free voice interaction for Emilia webapp on phones/tablets. No buttons, no tapping — pure voice control.

**Cost:** $0 (all on-device processing, free-tier services)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Porcupine   │    │  VAD         │    │  Web Speech  │  │
│  │  Wake Word   │───▶│  (Silero)    │───▶│  API (STT)   │  │
│  │  Detection   │    │              │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         │ "start listening" │ silence detected  │ transcript│
│         ▼                   ▼                   ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Voice State Machine                  │   │
│  │  PASSIVE ──▶ ACTIVE ──▶ PROCESSING ──▶ ACTIVE/PASSIVE│   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
└────────────────────────────│────────────────────────────────┘
                             │ transcript
                             ▼
                    ┌────────────────┐
                    │  Backend API   │
                    │  /api/chat     │
                    └────────────────┘
                             │
                             ▼ response
                    ┌────────────────┐
                    │  TTS Playback  │
                    │  (ElevenLabs)  │
                    └────────────────┘
```

---

## Components

### 1. Wake Word Detection (Porcupine)

**Library:** `@picovoice/porcupine-web`

**Wake Words (Free Tier - 3 max):**
1. `"Start listening"` → activate voice mode
2. `"Stop listening"` → deactivate voice mode
3. `"Cancel"` → abort current request

**Characteristics:**
- Runs continuously in background
- < 1% CPU usage
- ~100KB model per wake word
- Fully on-device (WASM)

**Setup:**
1. Create account at https://console.picovoice.ai/
2. Generate custom wake word models
3. Download access key

### 2. Voice Activity Detection (VAD)

**Library:** `@ricky0123/vad-web`

**Purpose:** Detect when user stops speaking (end of utterance)

**Characteristics:**
- Uses Silero VAD model (~3MB)
- Runs on-device (ONNX runtime in WASM)
- Configurable silence thresholds
- Free, open source (MIT)

**Configuration:**
```typescript
{
  positiveSpeechThreshold: 0.8,  // Confidence threshold
  minSpeechFrames: 3,            // Min frames to count as speech
  redemptionFrames: 8,           // Frames of silence before end
  preSpeechPadFrames: 1,
  frameSamples: 1536
}
```

### 3. Speech-to-Text (STT)

**Library:** Web Speech API (built-in)

**Characteristics:**
- Free, built into Chrome/Safari
- On-device for mobile (mostly)
- Streaming transcription
- Good accuracy for English

**Fallback:** Backend STT at `http://192.168.88.252:8765` for unsupported browsers

### 4. Text-to-Speech (TTS)

**Existing:** ElevenLabs via backend endpoint `http://192.168.88.252:8890/speak`

---

## State Machine

```typescript
type VoiceState = 
  | 'PASSIVE'      // Only wake word detection active
  | 'ACTIVE'       // Listening for speech (VAD + STT running)
  | 'PROCESSING'   // Sending to backend, waiting for response
  | 'SPEAKING'     // Playing TTS response

// Transitions:
// PASSIVE → ACTIVE      : Wake word "Start listening" detected
// ACTIVE → PROCESSING   : VAD detects end of speech (1.5s silence)
// ACTIVE → PASSIVE      : Wake word "Stop listening" OR 10s inactivity
// ACTIVE → ACTIVE       : Wake word "Cancel" (clear current buffer)
// PROCESSING → SPEAKING : Response received, playing TTS
// PROCESSING → ACTIVE   : Error, stay in active mode
// SPEAKING → ACTIVE     : TTS finished, ready for next input
// SPEAKING → PASSIVE    : 10s inactivity after TTS
```

---

## Implementation Tasks

### Task 1: Create VoiceService Module

**File:** `frontend/src/services/VoiceService.ts`

```typescript
interface VoiceServiceConfig {
  porcupineAccessKey: string;
  onTranscript: (text: string) => void;
  onStateChange: (state: VoiceState) => void;
  onError: (error: Error) => void;
  silenceTimeout?: number;      // ms, default 1500
  inactivityTimeout?: number;   // ms, default 10000
}

class VoiceService {
  private state: VoiceState = 'PASSIVE';
  private porcupine: Porcupine | null = null;
  private vad: MicVAD | null = null;
  private recognition: SpeechRecognition | null = null;
  
  async init(config: VoiceServiceConfig): Promise<void>;
  async start(): Promise<void>;  // Start wake word detection
  async stop(): Promise<void>;   // Stop everything
  
  private activateListening(): void;
  private deactivateListening(): void;
  private handleSpeechEnd(audio: Float32Array): void;
  private handleTranscript(text: string): void;
}
```

### Task 2: Install Dependencies

```bash
cd frontend
npm install @picovoice/porcupine-web @picovoice/web-voice-processor
npm install @ricky0123/vad-web onnxruntime-web
```

### Task 3: Porcupine Setup

**File:** `frontend/src/services/WakeWordDetector.ts`

```typescript
import { Porcupine, PorcupineWorker } from '@picovoice/porcupine-web';

export class WakeWordDetector {
  private porcupine: PorcupineWorker | null = null;
  
  async init(
    accessKey: string,
    wakeWords: { label: string; modelPath: string }[],
    onDetected: (keyword: string) => void
  ): Promise<void>;
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  release(): void;
}
```

**Notes:**
- Wake word models (.ppn files) generated from Picovoice console
- Store models in `public/models/porcupine/`
- Access key stored in environment variable

### Task 4: VAD Setup

**File:** `frontend/src/services/VoiceActivityDetector.ts`

```typescript
import { MicVAD } from '@ricky0123/vad-web';

export class VoiceActivityDetector {
  private vad: MicVAD | null = null;
  
  async init(config: {
    onSpeechStart: () => void;
    onSpeechEnd: (audio: Float32Array) => void;
    onVADMisfire: () => void;
  }): Promise<void>;
  
  async start(): Promise<void>;
  pause(): void;
  resume(): void;
  async stop(): Promise<void>;
}
```

**Notes:**
- Silero model loaded from CDN or local
- Audio chunks collected during speech
- `onSpeechEnd` provides full audio buffer

### Task 5: STT Integration

**File:** `frontend/src/services/SpeechRecognizer.ts`

```typescript
export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private isSupported: boolean;
  
  constructor();
  
  get supported(): boolean;
  
  async transcribe(
    onInterim?: (text: string) => void,
    onFinal?: (text: string) => void
  ): Promise<string>;
  
  abort(): void;
}
```

**Notes:**
- Feature detect: `'webkitSpeechRecognition' in window`
- Fallback to backend STT if not supported
- Handle mobile permission prompts gracefully

### Task 6: UI Components

**File:** `frontend/src/components/VoiceIndicator.tsx`

```typescript
interface VoiceIndicatorProps {
  state: VoiceState;
  transcript?: string;
}

// Visual feedback:
// PASSIVE: Subtle mic icon, dim
// ACTIVE: Pulsing mic icon, listening animation
// PROCESSING: Loading spinner
// SPEAKING: Sound wave animation
```

**File:** `frontend/src/components/VoiceToggle.tsx`

```typescript
// Manual toggle button as backup
// Shows current state
// Can enable/disable voice mode entirely
```

### Task 7: Integration with Chat

**File:** `frontend/src/hooks/useVoiceChat.ts`

```typescript
export function useVoiceChat() {
  const [voiceState, setVoiceState] = useState<VoiceState>('PASSIVE');
  const [isEnabled, setIsEnabled] = useState(false);
  const voiceService = useRef<VoiceService | null>(null);
  
  const enableVoice = async () => { ... };
  const disableVoice = () => { ... };
  
  // When transcript received:
  // 1. Add user message to chat
  // 2. Send to /api/chat
  // 3. Receive response
  // 4. Play TTS
  // 5. Add assistant message to chat
  
  return { voiceState, isEnabled, enableVoice, disableVoice };
}
```

---

## File Structure

```
frontend/src/
├── services/
│   ├── VoiceService.ts        # Main orchestrator
│   ├── WakeWordDetector.ts    # Porcupine wrapper
│   ├── VoiceActivityDetector.ts # VAD wrapper
│   └── SpeechRecognizer.ts    # Web Speech API wrapper
├── hooks/
│   └── useVoiceChat.ts        # React integration
├── components/
│   ├── VoiceIndicator.tsx     # Visual state feedback
│   └── VoiceToggle.tsx        # Enable/disable button
└── public/
    └── models/
        └── porcupine/
            ├── start-listening.ppn
            ├── stop-listening.ppn
            └── cancel.ppn
```

---

## Configuration

**Environment Variables:**

```bash
# .env.local
VITE_PORCUPINE_ACCESS_KEY=your-access-key-here
```

**Runtime Config:**

```typescript
// config/voice.ts
export const voiceConfig = {
  silenceTimeout: 1500,        // End of utterance
  inactivityTimeout: 10000,    // Return to passive
  sttFallbackUrl: 'http://192.168.88.252:8765',
  ttsEndpoint: 'http://192.168.88.252:8890/speak',
};
```

---

## Implementation Order

1. **Phase 1: Core Services** (Day 1)
   - [ ] Install dependencies
   - [ ] Create WakeWordDetector (mock first, then real)
   - [ ] Create VoiceActivityDetector
   - [ ] Create SpeechRecognizer

2. **Phase 2: State Machine** (Day 1-2)
   - [ ] Create VoiceService with state machine
   - [ ] Wire up all detectors
   - [ ] Test state transitions

3. **Phase 3: UI** (Day 2)
   - [ ] Create VoiceIndicator component
   - [ ] Create VoiceToggle component
   - [ ] Add to main chat interface

4. **Phase 4: Integration** (Day 2-3)
   - [ ] Create useVoiceChat hook
   - [ ] Connect to existing chat flow
   - [ ] Handle TTS playback queue

5. **Phase 5: Polish** (Day 3)
   - [ ] Error handling
   - [ ] Mobile testing
   - [ ] Permission prompts
   - [ ] Accessibility

---

## Testing Checklist

- [ ] Wake word detection works in Chrome desktop
- [ ] Wake word detection works in Chrome mobile
- [ ] Wake word detection works in Safari mobile
- [ ] VAD correctly detects speech end
- [ ] STT transcription accurate
- [ ] State transitions correct
- [ ] TTS plays without overlap
- [ ] Inactivity timeout works
- [ ] Cancel wake word aborts correctly
- [ ] Multiple back-to-back queries work
- [ ] Handles microphone permission denial gracefully

---

## Notes for Coding Agent

1. **Start with mocks** - Build state machine with console.log before integrating real services
2. **Test incrementally** - Each service should work standalone before combining
3. **Mobile-first** - Test on phone early, not just desktop
4. **Permission UX** - Request mic permission explicitly with user action first
5. **Graceful degradation** - App should work without voice, voice is enhancement

---

## Resources

- Porcupine Web SDK: https://picovoice.ai/docs/porcupine/
- Porcupine Console (wake word creation): https://console.picovoice.ai/
- VAD Web: https://github.com/ricky0123/vad
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

---

*Plan created by Ram — Feb 2026*
