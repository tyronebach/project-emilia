# ALIVE IN THE MOMENT — Runtime Polish Design Doc

*Beatrice — March 6, 2026*
*Based on AIRI analysis: `docs/planning/AIRI-analysis-what-to-steal.md`*
*Emotional architecture context: `docs/planning/P013-emotional-architecture-v3.md`*

---

## 0. The Problem

Emilia-webapp has deep emotional architecture (P013 — weather, climate, geography). What it doesn't have is runtime *feel*. Concretely:

1. **TTS is fire-and-forget.** User interrupts mid-sentence → old audio keeps playing. No interrupt behavior. No speech queue. Audio elements are siloed per `MessageBubble` with no coordination.

2. **Emotions lag the sentence.** `process_emotion_post_llm` fires after the full response is generated. Avatar expression changes *after* the character is done talking. The emotion should land *while the relevant words are being spoken*.

3. **Everything hits the LLM.** "ok", "lol", "👍" trigger a full LLM round-trip. The avatar sits frozen while the model processes `"ok"`. That's not alive — that's a chatbot.

AIRI solved all three. Their speech pipeline, inline emotion parser, and cognitive reflex layer are the reference implementations. This doc adapts those patterns for Emilia's stack: React 19 + Vite + FastAPI + Three.js + VRM.

**What we don't take from AIRI:** their emotional architecture is a 9-value enum with no relationship persistence, no character evolution, no P013 depth. We steal their runtime plumbing. We keep ours.

---

## 1. Speech Intent Queue

### 1.1 Current State

```
Backend → ElevenLabs API → audio_base64 → SSE done event → MessageBubble → new Audio(url).play()
```

Each `MessageBubble` creates its own `HTMLAudioElement`. There is no shared audio controller. There is no way to interrupt playback of one message when a new one arrives. No queue. No priority.

### 1.2 Target Architecture

A frontend `SpeechQueue` (Zustand store slice) owns all audio playback. There is exactly one active audio player at any time. New speech intents arrive with a `behavior` that determines what happens to the current audio.

```typescript
// frontend/src/store/speechStore.ts (NEW FILE)

type IntentBehavior = 'queue' | 'interrupt' | 'replace';
type IntentPriority = 'normal' | 'high';

interface SpeechIntent {
  id: string;                        // uuid
  agentId: string;
  priority: IntentPriority;
  behavior: IntentBehavior;
  audioBlob: Blob;
  alignment?: AlignmentData;         // for lip sync
  onStart?: () => void;
  onEnd?: () => void;
}

interface SpeechState {
  queue: SpeechIntent[];             // pending intents
  active: SpeechIntent | null;       // currently playing
  audioElement: HTMLAudioElement | null;

  enqueue: (intent: SpeechIntent) => void;
  interrupt: () => void;             // kill current, start next
  _advance: () => void;              // internal: play head of queue
}
```

**Behavior semantics:**

| Behavior | What happens when a new intent arrives |
|----------|---------------------------------------|
| `queue` | Appended to end of queue. Plays after current intent finishes. |
| `interrupt` | Current audio is stopped immediately. Queue is preserved. New intent plays next. |
| `replace` | Current audio is stopped. Queue is **cleared**. New intent is the only thing playing. |

**Priority override:** A `high` priority intent with `interrupt` behavior always preempts a `normal` priority intent, even if the normal intent has `queue` behavior.

### 1.3 When to Use Each Behavior

| Situation | Behavior | Priority |
|-----------|----------|----------|
| Normal agent response | `queue` | `normal` |
| User speaks mid-response (VAD interrupt) | `interrupt` | `high` |
| Proactive agent message (bored, ambient) | `queue` | `normal` |
| Critical alert / reactive moment | `interrupt` | `high` |
| Streaming response replacing in-progress partial | `replace` | `high` |

### 1.4 Implementation: `SpeechQueue` Store

