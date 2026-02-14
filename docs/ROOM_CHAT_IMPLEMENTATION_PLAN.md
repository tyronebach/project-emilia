# Room Chat Implementation Plan

**Issue:** #12 - Implementation Plan for ROOM_CHAT_CODE_REVIEW  
**Date:** 2026-02-14  
**Author:** Ram

---

## Executive Summary

Unify room chat and single chat into a consistent experience. The goal is seamless UX where users don't feel they're in a "different mode" — just chatting with one or more agents.

**Key Decision Point:** Should we unify routes under one interface, or keep them separate with shared components?

---

## Architectural Question: Unified vs Dual Routes

### Option A: Unified Route (Recommended)
Replace both `/chat/:sessionId` and `/room/:roomId` with a single `/chat/:id` that handles 1-N agents.

**Pros:**
- Single codebase, single interface
- No feature drift between chat modes
- Simpler mental model for users
- Avatar grid naturally scales: 1 agent = full screen, 2+ agents = grid

**Cons:**
- Larger refactor
- Need to migrate existing sessions
- Backend changes to unify session/room models

### Option B: Shared Components (Lower Risk)
Keep dual routes but extract shared components.

**Pros:**
- Lower risk, incremental
- Can ship room chat fixes faster
- No migration needed

**Cons:**
- Feature drift will continue
- Maintenance overhead doubles
- Users still learn two interfaces

### Recommendation

**Start with Option B** (shared components) to fix immediate issues, then migrate to **Option A** (unified route) in a later phase. This lets us ship quickly while building toward the right architecture.

---

## Phase 1: Fix Critical UX Issues (1-2 days)

### 1.1 Enter Key to Send
**Problem:** Room chat requires mouse click to send; main chat uses Enter.

**Fix:** Add `onKeyDown` handler to room chat textarea.

```typescript
// RoomChatPage.tsx - update the textarea
<textarea
  ...
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void onSubmit(new Event('submit'));
    }
  }}
/>
```

**Files:**
- `frontend/src/components/rooms/RoomChatPage.tsx`

---

### 1.2 Extract Shared InputControls
**Problem:** Room chat has inline form; main chat uses `<InputControls>` with proper styling.

**Fix:** Make `InputControls` accept an `onSend` callback, use in both places.

```typescript
// InputControls.tsx - add optional props
interface InputControlsProps {
  voiceState?: VoiceState;
  onSend?: (message: string) => Promise<void>;  // New: external send handler
  isMultiAgent?: boolean;                        // New: hide games/voice for rooms (for now)
}
```

**Files:**
- `frontend/src/components/InputControls.tsx` (generalize)
- `frontend/src/components/rooms/RoomChatPage.tsx` (use InputControls)

---

### 1.3 Add Room Status Indicator
**Problem:** No visible "Thinking..." status in room chat.

**Fix:** Add per-agent status tracking to roomStore, display status chips.

```typescript
// roomStore.ts - add
statusByAgent: Record<string, 'idle' | 'thinking' | 'speaking'>;
setAgentStatus: (agentId: string, status: 'idle' | 'thinking' | 'speaking') => void;

// RoomChatPage.tsx - show status
{agents.map(agent => (
  <AgentStatusChip 
    key={agent.agent_id}
    name={agent.display_name}
    status={statusByAgent[agent.agent_id] || 'idle'}
  />
))}
```

**Files:**
- `frontend/src/store/roomStore.ts`
- `frontend/src/hooks/useRoomChat.ts`
- `frontend/src/components/rooms/RoomChatPage.tsx`

---

## Phase 2: Feature Parity — Visibility (2-3 days)

### 2.1 Store and Display Emotions
**Problem:** Emotion events received but discarded.

**Fix:** Store emotions per-agent, display mood badge in avatar tiles.

```typescript
// roomStore.ts - add
emotionByAgent: Record<string, EmotionSnapshot>;
setAgentEmotion: (agentId: string, emotion: EmotionSnapshot) => void;

// useRoomChat.ts - handle emotion event
if (event.type === 'emotion') {
  setAgentEmotion(event.agent_id, {
    primary: event.primary,
    secondary: event.secondary,
    valence: event.valence,
    arousal: event.arousal,
  });
}
```

