# Unified Chat Key Design Decisions

Date: 2026-02-17
Status: Recommended decisions for implementation

## Decision 1: Data Model

Question: Room-first vs session-first data model?

Current evidence:
- Active runtime is session-first: `backend/routers/chat.py:192`, `backend/routers/sessions.py:16`.
- Room schema/repositories already exist: `backend/db/connection.py:138`, `backend/db/repositories/room_repository.py:39`.
- Live DB currently has both model families.

### Options

1. Keep session-first, keep bolting group features onto `sessions/session_agents/messages`.
2. Move to room-first canonical model (`rooms/room_agents/room_messages`) with compatibility adapters.
3. Permanent dual-model hybrid with long-term dual writes.

### Recommendation

Choose option 2: **room-first canonical model with staged compatibility wrappers**.

Why:
- Room tables already encode group semantics naturally (`room_agents`, `sender_type/sender_id`).
- Session-first currently retains hard single-agent assumptions (`sessions.agent_id` filters).
- Permanent dual-model operation increases long-term migration and bug surface.

### Consequences

1. Need migration/backfill from sessions to rooms.
2. Keep `/api/chat` and `/api/sessions/*` as temporary facades until frontend cutover.

---

## Decision 2: Streaming Contract

Question: SSE multiplexing (single stream tagged by `agent_id`) vs separate stream per agent?

Current evidence:
- Current chat stream is single-agent SSE: `backend/routers/chat.py:434`.
- Historical room router had robust multiplex protocol: `8c5d8e1^:backend/routers/rooms.py:756`, `8c5d8e1^:backend/routers/rooms.py:1023`.

### Options

1. One SSE stream per room, all events tagged with `agent_id`.
2. One SSE stream per responding agent.
3. Poll-based fallback only.

### Recommendation

Choose option 1: **one multiplexed SSE stream per room**.

Why:
- Preserves message ordering under one connection.
- Simplifies frontend lifecycle, cancellation, and retry behavior.
- Already proven in prior room implementation.

### Consequences

1. Event schema must include `agent_id` (and usually `agent_name`) for `content`, `avatar`, `emotion`, `done` events.
2. Frontend parser becomes event-type + agent-tag driven.

---

## Decision 3: Agent Awareness in Prompt Context

Question: How should agents know about each other?

Current evidence:
- Session path already injects participants system context and prefixes assistant history with `[Name]`: `backend/routers/chat.py:77`, `backend/routers/chat.py:187`.
- Legacy room helper also used prefixed speaker formatting: `backend/services/room_chat.py:155`.

### Options

1. System prompt injection only.
2. History prefixing only.
3. Combined approach: lightweight participants system context + speaker-attributed history + per-turn metadata.

### Recommendation

Choose option 3: **combined approach**.

Why:
- System context is good for global rules, but not sufficient for exact turn attribution.
- Prefixing provides explicit speaker identity in transcript.
- Combined method is already partly used and minimizes behavioral regressions.

### Consequences

1. Keep prompts short to control token growth.
2. Standardize one history formatting function for both DM and group rooms.

---

## Decision 4: Group Targeting Behavior

Question: How should "target agent" work in a group?

Current evidence:
- Existing helper has mention + fallback logic (`always`, mention parsing): `backend/services/room_chat.py:51`, `backend/services/room_chat.py:86`.
- Current active session chat ignores multi-target selection and uses one header-selected agent.

### Options

1. All agents always respond.
2. Mention-only response.
3. Policy ladder:
- explicit UI targets > @mentions > room response policy fallback.

### Recommendation

Choose option 3: **policy ladder**.

Why:
- Gives user explicit control without requiring mention syntax every turn.
- Avoids uncontrolled multi-agent spam.
- Reuses proven mention/policy patterns from prior room logic.

### Consequences

1. Need deterministic responder selection order for stable UX/tests.
2. Need UI affordance showing who will respond before send.

---

## Decision 5: Frontend State Shape

Question: One store per room vs one global store with room partitions?

Current evidence:
- Current global stores exist (`useAppStore`, `useChatStore`, `useUserStore`) and are tightly integrated.
- Current mismatch between `selectedAgents` and request `currentAgent` causes drift.

### Options

1. One global store with normalized room partitions (messages/status/avatar by `roomId`).
2. One isolated store/provider per room view.
3. Hybrid global + local ephemeral state.

### Recommendation

Choose option 1: **global store with room-partitioned slices**.

Why:
- Fits current app architecture and avoids deep provider refactor.
- Supports fast route switching and persistence strategy.
- Makes backward-compatibility wrappers easier during migration.

### Consequences

1. Must define canonical per-room selectors/actions.
2. Must remove dependence on `currentAgent` as transport selector.

---

## Decision 6: TTS in Group Chat

Question: Queue per agent, interrupt, or simultaneous playback?

Current evidence:
- Current pipeline is single audio element and single lip-sync target: `frontend/src/hooks/useChat.ts:41`, `frontend/src/hooks/useChat.ts:71`, `frontend/src/hooks/useChat.ts:130`.
- Group mode requires per-agent attribution and controllable overlap.

### Options

1. Simultaneous playback for all responders.
2. One global queue ignoring agent identity.
3. Per-agent queues with room-level arbiter (single active speaker at a time, interrupt rules).

### Recommendation

Choose option 3: **per-agent queues + room arbiter**.

Why:
- Preserves intelligibility and predictable lip-sync.
- Supports future policies (priority agent, user interrupt, skip).
- Avoids cacophony and rendering/audio contention.

### Consequences

1. Add `speaking_agent_id` and queue state to room chat store.
2. Define interrupt policy (user speech should preempt playback in hands-free mode).

---

## Final Decision Set

1. Canonical data model: room-first.
2. Streaming model: single multiplexed SSE per room.
3. Agent context model: combined system participants context + speaker-attributed history.
4. Targeting model: explicit targets, then mentions, then response-policy fallback.
5. Frontend state model: global store with room partitions.
6. Group TTS model: per-agent queue with room-level arbiter.