```typescript
// frontend/src/store/speechStore.ts

import { create } from 'zustand';
import { v4 as uuid } from 'uuid';

export const useSpeechStore = create<SpeechState>((set, get) => ({
  queue: [],
  active: null,
  audioElement: null,

  enqueue(intent: SpeechIntent) {
    const { active, audioElement } = get();

    if (intent.behavior === 'replace') {
      // Kill everything
      audioElement?.pause();
      audioElement && URL.revokeObjectURL(audioElement.src);
      set({ queue: [intent], active: null, audioElement: null });
      get()._advance();
      return;
    }

    if (intent.behavior === 'interrupt') {
      audioElement?.pause();
      audioElement && URL.revokeObjectURL(audioElement.src);
      // Preserve remaining queue, insert new intent at head
      set(state => ({
        queue: [intent, ...state.queue],
        active: null,
        audioElement: null,
      }));
      get()._advance();
      return;
    }

    // behavior === 'queue'
    if (!active) {
      set(state => ({ queue: [...state.queue, intent] }));
      get()._advance();
    } else {
      set(state => ({ queue: [...state.queue, intent] }));
    }
  },

  interrupt() {
    const { audioElement } = get();
    audioElement?.pause();
    audioElement && URL.revokeObjectURL(audioElement.src);
    set({ active: null, audioElement: null });
    get()._advance();
  },

  _advance() {
    const { queue } = get();
    if (queue.length === 0) {
      set({ active: null, audioElement: null });
      return;
    }

    const [next, ...rest] = queue;
    const url = URL.createObjectURL(next.audioBlob);
    const el = new Audio(url);

    el.onplay = () => {
      next.onStart?.();
    };

    el.onended = () => {
      URL.revokeObjectURL(url);
      next.onEnd?.();
      set({ active: null, audioElement: null });
      get()._advance();
    };

    el.onerror = () => {
      URL.revokeObjectURL(url);
      set({ active: null, audioElement: null });
      get()._advance();
    };

    set({ queue: rest, active: next, audioElement: el });
    el.play().catch(console.error);
  },
}));
```

### 1.5 Where TTS Gets Queued

**Current flow:** `streamChat` → SSE `done` event → `MessageBubble` calls `/api/speak` → gets audio_base64 → plays directly.

**New flow:** `streamChat` → SSE `done` event → `ChatPanel` (or `chatStore`) calls `/api/speak` → gets audio_base64 → creates `Blob` → calls `useSpeechStore.enqueue()` with appropriate behavior.

```typescript
// In ChatPanel.tsx — after receiving SSE done event:
const speakResponse = await api.speak(agentId, responseText);
const audioBlob = base64ToAudioBlob(speakResponse.audio_base64);

useSpeechStore.getState().enqueue({
  id: uuid(),
  agentId,
  priority: 'normal',
  behavior: 'queue',            // normal responses queue
  audioBlob,
  alignment: speakResponse.alignment,
  onStart: () => chatStore.setStatus(agentId, 'speaking'),
  onEnd: () => chatStore.setStatus(agentId, 'idle'),
});
```

**User interrupt detection:** The existing VAD / voice input button in `InputControls.tsx` should call:

```typescript
// When user starts speaking or presses mic button:
useSpeechStore.getState().interrupt();
```

This stops the current speech immediately and lets the user's message get processed.

### 1.6 Lip Sync Integration

`RoomAvatarTile` currently receives an `emotion` prop and `command` prop from the store. Add an `alignment` prop that the speech store drives:

```typescript
// In speechStore._advance():
el.onplay = () => {
  if (next.alignment) {
    avatarStore.startLipSync(next.agentId, next.alignment);
  }
  next.onStart?.();
};

el.onended = () => {
  avatarStore.stopLipSync(next.agentId);
  next.onEnd?.();
  // ...
};
```

The alignment data (`charStartTimesMs`, `charDurationsMs`) is already returned by `ElevenLabsService.synthesize()` and by the `/api/speak` endpoint. Wire it through — it's already there.

### 1.7 Backend Changes Required

**None for the queue itself.** The backend `ElevenLabsService` and `/api/speak` endpoint are unchanged. The queue is entirely a frontend concern.

**One small add:** The SSE `done` event should include the `alignment` data so the frontend doesn't need a second API call to get it:

```python
# In room_chat_stream.py — the done payload:
yield f"event: agent_done\ndata: {json.dumps({
    'agent_id': agent_id,
    'message': msg,
    'behavior': behavior_dict,
    'alignment': tts_alignment,   # ADD THIS
    'audio_base64': tts_audio,    # ADD THIS if TTS is triggered server-side
})}\n\n"
```

Or keep TTS client-triggered (frontend calls `/api/speak` after `done`). Both work. Client-triggered is simpler.