**Files:**
- `frontend/src/store/roomStore.ts`
- `frontend/src/hooks/useRoomChat.ts`
- `frontend/src/components/rooms/RoomAvatarTile.tsx` (add mood badge)

---

### 2.2 Shared ChatPanel
**Problem:** Room chat has inline message list; main chat uses `<ChatPanel>`.

**Fix:** Abstract ChatPanel to accept messages array + render function.

```typescript
// ChatPanel.tsx - generalize
interface ChatPanelProps {
  messages: Array<{ id: string; role: string; content: string; ... }>;
  renderMessage?: (msg) => ReactNode;  // Custom renderer for room messages
  onMessageClick?: (msg) => void;      // Focus agent on click
}
```

**Files:**
- `frontend/src/components/ChatPanel.tsx` (generalize)
- `frontend/src/components/rooms/RoomChatPage.tsx` (use ChatPanel)

---

### 2.3 Add Session Drawer to Rooms
**Problem:** No way to see other sessions/rooms from room chat.

**Fix:** Reuse Drawer component.

```typescript
// RoomChatPage.tsx - add drawer
<Drawer
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  showRooms  // New prop to include room list
/>
```

**Files:**
- `frontend/src/components/Drawer.tsx` (add rooms section)
- `frontend/src/components/rooms/RoomChatPage.tsx` (add drawer state + toggle)

---

## Phase 3: Voice & TTS (3-5 days)

### 3.1 Room TTS Playback
**Problem:** No voice output in room chat.

**Architecture:**
- Queue-based: one agent speaks at a time
- Visual indicator of speaking agent
- Reuse existing TTS service

```typescript
// hooks/useRoomTTS.ts (new)
export function useRoomTTS() {
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  const queue = useRef<Array<{ agentId: string; text: string }>>([]);

  const speak = useCallback(async (agentId: string, text: string) => {
    queue.current.push({ agentId, text });
    if (!speakingAgentId) {
      processQueue();
    }
  }, [speakingAgentId]);

  const processQueue = async () => {
    const next = queue.current.shift();
    if (!next) return;
    
    setSpeakingAgentId(next.agentId);
    await playTTS(next.text, getAgentVoice(next.agentId));
    setSpeakingAgentId(null);
    
    if (queue.current.length) processQueue();
  };

  return { speak, speakingAgentId };
}
```

**Files:**
- `frontend/src/hooks/useRoomTTS.ts` (new)
- `frontend/src/hooks/useRoomChat.ts` (integrate TTS on agent_done)
- `frontend/src/store/roomStore.ts` (add speakingAgentId)

---

### 3.2 Room Voice Input
**Problem:** No voice input in room chat.

**Architecture:**
- Adapt `useVoiceChat` for room context
- Voice transcript routes to room chat endpoint
- Could use wake word detection: "Hey [agent name]" → mention that agent

```typescript
// hooks/useRoomVoiceChat.ts (new) — mostly wraps useVoiceChat
export function useRoomVoiceChat(roomId: string) {
  const { sendMessage } = useRoomChat(roomId);
  
  return useVoiceChat({
    onTranscript: (text) => {
      const mentionedAgents = detectMentions(text); // "Hey Emilia" → ['emilia']
      sendMessage(text, mentionedAgents);
    },
    ...
  });
}
```

**Files:**
- `frontend/src/hooks/useRoomVoiceChat.ts` (new)
- `frontend/src/components/rooms/RoomChatPage.tsx` (add voice toggle)
- `frontend/src/components/InputControls.tsx` (enable voice button for rooms)

---

## Phase 4: Agent Management (2-3 days)

### 4.1 Add/Remove Agents UI
**Problem:** No way to modify room membership from chat UI.

**Fix:** Add agent management panel in room sidebar.

