# Chat System Implementation Plan — 2026-02-18

Based on [AUDIT-CHAT-2026-02-18.md](./AUDIT-CHAT-2026-02-18.md). All 16 recommendations implemented across 6 phases.

---

## Phase 0: Dead Code Removal & Type Fixes

**Goal:** Clean slate before structural changes. No behavior changes. All tests must pass after each task.

### Task 0.1 — Unify `AgentStatus` type (Rec #1)

**Problem:** `chatStore.ts:14` exports `'idle' | 'thinking' | 'speaking'`, `roomStore.ts:6` exports `'idle' | 'thinking' | 'streaming'`. Conflicting exports, semantic mismatch.

**Decision:** Canonical set is `'idle' | 'thinking' | 'streaming' | 'speaking'`. Four states cover all use cases:
- `idle` — no activity
- `thinking` — waiting for LLM response
- `streaming` — receiving SSE chunks
- `speaking` — TTS audio playing (future group TTS)

**Changes:**
1. Create `frontend/src/types/chat.ts`:
   ```typescript
   export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'speaking';
   ```
2. `frontend/src/store/chatStore.ts:14` — delete local `AgentStatus`, import from `types/chat.ts`
3. `frontend/src/store/roomStore.ts:6` — delete local `AgentStatus`, import from `types/chat.ts`
4. Update `chatStore.ts:172-176` `statusPriority` to include `streaming: 2.5` (between thinking and speaking)
5. Update all files importing `AgentStatus` from either store to import from `types/chat.ts`

**Files:** `frontend/src/types/chat.ts` (new), `chatStore.ts`, `roomStore.ts`, any component importing `AgentStatus`

**Acceptance:** `npx tsc --noEmit` passes. No duplicate `AgentStatus` exports. `npx vitest run` passes.

---

### Task 0.2 — Delete dead `apply_decay()` in repository (Rec #2, #8)

**Problem:** `emotional_state.py:160-203` — unused linear-interpolation decay. Superseded by `EmotionEngine.apply_decay()` (exponential decay).

**Changes:**
1. Delete `EmotionalStateRepository.apply_decay()` method (lines 160-203)
2. Remove `import time` if no other usage in file

**Files:** `backend/db/repositories/emotional_state.py`

**Acceptance:** `pytest tests/ -v` passes. Grep for `apply_decay` in `repositories/` returns zero hits.

---

### Task 0.3 — Delete dead trigger buffer methods (Rec #9)

**Problem:** Six methods in `emotional_state.py` (lines 274+) are never called from anywhere:
- `get_trigger_buffer()`, `append_to_buffer()`, `clear_buffer()`
- `get_pending_triggers()`, `set_pending_triggers()`, `pop_pending_triggers()`

**Changes:**
1. Delete all six methods and the `# ========== Async Trigger Batching ==========` section header
2. The `trigger_buffer` and `pending_triggers` columns remain in the DB schema (harmless, avoids migration)

**Files:** `backend/db/repositories/emotional_state.py`

**Acceptance:** `pytest tests/ -v` passes. No references to deleted method names in `backend/`.

---

### Task 0.4 — Delete unused API methods (Rec #6, #7)

**Problem:**
- `api.ts:507` `updateRoomAgent()` — declared, zero callers
- `api.ts:552` `sendRoomMessage()` — declared, zero callers (streaming variant used)

**Changes:**
1. Delete `updateRoomAgent()` function and its type signature
2. Delete `sendRoomMessage()` function
3. Remove both from the default export object at bottom of file

**Files:** `frontend/src/utils/api.ts`

**Acceptance:** `npx tsc --noEmit` passes. `npx vitest run` passes.

---

### Task 0.5 — Fix mood_weights null fragility (Rec #14)

**Problem:** `emotion_runtime.py:79-88` has a runtime workaround for null `mood_weights_json`. The DB doesn't enforce non-null.