---

## 2. Inline Emotion Tagging

### 2.1 Current State

`process_emotion_post_llm` runs after the full response text is assembled. The avatar expression updates via the SSE `emotion` event — but that event fires after the LLM finishes, not while it's streaming. The user sees the avatar hold its expression during the entire response, then change when it's done talking.

### 2.2 Tag Format

Emit emotion tags inline in the LLM stream. Format:

```
[mood:irritated,0.7]
[mood:happy]
[mood:shy,0.4]
[mood:neutral]
```

- `mood` key maps to our existing mood IDs (from the emotion engine)
- Optional intensity float (0.0–1.0), defaults to 1.0 if omitted
- Tags are stripped before TTS and display

The LLM is prompted to emit these at natural emotional inflection points — before the sentence that carries the emotion, not after.

### 2.3 Backend: Prompt Injection

In `chat_context_runtime.py` or the system prompt assembly, add an instruction block when inline emotion is enabled:

```python
INLINE_EMOTION_INSTRUCTION = """
## Inline Emotion Tags

As you write, you may optionally insert emotion markers to signal your current emotional state.
Format: [mood:EMOTION_ID] or [mood:EMOTION_ID,INTENSITY]

Available moods: happy, sad, irritated, angry, shy, playful, loving, anxious, curious, surprised, neutral

Insert the tag *before* the text that carries that emotion. The tag will be hidden from the user.
Example: "I... [mood:shy,0.5] I actually missed talking to you."
Example: "[mood:irritated] Why would you even say that?"

Only insert tags when your emotional state genuinely changes. Don't tag every sentence.
"""
```

Add this to the system prompt when `settings.inline_emotion_tags_enabled` is True.

### 2.4 Backend: Streaming Parser

New service: `services/inline_emotion_parser.py`

```python
"""Stream parser that extracts inline emotion tags from LLM output."""
import re
from dataclasses import dataclass
from typing import Generator

TAG_PATTERN = re.compile(r'\[mood:([a-z_]+)(?:,(\d+(?:\.\d+)?))?\]')

@dataclass
class EmotionSignal:
    mood_id: str
    intensity: float

@dataclass
class TextChunk:
    text: str

StreamToken = EmotionSignal | TextChunk


def parse_stream(raw_chunk: str) -> list[StreamToken]:
    """
    Split a streaming text chunk into text segments and emotion signals.
    
    Input:  "I... [mood:shy,0.5] I actually missed talking to you."
    Output: [TextChunk("I... "), EmotionSignal("shy", 0.5), TextChunk(" I actually missed talking to you.")]
    """
    tokens: list[StreamToken] = []
    last_end = 0
    
    for match in TAG_PATTERN.finditer(raw_chunk):
        if match.start() > last_end:
            tokens.append(TextChunk(raw_chunk[last_end:match.start()]))
        
        mood_id = match.group(1)
        intensity = float(match.group(2)) if match.group(2) else 1.0
        tokens.append(EmotionSignal(mood_id=mood_id, intensity=intensity))
        last_end = match.end()
    
    if last_end < len(raw_chunk):
        tokens.append(TextChunk(raw_chunk[last_end:]))
    
    return tokens
```

**Edge case:** A tag can span multiple chunks if the stream splits mid-tag. Handle with a buffer:

```python
class StreamingEmotionParser:
    """Stateful parser for use with chunked streaming."""
    
    def __init__(self):
        self._buffer = ""
    
    def feed(self, chunk: str) -> list[StreamToken]:
        """Feed a stream chunk. Returns safe-to-emit tokens."""
        self._buffer += chunk
        tokens = []
        
        # Only parse up to the last safe point (no partial tags at the end)
        safe_end = self._find_safe_split(self._buffer)
        safe_text = self._buffer[:safe_end]
        self._buffer = self._buffer[safe_end:]
        
        return parse_stream(safe_text)
    
    def flush(self) -> list[StreamToken]:
        """Flush remaining buffer at end of stream."""
        tokens = parse_stream(self._buffer)
        self._buffer = ""
        return tokens
    
    def _find_safe_split(self, text: str) -> int:
        """Find the rightmost safe split point (after last complete tag or last non-tag-start)."""
        # If there's an unclosed '[', don't emit past it
        last_open = text.rfind('[')
        if last_open == -1:
            return len(text)
        # Check if there's a matching close after it
        close = text.find(']', last_open)
        if close == -1:
            return last_open  # partial tag, hold back
        return len(text)      # complete tags, all safe
```

