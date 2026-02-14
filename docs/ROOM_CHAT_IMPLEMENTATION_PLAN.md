# Room Chat Implementation Plan

**Issue:** #12  
**Date:** 2026-02-14  
**Author:** Ram

---

## Executive Summary

Two architectural options exist:

1. **Unified Chat** — Merge single-agent and room chat into one interface. Single chat becomes a room with one agent.
2. **Parallel Parity** — Keep separate routes but share components and achieve feature parity.

**Recommendation:** Option 1 (Unified Chat) — simpler long-term maintenance, single source of truth. Thai's Discord analogy (group chat + DM) fits this well: DMs are just 1-on-1 rooms.

---

## Architecture Decision

### Option 1: Unified Chat (Recommended)

**Concept:** Every chat is a room. `/chat/:sessionId` internally uses the room interface with a single agent.

**Pros:**
- One interface to maintain
- No feature drift between single/multi
- Natural scaling: add agents to any chat
- Matches Discord/Slack mental model

**Cons:**
- Breaking change to existing routes
- Migration path needed
- Avatar layout needs graceful fallback (full-screen when 1 agent, grid when 2+)

**Migration Path:**
1. Build shared components in `components/chat/`
2. Refactor RoomChatPage to use them
3. Refactor App.tsx (single chat) to use them
4. Optionally merge routes: `/chat/:sessionId` redirects to `/room/:roomId` with room created on-demand

### Option 2: Parallel Parity

**Concept:** Keep both interfaces but extract shared components.

**Pros:**
- Non-breaking
- Can ship incrementally

**Cons:**
- Two interfaces to maintain forever
- Feature drift inevitable
- More code long-term

---

## Phase 1: Quick Wins (1-2 days)

### 1.1 Fix Enter Key Bug

**Problem:** Enter key doesn't send in room chat.

**Root Cause:** The `onKeyDown` handler casts `KeyboardEvent` to `FormEvent`, then `onSubmit` calls `event.preventDefault()` on it. While not technically breaking, the type coercion is unsafe.

**Fix:** Extract send logic from form submission:

```typescript
// RoomChatPage.tsx
const handleSend = async () => {
  const trimmed = input.trim();
  if (!trimmed || isLoading) return;
  
  setInput('');
  const mentions = [...mentionAgents];
  setMentionAgents([]);
  await sendMessage(trimmed, mentions.length ? mentions : undefined);
};

const onSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  void handleSend();
};

// In textarea:
onKeyDown={(e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!isLoading && input.trim()) {
      void handleSend();
    }
  }
}}
```

### 1.2 Extract Shared InputBar Component

Create `components/chat/ChatInputBar.tsx`:

```typescript
interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  isLoading: boolean;
  placeholder?: string;
  // Voice props (optional for rooms initially)
  voiceEnabled?: boolean;
  onVoiceToggle?: () => void;
  voiceState?: VoiceState;
}
```

Both App.tsx and RoomChatPage use this. Single chat adds voice controls; room chat starts without.

### 1.3 Display Emotion in Room

**Files:**
- `store/roomStore.ts` — Add `emotionByAgent: Record<string, EmotionSnapshot>`
- `hooks/useRoomChat.ts` — Store emotion events (currently discarded)
- `components/rooms/RoomAvatarTile.tsx` — Show mood badge

---

## Phase 2: Feature Parity (3-5 days)

### 2.1 Add Status Indicators

Per-agent status chips in room tiles: "Thinking" / "Speaking" / "Idle"

**Files:**
- `store/roomStore.ts` — Add `statusByAgent: Record<string, AgentStatus>`
- `components/rooms/RoomAvatarTile.tsx` — Render status pill

### 2.2 Add TTS Playback

**New Hook:** `hooks/useRoomTTS.ts`

Queue-based TTS for rooms:
- Only one agent speaks at a time
- Show "🔊 Speaking" badge on active agent
- Auto-advance queue

```typescript
interface RoomTTSState {
  queue: Array<{ agentId: string; text: string }>;
  speakingAgentId: string | null;
}

function useRoomTTS() {
  const [state, setState] = useState<RoomTTSState>({ queue: [], speakingAgentId: null });
  
  const enqueue = (agentId: string, text: string) => { ... };
  const speakNext = async () => { ... };
  
  return { enqueue, speakingAgentId: state.speakingAgentId };
}
```

### 2.3 Add Drawer (Session List)

Port `Drawer` component to room chat. Shows:
- Other rooms
- Single chat sessions
- Quick navigation

**Implementation:** Extract `components/chat/SessionDrawer.tsx` from existing Drawer, use in both interfaces.