```typescript
// components/rooms/RoomAgentManager.tsx (new)
function RoomAgentManager({ roomId, agents, availableAgents }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-bg-secondary/70 p-4">
      <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">
        Agents in Room
      </p>
      {agents.map(agent => (
        <AgentChip 
          key={agent.agent_id}
          agent={agent}
          onRemove={() => removeAgentFromRoom(roomId, agent.agent_id)}
        />
      ))}
      <AddAgentButton 
        availableAgents={availableAgents}
        onAdd={(agentId) => addAgentToRoom(roomId, agentId)}
      />
    </div>
  );
}
```

**Backend API needed:**
```
POST /api/rooms/:roomId/agents     { agent_id: string }
DELETE /api/rooms/:roomId/agents/:agentId
```

**Files:**
- `frontend/src/components/rooms/RoomAgentManager.tsx` (new)
- `frontend/src/components/rooms/RoomChatPage.tsx` (add manager to sidebar)
- `frontend/src/utils/api.ts` (add room agent management APIs)
- `backend/routers/rooms.py` (add endpoints)

---

## Phase 5: Unified Chat Architecture (Future)

### 5.1 Unified Session Model
Merge session and room concepts into one.

```python
# Backend: Session becomes multi-agent capable
class Session:
    id: str
    user_id: str
    agents: List[str]  # 1 for single chat, N for room
    name: str | None   # Optional for rooms
```

### 5.2 Single Chat Route
```
/user/:userId/chat/:sessionId  # Works for 1 or N agents
```

Avatar display adapts:
- 1 agent: Full-screen avatar (current single chat UX)
- 2-4 agents: Grid layout (current room UX)
- 5+ agents: Scrollable list or carousel

### 5.3 Migration Path
1. Add `agents` array to sessions table (default: [current_agent_id])
2. Update session endpoints to handle multi-agent
3. Migrate rooms → sessions with multiple agents
4. Deprecate `/room` routes, redirect to `/chat`
5. Remove room-specific code

---

## Implementation Order

| Priority | Task | Effort | Dependencies |
|----------|------|--------|--------------|
| P0 | Enter key to send | 30 min | None |
| P0 | Extract InputControls | 2 hrs | None |
| P1 | Room status indicator | 2 hrs | None |
| P1 | Store/display emotions | 3 hrs | None |
| P2 | Shared ChatPanel | 3 hrs | None |
| P2 | Session Drawer in rooms | 2 hrs | None |
| P3 | Room TTS playback | 4 hrs | None |
| P3 | Room voice input | 4 hrs | Room TTS |
| P4 | Add/remove agents | 4 hrs | Backend API |
| P5 | Unified architecture | 2 days | All above |

---

## Questions for Thai

1. **Unified vs Dual Routes:** Should I proceed with Option B (shared components) now and plan Option A (unified route) for later? Or jump straight to unification?

2. **Voice Priority:** Is room voice input a priority, or should we focus on text-based feature parity first?

3. **Agent Management:** Should adding/removing agents be:
   - In-chat UI (sidebar button)?
   - Settings page only?
   - Both?

4. **Games in Rooms:** Should games work in multi-agent context, or scope out explicitly?

5. **Mobile:** Any specific mobile considerations for room chat grid layout?

---

## Appendix: File Impact Summary

| File | Changes |
|------|---------|
| `components/InputControls.tsx` | Generalize for room use |
| `components/ChatPanel.tsx` | Accept external message array |
| `components/Drawer.tsx` | Add rooms section |
| `components/rooms/RoomChatPage.tsx` | Major refactor (use shared components) |
| `components/rooms/RoomAvatarTile.tsx` | Add emotion/status badges |
| `components/rooms/RoomAgentManager.tsx` | New file |
| `store/roomStore.ts` | Add emotion, status tracking |
| `hooks/useRoomChat.ts` | Handle emotion events, integrate TTS |
| `hooks/useRoomTTS.ts` | New file |
| `hooks/useRoomVoiceChat.ts` | New file |
| `backend/routers/rooms.py` | Agent management endpoints |
| `utils/api.ts` | Room agent management functions |

---

*Plan complete. Awaiting Thai's input before starting implementation.*