### 2.5 Backend: SSE Emission

In `room_chat_stream.py`, when a chunk from the LLM arrives:

```python
parser = StreamingEmotionParser()

async for chunk in llm_stream:
    raw = chunk.choices[0].delta.content or ""
    tokens = parser.feed(raw)
    
    for token in tokens:
        if isinstance(token, EmotionSignal):
            # Emit emotion SSE event immediately
            yield f"event: emotion_inline\ndata: {json.dumps({
                'agent_id': agent_id,
                'mood_id': token.mood_id,
                'intensity': token.intensity,
            })}\n\n"
        else:
            # Emit clean text chunk (no tags)
            yield f"data: {json.dumps({'content': token.text})}\n\n"

# Flush at end of stream
for token in parser.flush():
    if isinstance(token, EmotionSignal):
        yield f"event: emotion_inline\ndata: {json.dumps({...})}\n\n"
    else:
        yield f"data: {json.dumps({'content': token.text})}\n\n"
```

Use `event: emotion_inline` (not `event: emotion`) so the existing post-LLM emotion pipeline is unaffected. The post-LLM emotion event still fires for trigger classification and mood weight computation — inline tags are an *additional* real-time signal, not a replacement.

### 2.6 Frontend: Consuming `emotion_inline`

In `api.ts`, `streamRoomChat` already handles `emotion` events. Add `emotion_inline`:

```typescript
// In streamRoomChat SSE handler — add to RoomStreamEvent union:
| {
    type: 'emotion_inline';
    agent_id: string;
    mood_id: string;
    intensity: number;
  }

// In the SSE loop:
if (eventType === 'emotion_inline') {
  events.push({ type: 'emotion_inline', agent_id: data.agent_id, mood_id: data.mood_id, intensity: data.intensity });
}
```

In `chatStore.ts` or `RoomAvatarTile`, handle the inline emotion by immediately updating the avatar expression:

```typescript
// In chatStore or avatar event handler:
case 'emotion_inline':
  avatarStore.setImmediateExpression(event.agent_id, event.mood_id, event.intensity);
  break;
```

The avatar VRM expression update doesn't need to wait for the full sentence. The `[mood:shy,0.5]` tag fires the moment the LLM emits it, and the avatar's face changes before the associated words are spoken. That's the AIRI insight — real-time emotional feedback during streaming.

### 2.7 How This Integrates with P013

**Post-LLM emotion event is unchanged.** It still runs GoEmotions trigger classification on the full response, computes VAD deltas, updates mood weights, and emits the full `emotion` SSE event. That drives the HUD, the debug panel, and the long-term emotion engine state.

**Inline emotion is an override layer.** While the LLM is streaming, inline tags drive real-time avatar expression. Once the full response is processed and the post-LLM `emotion` event arrives, the avatar settles into the mood-weighted expression. The inline tag is ephemeral (within the utterance). The post-LLM emotion is authoritative (for the session state).

Think of it this way: inline tags are the *face in the moment*. Post-LLM emotion is the *mood for the next few minutes*. Both matter. Neither replaces the other.

---

## 3. Cognitive Reflex Layer

### 3.1 Current State

Every user message, regardless of content, goes through:

```
User message → build context → LLM call → parse response → emotion post-processing → TTS → SSE done
```

A message like `"lol"` or `"ok"` or `"👍"` triggers a 1-3 second LLM round-trip. The avatar shows `thinking` status, then `streaming`, then `speaking`. This is unnatural. A human friend wouldn't pause for two seconds before responding to "ok".

### 3.2 What the Reflex Layer Does

Simple, classifiable inputs are handled **without the LLM**:

1. Avatar reacts immediately (nod, smile, head tilt — depending on input)
2. Optional short canned reply (typed out as if streaming, but from a template)
3. Entire exchange completes in < 100ms instead of 1-3s
4. LLM never called

For anything the reflex layer doesn't recognize, falls through to normal LLM processing.

### 3.3 Reflex Trigger Definitions