### 2.4 Add/Remove Agents from Room

**UI Changes:**
- Room header shows agent count with manage button
- Modal to add agents from user's available agents
- Remove agent via X button on tile

**API:**
- `POST /api/rooms/:roomId/agents` — Add agent
- `DELETE /api/rooms/:roomId/agents/:agentId` — Remove agent

**Backend:** Add routes to `routers/rooms.py` (or create if missing).

---

## Phase 3: Voice (5-7 days)

### 3.1 Voice Input for Rooms

**New Hook:** `hooks/useRoomVoiceChat.ts`

Adapts `useVoiceChat` for room context:
- Voice → STT → detect @mentions in text
- "Hey Emilia" triggers mention automatically
- Route to correct agent

```typescript
function useRoomVoiceChat(roomId: string, agents: Agent[]) {
  // Reuse VoiceActivityDetector from useVoiceChat
  // On transcription, parse for agent names
  // Call sendMessage with detected mentions
}
```

### 3.2 Hands-Free Mode for Rooms

Full VAD loop:
- User speaks → STT → parse mentions → send → TTS response → resume listening

Requires both `useRoomVoiceChat` and `useRoomTTS` integrated.

---

## Phase 4: Unified Interface (Optional, 5+ days)

If Thai approves Option 1:

### 4.1 Create Room from Session

When user starts single chat:
1. Create room with 1 agent
2. Store mapping: `session_id → room_id`
3. Frontend uses unified room UI

### 4.2 Route Migration

```typescript
// routes/user/$userId/chat.$sessionId.tsx
function ChatRoute() {
  const { sessionId } = useParams();
  // Look up room_id for this session, render RoomChatPage
}
```

### 4.3 Avatar Layout

- 1 agent: Full-screen avatar (existing App.tsx behavior)
- 2+ agents: Grid tiles (existing RoomChatPage behavior)

```typescript
function AdaptiveAvatarLayout({ agents }: { agents: Agent[] }) {
  if (agents.length === 1) {
    return <FullScreenAvatar agent={agents[0]} />;
  }
  return <RoomAvatarStage agents={agents} />;
}
```

---

## Shared Components Extraction

| New Component | Extracts From | Used By |
|---------------|--------------|---------|
| `ChatInputBar` | App.tsx InputControls + RoomChatPage form | Both |
| `SessionDrawer` | App.tsx Drawer | Both |
| `MessageBubble` | ChatPanel + RoomChatPage inline | Both |
| `StatusPill` | Header | Both (per-agent in rooms) |
| `ChatHeader` | Header + AppTopNav | Both |

---

## Files to Create/Modify

### New Files
```
frontend/src/
├── components/chat/
│   ├── ChatInputBar.tsx
│   ├── SessionDrawer.tsx
│   ├── MessageBubble.tsx
│   └── ChatLayout.tsx
├── hooks/
│   ├── useRoomTTS.ts
│   └── useRoomVoiceChat.ts
```

### Modified Files
```
frontend/src/
├── store/roomStore.ts         # Add emotion, status
├── hooks/useRoomChat.ts       # Store emotion, integrate TTS
├── components/rooms/
│   ├── RoomChatPage.tsx       # Use shared components
│   └── RoomAvatarTile.tsx     # Add mood/status display
├── App.tsx                    # Use shared ChatInputBar
```

### Backend (if add/remove agents)
```
backend/routers/rooms.py       # Add/remove agent endpoints
backend/db/repositories/rooms.py  # Room agent management
```

---

## Questions for Thai

1. **Unified vs Parallel?** I recommend Unified (Option 1). Confirm?

2. **Add/Remove Agents Priority?** Want this in Phase 2 or defer?

3. **Voice Priority?** Full voice parity is significant effort. Prioritize over UI polish?

4. **Games in Rooms?** The review flagged this as a gap. Worth supporting?

5. **Migration Path?** If unified, do we:
   - Hard redirect `/chat/:id` → `/room/:id`?
   - Soft migration (both routes work, `/chat` wraps room)?

---

## Recommended Order

1. **Phase 1.1** — Fix Enter key (today, PR ready)
2. **Phase 1.2** — Extract ChatInputBar (1 day)
3. **Phase 1.3** — Emotion display (1 day)
4. **Phase 2.1-2.3** — Status, TTS, Drawer (3-5 days)
5. **Phase 2.4** — Add/remove agents (2 days)
6. **Phase 3** — Voice (5-7 days)
7. **Phase 4** — Unified interface (5+ days, if approved)

Total: ~3-4 weeks for full parity, or ~1 week for Phases 1-2.

---

*Implementation plan ready. Awaiting Thai's decisions on questions above.*
