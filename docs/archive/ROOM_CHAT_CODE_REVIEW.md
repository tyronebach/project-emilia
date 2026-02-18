# Room Chat vs Main Chat — Code Review

**Issue:** #10 - Group Chat Code Review  
**Date:** 2026-02-13  
**Reviewer:** Ram

---

## Summary

The group chat (`/room/:roomId`) is missing several features present in the main chat (`/chat/:sessionId`). The emotion engine and animation system **are hooked up** (via `RoomAvatarStage` + `avatarCommandByAgent`), but the UI lacks visibility into them and several major features are absent entirely.

---

## Feature Comparison Matrix

| Feature | Main Chat | Room Chat | Gap |
|---------|-----------|-----------|-----|
| **Voice Chat (VAD/STT)** | ✅ `useVoiceChat` | ❌ | Critical |
| **TTS Playback** | ✅ `speakText()` | ❌ | Critical |
| **Games Panel** | ✅ `GamePanel` | ❌ | High |
| **Hands-Free Mode** | ✅ Full VAD loop | ❌ | High |
| **Status Pill** | ✅ Thinking/Speaking | ❌ | Medium |
| **Emotion Engine Display** | ✅ `currentMood` in Header | ❌ | Medium |
| **Debug Panel** | ✅ Voice timeline | ❌ | Medium |
| **Memory Modal** | ✅ | ❌ | Low |
| **Bond Modal** | ✅ | ❌ | Low |
| **About Modal** | ✅ | ❌ | Low |
| **User Settings Modal** | ✅ | ❌ | Low |
| **Drawer (Sessions)** | ✅ | ❌ | Low |
| **Awakening Overlay** | ✅ | ❌ | N/A (single-agent UX) |
| **Avatar Rendering** | ✅ Full-screen | ✅ Grid tiles | Different (OK) |
| **Animation System** | ✅ `applyAvatarCommand` | ✅ Per-agent commands | ✅ Connected |
| **Emotion Events** | ✅ `onEmotion` callback | ✅ Received (unused) | Partial |

---

## What's Working

### 1. Animation System — Hooked Up ✅
The room chat **does** receive avatar commands and routes them to the focused agent's renderer:

```typescript
// useRoomChat.ts:58-66
if (event.type === 'avatar') {
  const command = { intent, mood, intensity, energy, move, game_action };
  setAgentAvatarCommand(event.agent_id, command);

  if (focusedAgentId && focusedAgentId === event.agent_id) {
    applyAvatarCommand(command);  // ← Global app store, drives AvatarRenderer
  }
}
```

### 2. Emotion Events — Received But Ignored
```typescript
// useRoomChat.ts:68-70
if (event.type === 'emotion') {
  return;  // ← No-op, emotion data discarded
}
```

The backend sends emotion events, but room chat doesn't store or display them.

### 3. Multi-Agent Avatar Tiles — Working
`RoomAvatarStage` renders up to 4 agents with priority sorting (focused > streaming > recent activity).

---

## Critical Gaps

### 1. No Voice Chat
Main chat uses `useVoiceChat` for:
- Microphone capture with VAD (silence detection)
- Whisper STT transcription
- Auto-resume after response

Room chat is text-only. Voice in group chat would enable:
- Mention detection by voice
- Agent selection via "Hey [name]"

**Recommendation:** Create `useRoomVoiceChat` adapter or generalize `useVoiceChat` to accept room context.

### 2. No TTS Playback
Main chat has full TTS with lip-sync:
```typescript
// useChat.ts:45-100
const speakText = useCallback(async (text) => {
  // ElevenLabs API → audio blob → HTMLAudio playback
  // Lip-sync alignment with AvatarRenderer.lipSyncEngine
});
```

Room chat has no speech output. For group chat, would need:
- Queue-based TTS (one agent speaks at a time)
- Visual indicator of which agent is speaking

**Recommendation:** Add `useRoomTTS` hook with per-agent queue.

### 3. No Games Panel
Main chat conditionally shows `<GamePanel>` if agent has games enabled:
```typescript
{!isAwakening && gamesEnabledForAgent && <GamePanel />}
```

Room chat has no game support.

**Recommendation:** Either add room-level games or scope out explicitly.

---

## Medium Gaps

