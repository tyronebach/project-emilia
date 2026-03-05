# Chat System Review Prompt

Paste this into Claude CLI from the emilia-webapp root.

---

You are reviewing the chat system of emilia-webapp — a React 19 + FastAPI waifu companion app. Your job is a **full architectural and functional audit** of the chat/rooms system. Be thorough, be honest, be specific with file paths and line numbers.

## Context

The app has two chat modes that should coexist under a unified architecture:

1. **1:1 DM** — one human, one agent
2. **Group chat** — one human, multiple agents

Each agent must have **completely independent**:
- Emotion state + emotion drift (per user-agent pair)
- User-agent bond tracking
- LLM context injection based on emotion/bond/drift state
- Animation system (VRM viewer, expressions, gestures)
- Voice / TTS output
- Works with both `openclaw` and `direct` LLM backends

Existing audit docs to read first:
- `docs/AUDIT-UNIFIED-CHAT.md` — previous audit (2026-02-17), has current-state map
- `docs/PLAN-UNIFIED-CHAT.md` — migration plan (planning only, not implemented)
- `docs/DECISIONS-UNIFIED-CHAT.md` — design decisions if it exists
- `AGENTS.md` — project structure reference
- `DOCUMENTATION.md` — LLM-focused repo map

## What I Need

### 1. Current State Assessment

Map the actual working paths vs dead/stranded code:

**Backend:**
- `backend/routers/chat.py` — the 1:1 chat runtime. Is it robust? Is it over-complex?
- `backend/routers/rooms.py` — the rooms router. Is it mounted? Is it dead code?
- `backend/routers/sessions.py` — session CRUD. How does it relate to rooms?
- `backend/services/room_chat.py` — room chat service. Called by anything?
- `backend/services/emotion_engine.py` + `emotion_runtime.py` — emotion pipeline. Is per-agent isolation correct?
- `backend/services/drift_simulator.py` — drift per agent-user pair?
- `backend/services/chat_context_runtime.py` — what context gets injected into LLM calls? Does it include emotion/bond/drift per agent?
- `backend/db/repositories/emotional_state.py` — keyed by (user_id, agent_id)?
- `backend/db/repositories/room_repository.py` — used? dead?

**Frontend:**
- `frontend/src/hooks/useChat.ts` — the DM chat hook. Does it work?
- `frontend/src/hooks/useRoomChat.ts` — the group chat hook. Does it work? Is it wired in?
- `frontend/src/store/chatStore.ts` vs `frontend/src/store/roomStore.ts` — two stores or unified?
- `frontend/src/components/chat/AvatarStage.tsx` — multi-agent avatar layout. Working?
- `frontend/src/components/rooms/RoomChatPage.tsx` — is this route reachable?
- `frontend/src/components/ChatPanel.tsx` — does it handle both DM and group?
- `frontend/src/utils/api.ts` — room API methods: are they called from anywhere outside api.ts?
- Route tree (`frontend/src/routes/`) — which chat routes are active vs orphaned?

### 2. Frontend ↔ Backend Contract Audit

For each feature, trace the full path: UI component → hook/store → API call → backend router → service → DB. Flag mismatches:

- **Send message (DM):** Does the frontend send correctly? Does the backend process correctly? SSE response working?
- **Send message (group):** Can the frontend send to a room? Does the backend route to multiple agents? Does each agent respond independently?
- **Emotion display:** Frontend reads emotion state → does it come from SSE events per agent? Is the backend emitting per-agent emotion in group context?
- **Avatar/animation:** In group chat, does each agent's VRM viewer get independent emotion-driven animations?
- **Voice/TTS:** In group chat, does each agent speak with their own voice? Sequenced or overlapping?
- **Bond/drift:** Are these per (user, agent) in both frontend state and backend DB?
- **History loading:** Does loading chat history work for both DM sessions and group rooms? Are messages attributed to the correct agent?

### 3. What's Broken (Known and Discovered)

Known issue: **Group chat doesn't work at all on the frontend.** Find out why. Specifically:
- Is the room route mounted in the route tree?
- Is `useRoomChat.ts` functional or stubbed?
- Does `roomStore.ts` connect to real API endpoints?
- Are room API endpoints (`/api/rooms/*`) even mounted on the backend?
- What's the minimum set of changes to make group chat functional?

### 4. Complexity Assessment

Rate each subsystem: **Simple / Reasonable / Over-engineered / Tangled**

- Chat router (`chat.py`) — how many responsibilities? Should it be split?
- Emotion pipeline — is the engine → runtime → state → injection chain clean?
- Session vs Room abstraction — is having both causing confusion?
- Frontend state management — chatStore vs roomStore, are they in conflict?
- API client — is `api.ts` a monolith? How big is it?

### 5. Non-Chat Systems Smoke Test

Quickly verify these still work and aren't broken by chat changes:
- **Debug panel** — emotion/avatar/voice debug tools
- **Designer V2** — personality/bond calibration (`backend/routers/designer_v2.py`)
- **Manage page** — agent management
- **VRM viewer** — standalone avatar rendering
- **TTS** — ElevenLabs integration and cache

### 6. Recommendations

Deliver a prioritized list:
1. **Critical fixes** — things that are broken right now
2. **Architecture simplifications** — where to reduce complexity
3. **Dead code removal** — what to delete
4. **Group chat path** — the minimum viable path to working group chat
5. **Risk areas** — things that look fragile and might break next

## Output Format

Structure your response as:
```
## 1. Current State Map
### Backend (working / dead / half-implemented)
### Frontend (working / dead / half-implemented)

## 2. Contract Audit (feature-by-feature trace)

## 3. What's Broken (with file:line references)

## 4. Complexity Ratings

## 5. Non-Chat Smoke Test

## 6. Recommendations (prioritized)
```

Be specific. File paths and line numbers. No vague "this could be improved" — tell me exactly what's wrong and where.