```python
# backend/services/reflex_engine.py (NEW FILE)

from dataclasses import dataclass
from typing import Callable
import re

@dataclass
class ReflexMatch:
    avatar_reaction: str        # VRM expression key: 'nod', 'smile', 'tilt', 'laugh', 'shrug'
    canned_reply: str | None    # None = avatar-only, no text
    skip_llm: bool = True

class ReflexEngine:
    """Pattern matcher for simple inputs that don't need LLM processing."""
    
    RULES: list[tuple[re.Pattern, ReflexMatch]] = [
        # Acknowledgments
        (re.compile(r'^(ok|okay|k|got it|sure|alright|sounds good)\.?$', re.I),
         ReflexMatch(avatar_reaction='nod', canned_reply=None)),
        
        # Laughter
        (re.compile(r'^(lol|lmao|haha|hehe|😂|💀|🤣)+$', re.I),
         ReflexMatch(avatar_reaction='laugh', canned_reply=None)),
        
        # Positive reaction
        (re.compile(r'^(👍|✅|nice|cool|sweet|awesome|great|perfect)\.?$', re.I),
         ReflexMatch(avatar_reaction='smile', canned_reply=None)),
        
        # Greetings
        (re.compile(r'^(hi|hello|hey|yo|sup|howdy|hiya)[\s!]*$', re.I),
         ReflexMatch(avatar_reaction='wave', canned_reply='Hi~')),
        
        # Thinking pause
        (re.compile(r'^(hmm+|hm+|uh+|um+|\.{3})$', re.I),
         ReflexMatch(avatar_reaction='tilt', canned_reply=None)),
        
        # Confusion
        (re.compile(r'^(huh\??|what\??|eh\??|❓|🤔)$', re.I),
         ReflexMatch(avatar_reaction='confused', canned_reply=None)),
        
        # Bye
        (re.compile(r'^(bye|goodbye|ttyl|gn|goodnight|cya|see ya)[\s!]*$', re.I),
         ReflexMatch(avatar_reaction='wave', canned_reply='Bye for now~')),
    ]
    
    @classmethod
    def match(cls, message: str) -> ReflexMatch | None:
        """Return a ReflexMatch if the message matches any reflex rule, else None."""
        stripped = message.strip()
        for pattern, match in cls.RULES:
            if pattern.fullmatch(stripped):
                return match
        return None
```

### 3.4 Backend Integration

In `routers/chat.py` (and `room_chat_stream.py`), check reflexes before LLM call:

```python
from services.reflex_engine import ReflexEngine

@router.post("/api/rooms/{room_id}/chat")
async def room_chat(...):
    # ... existing setup ...
    
    # Reflex check (before any LLM processing)
    if settings.reflex_layer_enabled:
        reflex = ReflexEngine.match(request.message)
        if reflex and reflex.skip_llm:
            # Return reflex response immediately
            return _build_reflex_response(
                room_id=room_id,
                agent_id=agent_id,
                reaction=reflex.avatar_reaction,
                canned_reply=reflex.canned_reply,
            )
    
    # Normal LLM path...
```

```python
def _build_reflex_response(room_id, agent_id, reaction, canned_reply):
    """Build a fast response that bypasses LLM entirely."""
    reply_text = canned_reply or ""
    
    if reply_text:
        # Store minimal message in room history
        RoomMessageRepository.add(room_id=room_id, agent_id=agent_id, content=reply_text, origin='reflex')
    
    return {
        "room_id": room_id,
        "responses": [{
            "agent_id": agent_id,
            "message": {"content": reply_text, "behavior": {"intent": reaction, "mood": None}},
            "processing_ms": 0,
            "reflex": True,
        }]
    }
```

**Streaming version:** For the SSE stream, emit a `reflex` event that the frontend can handle immediately:

```
event: reflex
data: {"agent_id": "...", "reaction": "nod", "reply": null}
```

Frontend: sees `reflex` event → fires avatar reaction immediately → no `thinking` state, no streaming state. Done in < 100ms.

### 3.5 What Reflexes Don't Handle

Reflexes should be **conservative**. If there's any ambiguity, fall through to LLM:

- Anything longer than ~5 words → LLM
- Questions of any kind → LLM  
- Anything emotionally complex → LLM
- Context-dependent short messages ("no", "why") → LLM (depends on prior context)
- Anything the character's current trust/emotional state would affect → LLM

The reflex layer is for the unambiguous noise — acknowledgments, greetings, emoji reactions. Not for anything that requires characterization.