**Changes:**
1. In `backend/db/connection.py`, find the `emotional_state` table creation. Add `DEFAULT '{}'` to `mood_weights_json` column definition
2. Add a migration/seed step in `_run_migrations()` or `_seed_data()`:
   ```sql
   UPDATE emotional_state SET mood_weights_json = '{}' WHERE mood_weights_json IS NULL;
   ```
3. Keep the runtime workaround in `emotion_runtime.py` as defense-in-depth (don't remove it)

**Files:** `backend/db/connection.py`

**Acceptance:** `pytest tests/ -v` passes. New rows get `'{}'` not NULL.

---

## Phase 1: Backend — Extract LLM Service from rooms.py

**Goal:** Reduce `rooms.py` from 1084 lines by extracting LLM calling into a reusable service. No behavior changes.

### Task 1.1 — Extract `_stream_room_chat_sse` helper into a service (Rec #3)

**Problem:** `rooms.py` has 340 lines of inline LLM calling (lines 743-1084) with dual direct/openclaw mode handling. The non-streaming path (lines 540-740) duplicates message-building logic.

**Changes:**
1. Create `backend/services/llm_caller.py` with:
   ```python
   async def call_llm_streaming(
       agent: dict,
       llm_messages: list[dict],
       room_id: str,
       chat_mode: str,  # "direct" | "openclaw"
       agent_config: dict,
       agent_workspace: Path | None,
   ) -> AsyncGenerator[dict, None]:
       """Yield chunks from LLM. Each chunk: {"content": str} or {"done": True, "usage": dict}"""
   ```
2. Move direct-mode logic (current `rooms.py:805-846`) into `call_llm_streaming()`
3. Move openclaw-mode logic (current `rooms.py:870-953`) into `call_llm_streaming()`
4. `_stream_room_chat_sse()` calls `call_llm_streaming()` and handles SSE framing, message storage, emotion hooks
5. Non-streaming `chat()` handler in `rooms.py:540-740` also calls `call_llm_streaming()` (collecting chunks) instead of duplicating
6. Move `MAX_RESPONSE_CHARS` constant to `llm_caller.py`

**Files:**
- `backend/services/llm_caller.py` (new, ~200 lines)
- `backend/routers/rooms.py` (reduced by ~300 lines)

**Acceptance:** `pytest tests/ -v` passes. Both streaming and non-streaming chat work. Both direct and openclaw modes work. `rooms.py` under 800 lines.

---

### Task 1.2 — Extract shared SSE generator to break circular import (Rec #16)

**Problem:** `chat.py:259` does `from routers.rooms import _stream_room_chat_sse` inside function body to avoid circular import. Fragile — rename breaks silently at runtime.

**Changes:**
1. Move `_stream_room_chat_sse()` from `rooms.py` to `backend/services/room_chat_stream.py` (or into expanded `room_chat.py`)
2. Both `rooms.py` (room chat endpoint) and `chat.py` (DM wrapper) import from the service at module level
3. Remove the late import in `chat.py:259`
4. Also move helper functions that `_stream_room_chat_sse` depends on:
   - `_extract_behavior_dict()` — already utility-like
   - `_room_message_row()` — storage helper
   - `_maybe_compact_room()` — background task helper

**Files:**
- `backend/services/room_chat_stream.py` (new, or expand `room_chat.py`)
- `backend/routers/rooms.py` (slimmed to CRUD + endpoint wiring)
- `backend/routers/chat.py` (module-level import)

**Acceptance:** `pytest tests/ -v` passes. No `from routers.X import` inside function bodies. `python -c "from routers.chat import chat_router; from routers.rooms import rooms_router"` succeeds.

---

## Phase 2: Frontend — Merge Stores & Hooks

**Goal:** Unify `chatStore` + `roomStore` into one store, `useChat` + `useRoomChat` into one hook. Per `DECISIONS-UNIFIED-CHAT.md` Decision #5.

### Task 2.1 — Normalize naming convention (Rec #3.4 from audit)

**Problem:** `chatStore` uses `agentId` (camelCase), `roomStore` uses `agent_id` (snake_case). `Agent` vs `RoomAgent` types have different field names.

**Decision:** Use `agent_id` (snake_case) consistently to match the API contract. The API returns snake_case; the frontend should not transform.

**Changes:**
1. In `frontend/src/types/chat.ts` (created in 0.1), add unified message type:
   ```typescript
   export interface ChatMessage {
     id: string;
     room_id: string;
     sender_type: 'user' | 'agent';
     sender_id: string;
     sender_name?: string;
     content: string;
     timestamp: number;       // epoch seconds (matches API)
     origin: string;
     behavior?: Record<string, unknown>;
   }
   ```
2. This replaces both `MultiAgentMessage` (chatStore) and `RoomMessage` (API type used by roomStore)
3. Map existing `Message` type usage in components to `ChatMessage`

**Files:** `frontend/src/types/chat.ts`, `chatStore.ts`, `roomStore.ts`, components that reference `MultiAgentMessage`

**Acceptance:** `npx tsc --noEmit` passes. One message type used everywhere.

---

### Task 2.2 — Merge roomStore into chatStore (Rec #4)

**Problem:** Two stores with overlapping state (messages, agents, status, emotion, avatar commands). Different APIs, can't share components.

**Changes:**
1. Expand `chatStore.ts` to include all `roomStore` state:
   ```typescript
   interface ChatState {
     // Room context
     currentRoomId: string | null;
     currentRoom: Room | null;
     agents: RoomAgent[];                          // replaces roomAgents

     // Messages (unified type)
     messages: ChatMessage[];

     // Per-agent streaming
     streamingByAgent: Record<string, string>;     // from roomStore

     // Per-agent state
     statusByAgent: Record<string, AgentStatus>;   // replaces agentStatus
     emotionByAgent: Record<string, SoulMoodSnapshot>; // replaces agentMoods
     avatarCommandByAgent: Record<string, AvatarCommand>;
     lastAvatarEventAtByAgent: Record<string, number>;

     // UI
     focusedAgentId: string | null;
     isChatHistoryOpen: boolean;
     isParticipantsOpen: boolean;

     // Emotion debug (DM legacy, keep for debug panel)
     lastEmotionDebug: EmotionDebug | null;
     currentMood: SoulMoodSnapshot | null;

     // Actions (merged from both stores)
     setCurrentRoom: (room: Room | null) => void;
     setAgents: (agents: RoomAgent[]) => void;
     addMessage: (message: ChatMessage) => void;
     setMessages: (messages: ChatMessage[]) => void;
     clearMessages: () => void;
     appendStreamingContent: (agentId: string, content: string) => void;
     clearStreamingContent: (agentId: string) => void;
     resetStreaming: () => void;
     setAgentStatus: (agentId: string, status: AgentStatus) => void;
     clearAgentStatus: (agentId: string) => void;
     resetAgentStatuses: () => void;
     setAgentEmotion: (agentId: string, snapshot: SoulMoodSnapshot) => void;
     setAgentAvatarCommand: (agentId: string, command: AvatarCommand, timestamp?: number) => void;
     clearAgentAvatarCommand: (agentId: string) => void;
     resetRoomAvatars: () => void;
     setFocusedAgentId: (agentId: string | null) => void;
     // ... computed helpers
     getActiveAgents: () => RoomAgent[];
     getSpeakingAgent: () => RoomAgent | null;
     clearRoomState: () => void;
   }
   ```
2. Delete `frontend/src/store/roomStore.ts`
3. Update all imports of `useRoomStore` → `useChatStore`
4. Update all imports of `roomStore` types → `chatStore` or `types/chat.ts`

**Files affected** (update imports):
- `frontend/src/store/roomStore.ts` (delete)
- `frontend/src/store/chatStore.ts` (expand)
- `frontend/src/hooks/useRoomChat.ts` (update imports)
- `frontend/src/components/rooms/RoomChatPage.tsx` (update imports)
- `frontend/src/components/rooms/RoomAvatarStage.tsx` (update imports)
- `frontend/src/components/chat/AvatarStage.tsx` (update to use same state shape)
- `frontend/src/components/ChatPanel.tsx` (update message type)
- `frontend/src/App.tsx` (update state access)
- Tests: `useRoomChat.test.tsx`, `RoomChatPage.test.tsx`, `chatStore.test.ts`

**Acceptance:** `npx tsc --noEmit` passes. `npx vitest run` passes. No imports of `roomStore` remain. Both DM and room chat routes work (manual test).

---

### Task 2.3 — Unify useChat and useRoomChat hooks (Rec #5)

**Problem:** Two hooks with no shared abstraction. `useChat` has TTS; `useRoomChat` doesn't. Both parse SSE differently.

**Changes:**
1. Rewrite `useChat.ts` as the single chat hook:
   ```typescript
   export function useChat(roomId: string, options?: { mode: 'dm' | 'room' }) {
     // mode defaults based on agent count in room
     // DM: calls streamChat() (legacy facade)
     // Room: calls streamRoomChat()
     // Both: update unified chatStore
     // Both: handle TTS (see Phase 3)
     // Both: handle avatar commands
   }
   ```
2. The hook detects DM vs room based on `agents.length`:
   - 1 agent → DM path (`streamChat()`)
   - 2+ agents → room path (`streamRoomChat()`)
3. SSE handling unified: room events are the superset. DM events are a subset (no `agent_id`). The hook normalizes DM events by injecting the single agent's ID.
4. Delete `frontend/src/hooks/useRoomChat.ts`
5. Update `RoomChatPage.tsx` to use `useChat(roomId, { mode: 'room' })` or just `useChat(roomId)`
6. Update `App.tsx` to use `useChat(roomId)`

**Files:**
- `frontend/src/hooks/useChat.ts` (rewrite)
- `frontend/src/hooks/useRoomChat.ts` (delete)
- `frontend/src/components/rooms/RoomChatPage.tsx` (update hook usage)
- `frontend/src/App.tsx` (update hook usage)
- Tests: update/merge test files

**Acceptance:** `npx tsc --noEmit` passes. `npx vitest run` passes. DM chat works. Room chat works. No `useRoomChat` imports remain.

---

## Phase 3: Group Chat — TTS & Voice

**Goal:** Make group chat audible. Per `DECISIONS-UNIFIED-CHAT.md` Decision #6: per-agent queues + room-level arbiter.

### Task 3.1 — Add TTS to unified hook (Rec #10)

**Problem:** `useRoomChat` had no TTS. After merge (Task 2.3), the unified `useChat` needs TTS that works for both DM (1 agent) and group (N agents).

**Changes:**
1. In the unified `useChat.ts`, port `speakText()` logic from old `useChat.ts:70-146`
2. Add per-agent voice selection:
   ```typescript
   async function speakForAgent(agentId: string, text: string) {
     const agent = chatStore.agents.find(a => a.agent_id === agentId);
     const voiceId = agent?.voice_id || defaultVoiceId;
     // POST /api/speak with voice_id override
     // On audio start: setAgentStatus(agentId, 'speaking')
     // On audio end: setAgentStatus(agentId, 'idle')
   }
   ```
3. Add a sequential TTS queue for group chat:
   ```typescript
   const ttsQueue = useRef<Array<{ agentId: string; text: string }>>([]);
   const isSpeaking = useRef(false);

   function enqueueTTS(agentId: string, text: string) {
     ttsQueue.current.push({ agentId, text });
     if (!isSpeaking.current) drainQueue();
   }

   async function drainQueue() {
     isSpeaking.current = true;
     while (ttsQueue.current.length > 0) {
       const { agentId, text } = ttsQueue.current.shift()!;
       await speakForAgent(agentId, text);
     }
     isSpeaking.current = false;
   }
   ```
4. On `agent_done` event: if TTS enabled, `enqueueTTS(agentId, cleanContent)`
5. On abort/cancel: clear queue, stop current audio

**Files:**
- `frontend/src/hooks/useChat.ts` (add TTS section)

**Acceptance:** In DM, agent speaks after responding (existing behavior preserved). In group chat, agents speak sequentially — agent A finishes speaking before agent B starts. TTS can be disabled via toggle.

---

### Task 3.2 — Lip-sync routing for multi-agent (part of Rec #10)

**Problem:** Lip-sync currently drives the single global `avatarRenderer`. In group chat, lip-sync needs to target the correct agent's renderer.

**Changes:**
1. In `speakForAgent()`, after receiving audio + alignment data from `/api/speak`:
   - If DM (1 agent): apply lip-sync to global renderer (existing behavior)
   - If group: apply lip-sync to the agent's specific renderer (requires Phase 4)
   - Interim: apply lip-sync only to `focusedAgentId`'s renderer (matches current avatar command behavior)
2. This task ships the interim behavior. Full multi-agent lip-sync depends on Task 4.1.

**Files:** `frontend/src/hooks/useChat.ts`

**Acceptance:** Focused agent lip-syncs in group chat. Non-focused agents don't (acceptable interim).

---

## Phase 4: Group Chat — Multi-Agent Avatar Rendering

**Goal:** Each agent in a group chat gets independent VRM rendering with independent animations.

### Task 4.1 — Per-agent AvatarRenderer instances (Rec #11, #15)

**Problem:** `store/index.ts` holds one `avatarRenderer`. `RoomAvatarStage.tsx` renders tiles but they don't each have their own renderer. Only `focusedAgentId` gets avatar commands.

**Changes:**
1. Create `frontend/src/avatar/AvatarRendererRegistry.ts`:
   ```typescript
   class AvatarRendererRegistry {
     private renderers: Map<string, AvatarRenderer> = new Map();

     getOrCreate(agentId: string, canvas: HTMLCanvasElement, vrmUrl: string): AvatarRenderer;
     get(agentId: string): AvatarRenderer | null;
     applyCommand(agentId: string, command: AvatarCommand): void;
     dispose(agentId: string): void;
     disposeAll(): void;
   }

   export const avatarRegistry = new AvatarRendererRegistry();
   ```
2. Update `RoomAvatarStage.tsx` tiles to each mount their own canvas and register with the registry:
   ```tsx
   function RoomAvatarTile({ agent }: { agent: RoomAgent }) {
     const canvasRef = useRef<HTMLCanvasElement>(null);
     useEffect(() => {
       if (!canvasRef.current) return;
       const renderer = avatarRegistry.getOrCreate(agent.agent_id, canvasRef.current, agent.vrm_url);
       return () => avatarRegistry.dispose(agent.agent_id);
     }, [agent.agent_id]);
     // ...
   }
   ```
3. Update avatar command application in unified `useChat`:
   ```typescript
   // On avatar SSE event:
   if (event.type === 'avatar') {
     chatStore.setAgentAvatarCommand(event.agent_id, command);
     avatarRegistry.applyCommand(event.agent_id, command);  // ALL agents, not just focused
   }
   ```
4. Keep `useAppStore.avatarRenderer` for DM backwards compatibility (single-agent shortcut). In DM mode, `avatarRegistry` has one entry.
5. Dispose all renderers on room change (`clearRoomState`)

**Files:**
- `frontend/src/avatar/AvatarRendererRegistry.ts` (new)
- `frontend/src/components/rooms/RoomAvatarStage.tsx` (per-tile renderers)
- `frontend/src/hooks/useChat.ts` (route commands via registry)
- `frontend/src/store/index.ts` (keep legacy renderer for DM, bridge to registry)

**Performance notes:**
- Each renderer = separate WebGL context. Limit to 4 agents max per room.
- Use lower render quality for non-focused agents (quarter resolution).
- Share VRM model cache across renderers.

**Acceptance:** In group chat with 2-3 agents, each agent has an independent animated VRM. Avatar commands (mood, gestures) apply to the correct agent. DM still works with single renderer.

---

### Task 4.2 — Remove focusedAgentId guard for avatar commands (Rec #12)

**Problem:** `useRoomChat.ts:102-104` only applies avatar commands to `focusedAgentId`. After Task 4.1, all agents have renderers.

**Changes:**
1. In unified `useChat`, on `avatar` event: call `avatarRegistry.applyCommand(event.agent_id, command)` unconditionally
2. Remove the `if (focusedAgentId && focusedAgentId === event.agent_id)` guard
3. Keep `focusedAgentId` for UI highlighting (larger tile, name badge) but not for animation gating

**Files:** `frontend/src/hooks/useChat.ts`

**Acceptance:** All agents in a group chat animate independently. Focused agent still gets UI prominence.

---

### Task 4.3 — Full multi-agent lip-sync (completes Rec #10)

**Problem:** Task 3.2 shipped interim lip-sync (focused agent only). Now that per-agent renderers exist, route lip-sync to correct renderer.

**Changes:**
1. In `speakForAgent()`, after receiving alignment data:
   ```typescript
   const renderer = avatarRegistry.get(agentId);
   if (renderer) {
     renderer.lipSyncEngine.setAlignment(alignment);
     renderer.lipSyncEngine.play();
   }
   ```
2. Remove the interim focusedAgentId check from Task 3.2

**Files:** `frontend/src/hooks/useChat.ts`

**Acceptance:** In group chat, the agent currently speaking has active lip-sync. Other agents are idle. Lip-sync transitions correctly between agents in the TTS queue.

---

## Phase 5: Backend Hardening

**Goal:** Fix remaining fragility and improve error handling.

### Task 5.1 — Improve streaming error resilience (Rec #13)

**Problem:** `rooms.py:728-731` — if one agent's LLM call fails in multi-agent loop, it yields `agent_error` and continues. Frontend shows the error but there's no retry or prominent notification.

**Changes:**
1. In the frontend unified `useChat`, on `agent_error` event:
   - Show error message in chat (already done: `useRoomChat.ts:115-131`)
   - Additionally: set a toast/banner notification: `"Agent {name} failed to respond"` (if a toast system exists)
   - Add a "Retry" button on the error message that re-sends the same user message with `mention_agents: [failedAgentId]`
2. Backend: no changes needed (error handling is correct, just needs frontend visibility)

**Files:**
- `frontend/src/hooks/useChat.ts` (retry logic)
- `frontend/src/components/rooms/RoomChatPage.tsx` or chat message component (retry button UI)

**Acceptance:** When an agent fails in group chat, user sees an error message with a retry option. Retrying sends only to the failed agent.

---

### Task 5.2 — Move `_dm_stream_wrapper` late import to module level (part of Rec #16)

**Note:** This is completed by Task 1.2. If Task 1.2 extracts `_stream_room_chat_sse` to a service, the circular import is resolved and `chat.py` can do a normal module-level import. No additional work needed.

---

## Phase 6: Cleanup & Verification

**Goal:** Remove any remaining dead code, update docs, verify everything works.

### Task 6.1 — Remove stale audit docs

**Changes:**
1. Move `docs/AUDIT-UNIFIED-CHAT.md` (2026-02-17) to `docs/archive/`
2. Move `docs/PLAN-UNIFIED-CHAT.md` (superseded by this plan) to `docs/archive/`
3. Move `docs/DECISIONS-UNIFIED-CHAT.md` to `docs/archive/` (decisions incorporated into this plan)
4. Keep `docs/AUDIT-CHAT-2026-02-18.md` and this plan as current

**Files:** Move 3 files to `docs/archive/`

---

### Task 6.2 — Update DOCUMENTATION.md and AGENTS.md

**Changes:**
1. Update `DOCUMENTATION.md` to reflect:
   - Single unified `useChatStore` (no roomStore)
   - Single `useChat` hook (no useRoomChat)
   - `AvatarRendererRegistry` for multi-agent rendering
   - `llm_caller.py` service extraction
   - Group TTS with per-agent queue
2. Update `AGENTS.md` to reflect:
   - Merged store architecture
   - New service files

**Files:** `DOCUMENTATION.md`, `AGENTS.md`

---

### Task 6.3 — Full regression test

**Changes:**
1. Run `cd backend && .venv/bin/python -m pytest tests/ -v` — all pass
2. Run `cd frontend && npx vitest run` — all pass
3. Run `cd frontend && npm run build` — no errors
4. Manual smoke tests:
   - DM chat: send message, receive streaming response, TTS plays, avatar animates
   - Group chat: create room with 2+ agents, send message, both agents respond, both animate, TTS plays sequentially
   - Room list: create, rename, delete rooms
   - Debug panel: emotion debug shows per-agent data
   - Designer V2: drift simulation runs
   - Admin panel: agent management works

---

## Dependency Graph

```
Phase 0 (parallel tasks, no dependencies between them)
  ├── 0.1 Unify AgentStatus type
  ├── 0.2 Delete dead apply_decay()
  ├── 0.3 Delete dead trigger buffer methods
  ├── 0.4 Delete unused API methods
  └── 0.5 Fix mood_weights null fragility

Phase 1 (sequential, depends on Phase 0)
  ├── 1.1 Extract LLM caller service
  └── 1.2 Extract SSE generator to service (depends on 1.1)

Phase 2 (sequential, depends on Phase 0)
  ├── 2.1 Normalize naming convention
  ├── 2.2 Merge roomStore into chatStore (depends on 2.1)
  └── 2.3 Unify useChat and useRoomChat (depends on 2.2)

Phase 3 (depends on Phase 2)
  ├── 3.1 Add TTS to unified hook
  └── 3.2 Interim lip-sync routing (depends on 3.1)

Phase 4 (depends on Phase 2; 4.3 depends on Phase 3)
  ├── 4.1 Per-agent AvatarRenderer instances
  ├── 4.2 Remove focusedAgentId guard (depends on 4.1)
  └── 4.3 Full multi-agent lip-sync (depends on 4.1 + 3.1)

Phase 5 (depends on Phase 2)
  └── 5.1 Streaming error resilience

Phase 6 (depends on all above)
  ├── 6.1 Archive stale docs
  ├── 6.2 Update DOCUMENTATION.md and AGENTS.md
  └── 6.3 Full regression test
```

**Note:** Phase 1 (backend) and Phase 2 (frontend) can run in parallel after Phase 0 completes.

---

## Estimated Scope

| Phase | Tasks | New Files | Deleted Files | Lines Changed (est.) |
|-------|-------|-----------|---------------|---------------------|
| 0 | 5 | 1 | 0 | ~100 |
| 1 | 2 | 2 | 0 | ~600 (refactor) |
| 2 | 3 | 0 | 2 | ~800 (refactor) |
| 3 | 2 | 0 | 0 | ~150 |
| 4 | 3 | 1 | 0 | ~400 |
| 5 | 1 | 0 | 0 | ~50 |
| 6 | 3 | 0 | 0 | ~100 |
| **Total** | **19** | **4** | **2** | **~2200** |

---

## Risk Mitigation

1. **Phase 2 (store merge) is the riskiest change.** It touches every chat component. Mitigation: do 2.1 (types) first, then 2.2 (store), then 2.3 (hooks) — each independently testable.

2. **Phase 4 (multi-renderer) has performance risk.** Multiple WebGL contexts are expensive. Mitigation: cap at 4 agents per room, reduce render quality for non-focused agents, share model cache.

3. **Phase 1 (backend extraction) could break streaming.** Mitigation: run full backend test suite after each sub-task. Test both direct and openclaw modes.

4. **DM regression during Phase 2.** The DM path is the primary user path and must not break. Mitigation: DM is just a single-agent room after merge — test DM after every Phase 2 task.