### 4. No Status Indicator
Main chat shows `<StatusPill>` for thinking/speaking states. Room chat has no global indicator — only per-agent "Speaking" badges.

**Recommendation:** Add per-agent status chips or a global room status banner.

### 5. No Mood Display
Main chat passes `currentMood` to Header for emotion visualization. Room chat discards emotion events.

```typescript
// chatStore has:
currentMood: SoulMoodSnapshot | null;
setCurrentMood: (snapshot) => ...;

// roomStore has:
// Nothing — emotion data not stored
```

**Recommendation:** Add `emotionByAgent: Record<string, EmotionSnapshot>` to roomStore, display in agent tiles.

### 6. No Debug Panel
Voice debug timeline (`VoiceDebugTimeline`) unavailable. Less critical since voice isn't implemented.

---

## Low-Priority Gaps

These are single-agent features that may not apply to rooms:

| Feature | Notes |
|---------|-------|
| Memory Modal | Could show per-agent memory or shared room context |
| Bond Modal | N/A for multi-agent |
| About Modal | Could show room info instead |
| User Settings | Available via Drawer in main chat; could add simple settings icon |
| Drawer | Session list; rooms have separate listing at `/rooms` |
| Awakening Overlay | Single-agent theatrical intro; skip for rooms |

---

## Architectural Differences

### Component Structure

**Main Chat:** Monolithic `App.tsx` (~400 lines) with inline `AppContent`
```
App.tsx
├── AvatarPanel (full-screen)
├── Header
├── ChatPanel
├── InputControls
├── Drawer
├── DebugPanel
├── MemoryModal
├── BondModal
├── AboutModal
├── UserSettingsModal
├── AwakeningOverlay
└── GamePanel
```

**Room Chat:** Separate page component (~250 lines)
```
RoomChatPage.tsx
├── AmbientBackground
├── AppTopNav
├── Message list (inline)
├── RoomAvatarStage
│   └── RoomAvatarTile (per-agent)
├── Mention chips (inline)
└── Input form (inline)
```

Room chat is cleaner but lacks feature parity.

### State Management

**Main Chat:**
- `useAppStore` — global app state (status, ttsEnabled, handsFree)
- `useChatStore` — messages, mood, emotion debug
- `useRenderStore` — avatar quality settings

**Room Chat:**
- `useRoomStore` — room-specific state (agents, messages, streaming, avatar commands)
- Partially uses `useAppStore` for `applyAvatarCommand` (focused agent only)

---

## Recommendations

### Phase 1: Visibility (Low Effort)
1. **Display emotion in agent tiles** — Store emotion events in `roomStore`, show mood badge
2. **Add status indicators** — Per-agent "Thinking" / "Speaking" chips
3. **Extract InputControls** — Reuse main chat's styled input component

### Phase 2: Voice (Medium Effort)
4. **Implement TTS** — Per-agent queue, show "🔊 Speaking" badge on active agent
5. **Add voice input** — Adapt `useVoiceChat` for room context

### Phase 3: Feature Parity (Higher Effort)
6. **Debug panel** — Minimal version showing room events
7. **Memory modal** — Show shared room context or per-agent memory
8. **Games support** — If applicable to multi-agent scenarios

---

## Files Changed / To Change

| File | Action |
|------|--------|
| `store/roomStore.ts` | Add `emotionByAgent`, `roomStatus` |
| `hooks/useRoomChat.ts` | Store emotion events, implement status tracking |
| `components/rooms/RoomChatPage.tsx` | Add StatusPill, emotion display, extract input |
| `components/rooms/RoomAvatarTile.tsx` | Add mood indicator |
| (new) `hooks/useRoomTTS.ts` | TTS with agent queue |
| (new) `hooks/useRoomVoiceChat.ts` | Voice input for rooms |

---

## Conclusion

The room chat has the **plumbing** for emotion/animation (backend sends events, avatar tiles render commands) but lacks the **UI visibility** and major features like voice. Priority should be:

1. Make emotion/status visible in the UI (quick win)
2. Add TTS playback (enables voice output parity)
3. Add voice input (enables full hands-free mode)

Games and modals are lower priority unless specifically needed for the room use case.

---

*Review complete. Awaiting Thai's feedback before implementation.*