### 3.6 Respecting P013 Emotional State

Reflexes are deliberately **character-agnostic** for now. A nod is a nod regardless of trust level. This keeps v1 simple.

**v2 consideration:** Add trust-gated reflex suppression. If `trust < 0.2`, greeting reflex fires with `'cold_nod'` instead of `'wave'`, and no canned reply. The character acknowledges but doesn't engage. This is a natural extension — implement after reflexes are working.

```python
# Future: trust-gated reflex behavior
if reflex and trust < 0.2:
    reflex = ReflexMatch(avatar_reaction='cold_nod', canned_reply=None)
```

### 3.7 Settings Flag

Add to `config.py`:

```python
reflex_layer_enabled: bool = True
inline_emotion_tags_enabled: bool = True
```

Both default True. Can be disabled per-environment if needed. Speech queue has no flag — it's always on once implemented.

---

## 4. Integration With P013 Emotional Architecture

### 4.1 What Changes, What Doesn't

| P013 System | Status | Notes |
|-------------|--------|-------|
| Per-turn VAD emotion engine | **Unchanged** | Still runs post-LLM. Inline tags are additive. |
| Trust/attachment persistence | **Unchanged** | Speech queue doesn't affect relationship dimensions |
| Dream system | **Unchanged** | No interaction with runtime layer |
| Behavioral rules (trust gates) | **Unchanged** | Reflex layer respects trust thresholds in v2 |
| Mood injection into system prompt | **Unchanged** | Pre-LLM mood context still assembled normally |
| SOUL.md Canon/Lived Experience | **Unchanged** | Not touched by any of these features |

### 4.2 Prompt Assembly Order

After adding inline emotion instruction:

```
1. Canon identity (SOUL.md — who you are)
2. Lived Experience (per-user, from DB — what you've been through with this person)
3. Behavioral rules (trust gates — how you're acting right now)
4. Emotional context / mood injection (per-turn — how you feel right now)
5. Inline emotion instruction (how to signal emotional changes during your response)
6. Conversation history
7. User message + game context
```

The inline emotion instruction goes after mood injection — it tells the character *how to express* the emotion that's already been injected, not what the emotion is.

### 4.3 No Double-Processing

Inline emotion tags are stripped from text before:
- Display to user
- Post-LLM emotion classification (GoEmotions runs on clean text)
- TTS (ElevenLabs doesn't speak `[mood:happy]`)

The `StreamingEmotionParser` strips tags from the text path. The post-LLM emotion engine runs on the accumulated clean text. No conflict.

---

## 5. Implementation Order for Ram

### Phase A: Speech Intent Queue (3-5 days)
**Why first:** Maximum impact. Users feel it immediately. No backend changes needed.

1. Create `frontend/src/store/speechStore.ts` — `SpeechQueue` with `enqueue()`, `interrupt()`, `_advance()`
2. Lift TTS call from `MessageBubble` to `ChatPanel` / `chatStore` event handler
3. After SSE `done` event: call `/api/speak`, create Blob, enqueue with `behavior: 'queue'`
4. Wire `InputControls` mic button (and VAD if active) to `speechStore.interrupt()`
5. Pass `alignment` data from speech store to `RoomAvatarTile` for lip sync timing
6. Remove audio playback from `MessageBubble` (keep replay button via stored `audio_base64`)

**Test:** Start a long response. Press mic button. Old audio stops, new response processes. Replay button still works on old messages.

### Phase B: Inline Emotion Tags (2-3 days)
**Why second:** Noticeable feel improvement, contained change.

1. Create `backend/services/inline_emotion_parser.py` — `StreamingEmotionParser` with buffer handling
2. Add `INLINE_EMOTION_INSTRUCTION` to system prompt assembly (`chat_context_runtime.py`)
3. Add `settings.inline_emotion_tags_enabled` flag to `config.py`
4. Modify `room_chat_stream.py`: pipe LLM chunks through parser, emit `emotion_inline` SSE events, strip tags from text chunks
5. Add `emotion_inline` to `RoomStreamEvent` union in `api.ts`
6. In `chatStore` / `RoomAvatarTile`: handle `emotion_inline` → immediate VRM expression update
7. Verify clean text reaches TTS (no tags in spoken audio)

**Test:** Ask the character something emotionally loaded. Watch avatar expression change mid-response before the sentence finishes. Check TTS doesn't speak the tags.

### Phase C: Cognitive Reflex Layer (2-3 days)
**Why third:** Latency win, but lowest user-visible impact of the three.

1. Create `backend/services/reflex_engine.py` — `ReflexEngine` with `RULES` and `match()`
2. Add `settings.reflex_layer_enabled` to `config.py`
3. Modify `routers/chat.py`: check `ReflexEngine.match()` before LLM call, return reflex response if matched
4. Modify `room_chat_stream.py`: emit `event: reflex` SSE event for streaming path
5. Add `reflex` to `RoomStreamEvent` union in `api.ts`
6. In `chatStore`: handle `reflex` event → fire avatar reaction, skip thinking/streaming states
7. Add `origin: 'reflex'` to message storage so reflex messages are identifiable in history

**Test:** Send "ok". Avatar nods in < 100ms. No thinking spinner. No LLM call in backend logs. Send "lol". Avatar laughs. Send "what's your favorite color". LLM path, not reflex.

### Total Estimate

| Phase | Frontend | Backend | Total |
|-------|----------|---------|-------|
| A: Speech Queue | 2-3 days | ~2 hours (alignment SSE field) | 2-3 days |
| B: Inline Emotions | 1 day | 1-2 days | 2-3 days |
| C: Reflex Layer | 1 day | 1-2 days | 2-3 days |
| **Total** | | | **~7-9 days** |

These phases are **independent**. A can ship without B or C. B depends on having streaming infrastructure. C is fully independent.

---

## 6. Files to Create / Modify

### New Files

| Path | What |
|------|------|
| `frontend/src/store/speechStore.ts` | Speech intent queue |
| `backend/services/inline_emotion_parser.py` | Streaming emotion tag parser |
| `backend/services/reflex_engine.py` | Reflex pattern matcher |

### Modified Files

| Path | Change |
|------|--------|
| `frontend/src/utils/api.ts` | Add `emotion_inline`, `reflex` to `RoomStreamEvent`; add `onEmotionInline`, `onReflex` callbacks to `streamRoomChat` |
| `frontend/src/store/chatStore.ts` | Handle `emotion_inline` and `reflex` events; lift TTS call from `MessageBubble` |
| `frontend/src/components/MessageBubble.tsx` | Remove audio playback (keep replay via stored base64) |
| `frontend/src/components/InputControls.tsx` | Wire mic button to `speechStore.interrupt()` |
| `frontend/src/components/rooms/RoomAvatarTile.tsx` | Accept and apply `immediateExpression` prop |
| `backend/services/room_chat_stream.py` | Add `StreamingEmotionParser` integration; emit `emotion_inline` SSE; add `reflex` short-circuit |
| `backend/routers/chat.py` | Add reflex check before LLM call |
| `backend/services/chat_context_runtime.py` | Add inline emotion instruction to system prompt |
| `backend/config.py` | Add `inline_emotion_tags_enabled`, `reflex_layer_enabled` |

### AIRI Reference Files (read before implementing)

| Feature | AIRI Path |
|---------|-----------|
| Speech intent queue | `packages/pipelines-audio/src/speech-pipeline.ts` |
| Priority resolver | `packages/pipelines-audio/src/priority.ts` |
| LLM marker parser | `packages/stage-ui/src/composables/llm-marker-parser.ts` |
| Reflex manager | `services/minecraft/src/cognitive/reflex/reflex-manager.ts` |

All cloned to `/home/tbach/Projects/airi-reference/`.

---

## 7. What This Enables

After all three phases:

- User speaks mid-response → old audio dies immediately, avatar turns to listen
- LLM streams `"I can't believe [mood:shy,0.4] you remembered that"` → avatar goes shy before "you remembered" is spoken
- User sends `"lol"` → avatar laughs in < 100ms, no LLM, no spinner
- Three-second LLM silence on simple acknowledgments: gone
- Old audio playing over new responses: gone
- Avatar expression changing after the character finishes talking: gone

P013 still owns the deep architecture — relationship, evolution, fragility, dreams. This doc owns the runtime feel. Neither conflicts with the other.

The combination is the product.

---

*This doc is ready for Ram. No design meeting needed.*
*— Beatrice, March 6, 2026*
