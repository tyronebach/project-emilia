# P006: Soul Window - Relationship Visibility (Rewritten)

**Date:** 2026-02-11  
**Status:** Proposed (Ready for Implementation)  
**Scope:** Surface mood, relationship state, and personality to end users with minimal new complexity.

---

## 1. Product Intent

Make the agent's internal state visible to users without changing core emotion-engine behavior.

### Goals

1. Show current mood in chat UI, updated in real time.
2. Show user-agent relationship state in a user-facing bond modal.
3. Show agent personality from `SOUL.md` in a structured About modal.
4. Improve first-turn greeting quality using deterministic session facts.
5. Keep architecture simple: reuse existing DB/state where possible, no scheduler.

### Non-Goals (for this plan)

1. No proactive notifications.
2. No background jobs.
3. No full mood graph analytics dashboard.
4. No user profile editor for events/preferences in this phase.

---

## 2. Current Reality (Repo-Aligned)

### What already exists

1. Emotional state and relationship dimensions are persisted in `emotional_state`.
2. Mood context is already injected into LLM calls in chat flow.
3. SSE already emits `emotion` events (currently unstructured payload).
4. Designer V2 already has bond read endpoints and rich bond serialization.
5. Agent workspace access exists via `agents.workspace` + access checks.
6. Memory modal and modal patterns already exist in frontend.
7. New chat currently goes through `NewChatPage` -> `InitializingPage` with a hard-coded first message.

### Important alignment constraints

1. User-facing APIs should follow current auth/context model (`Authorization`, `X-User-Id`, `X-Agent-Id`), not public `user_id` path/query parameters.
2. Workspace source of truth is `agents.workspace` in DB.
3. Mood taxonomy should come from existing mood IDs and `moods` table metadata, not a second static map.
4. Avoid duplicating bond logic between Designer and user-facing routes.

---

## 3. Key Design Decisions

### D1. Add a dedicated user-facing router, reuse shared read-model logic

Add `backend/routers/soul_window.py` for user-facing endpoints, with strict access checks.

Create shared read-model helpers in a service module, e.g.:
- `backend/services/soul_window_service.py`

This service composes:
- mood snapshot
- bond snapshot (reusing existing bond serialization logic)
- about payload from `SOUL.md`

### D2. Keep file-backed logic out of `db/repositories`

File I/O modules should live under services/repositories for workspace files, not SQL repository layer.

Suggested:
- `backend/services/workspace_events.py` (events read/write + atomic writes)
- `backend/services/soul_parser.py` (SOUL parser)

### D3. Structured mood payload (no parsing `context_block`)

Do not parse natural-language emotion context in frontend.

Instead, emit structured data in SSE `emotion` event:
- dominant mood id
- secondary moods
- emoji
- description
- trust/intimacy snapshot

### D4. Greeting context is backend-gated and deterministic

Inject greeting facts only on first conversational turn of a session.

Facts only:
- time of day bucket
- days since last interaction
- optional upcoming events

No style decisions in backend.

### D5. Events file is supplemental, not canonical relationship storage

Relationship dimensions remain canonical in DB.

`events.json` is timeline metadata used for:
- milestones
- upcoming events

Write permissions in this phase:
- user/admin API writes only
- no direct agent-authored writes

---

## 4. API Contract (User-Facing)

All endpoints:
- require `Authorization: Bearer ...`
- require `X-User-Id`
- require `X-Agent-Id` unless agent in path
- enforce user-agent access check

### 4.1 Mood Snapshot

`GET /api/soul-window/mood`

Uses `X-User-Id` + `X-Agent-Id`.

Response:

```json
{
  "user_id": "thai",
  "agent_id": "emilia-thai",
  "dominant_mood": {
    "id": "supportive",
    "weight": 8.4,
    "emoji": "🤗",
    "description": "Caring, nurturing, encouraging"
  },
  "secondary_moods": [
    {"id": "whimsical", "weight": 3.1, "emoji": "🦋"},
    {"id": "zen", "weight": 2.6, "emoji": "🧘"}
  ],
  "valence": 0.42,
  "arousal": 0.11,
  "trust": 0.72,
  "intimacy": 0.48,
  "interaction_count": 342,
  "last_interaction": "2026-02-11T08:00:00+00:00"
}
```

### 4.2 Bond Snapshot

`GET /api/soul-window/bond`

Uses `X-User-Id` + `X-Agent-Id`.

Response:

```json
{
  "user_id": "thai",
  "agent_id": "emilia-thai",
  "agent_name": "Emilia",
  "relationship_type": "trusted_companion",
  "dimensions": {
    "trust": 0.72,
    "intimacy": 0.48,
    "familiarity": 0.81,
    "attachment": 0.58,
    "playfulness_safety": 0.66,
    "conflict_tolerance": 0.60
  },
  "labels": {
    "trust": "trusts you deeply",
    "intimacy": "comfortable sharing feelings",
    "familiarity": "knows you well"
  },
  "state": {
    "valence": 0.42,
    "arousal": 0.11,
    "dominant_moods": ["supportive", "whimsical", "zen"]
  },
  "stats": {
    "interaction_count": 342,
    "last_interaction": "2026-02-11T08:00:00+00:00",
    "first_interaction": "2026-01-15T10:00:00+00:00",
    "days_known": 27
  },
  "milestones": []
}
```

Notes:
- `first_interaction` = earliest message timestamp across all sessions for this user-agent pair.
- `relationship_type` is a deterministic heuristic inferred from relationship dimensions.
- `milestones` comes from events file if present.

### 4.3 About (SOUL)

`GET /api/soul-window/about`

Uses `X-User-Id` + `X-Agent-Id` and workspace resolution from agent record.

Response:

```json
{
  "agent_id": "emilia-thai",
  "display_name": "Emilia",
  "sections": {
    "identity": {
      "name": "Emilia",
      "creature": "Half-elf",
      "role": "Companion",
      "emoji": "💜"
    },
    "essence": ["..."],
    "personality": ["..."],
    "quirks": ["..."]
  },
  "raw_soul_md": null
}
```

`raw_soul_md` is optional and should default off.

### 4.4 Events (Phase 3)

`GET /api/soul-window/events`  
`POST /api/soul-window/events`

POST actions:
- `add_milestone`
- `add_event`
- `remove_event`

All actions are idempotent by event/milestone id.
Writes are user/admin API only in this phase.

---

## 5. SSE Contract Update

### Current

`emotion` event only includes:
- `triggers`
- `context_block`

### Target

Extend event payload:

```json
{
  "triggers": [["admiration", 0.71]],
  "context_block": "...",
  "snapshot": {
    "dominant_mood": {"id": "supportive", "emoji": "🤗", "weight": 8.4},
    "secondary_moods": ["whimsical", "zen"],
    "trust": 0.72,
    "intimacy": 0.48,
    "valence": 0.42,
    "arousal": 0.11
  }
}
```

Frontend should consume `snapshot` when present, never parse `context_block`.

---

## 6. Data Model and Storage

### 6.1 DB

No required schema changes for phase 1/2.

Uses existing:
- `emotional_state`
- `messages`
- `emotional_events_v2` (optional history source)

### 6.2 Workspace Files

### Location

`{agents.workspace}/user_data/{user_id}/events.json`

### Schema (v1)

```json
{
  "schema_version": 1,
  "user_id": "thai",
  "agent_id": "emilia-thai",
  "created_at": "2026-01-15T10:00:00+00:00",
  "updated_at": "2026-02-11T08:00:00+00:00",
  "milestones": [
    {
      "id": "first_conversation",
      "type": "first_conversation",
      "date": "2026-01-15",
      "note": null,
      "source": "system"
    }
  ],
  "upcoming_events": [
    {
      "id": "birthday-2026",
      "type": "birthday",
      "date": "2026-03-15",
      "note": "User birthday",
      "source": "user"
    }
  ]
}
```

### Write safety

1. Ensure parent directories exist.
2. Write to temp file.
3. Atomic rename.
4. Validate schema before commit.

---

## 7. Backend Implementation Plan

### 7.1 New/Updated modules

New:
- `backend/routers/soul_window.py`
- `backend/services/soul_window_service.py`
- `backend/services/soul_parser.py`
- `backend/services/workspace_events.py`

Modified:
- `backend/main.py` (register new router)
- `backend/routers/chat.py` (SSE snapshot + first-turn context injection)
- `backend/routers/designer_v2.py` (extract/reuse bond serializer from service if needed)

### 7.2 Chat greeting injection gate

Inject session context only when all are true:

1. `runtime_trigger == false`
2. Session has no prior user/assistant conversational messages
3. Current message is the first conversational turn

Add helper in chat flow:
- `_build_session_context_facts(user_id, agent_id, session_id) -> str`

Facts included:
- time bucket: morning/afternoon/evening/night
- days since `last_interaction` (if > 1 day)
- top 1-2 upcoming events in next 7 days
- all time computations in UTC

No tone instructions; facts only.

### 7.3 Labeling rules

Keep deterministic threshold-based labels for trust/intimacy/familiarity in service layer.

`relationship_type` heuristic (v1, deterministic):
1. `intimacy >= 0.75` and `trust >= 0.75` -> `intimate_companion`
2. `trust >= 0.65` and `familiarity >= 0.60` -> `trusted_companion`
3. `trust >= 0.45` -> `friend`
4. else -> `acquaintance`

---

## 8. Frontend Implementation Plan

### 8.1 State and API

1. Extend `EmotionDebug` type with optional `snapshot`.
2. Add `currentMood` to `chatStore` as structured state.
3. Update `useChat.ts` `onEmotion` handler to populate `currentMood` from `snapshot`.
4. Add `frontend/src/utils/soulWindowApi.ts` for user-facing endpoints.

### 8.2 Components

1. `MoodIndicator.tsx`
- top-right pill under header
- reads `currentMood` from store
- expands on click to show secondary moods + compact stats

2. `BondModal.tsx`
- fetches `/api/soul-window/bond`
- shows dimensions, labels, stats, milestones

3. `AboutModal.tsx`
- fetches `/api/soul-window/about`
- renders section cards

### 8.3 Placement

1. Add MoodIndicator to `App.tsx` near status overlays.
2. Add Bond/About triggers in `Header.tsx` and/or `Drawer.tsx`.
3. Reuse existing dialog style and behavior from `MemoryModal`.
4. Simplify `InitializingPage` bootstrap message so greeting personality comes from backend context injection.

---

## 9. Phase Plan

### Phase 0: Contract freeze (completed decisions)

1. `first_interaction`: earliest message timestamp across all sessions for user-agent.
2. Timezone: UTC for days-since and event windows.
3. `relationship_type`: include in API, inferred heuristically from dimensions.
4. Greeting ownership: backend-first; frontend init message simplified.
5. Events write permissions: user/admin API only.

### Phase 1: Mood visibility (fastest user value)

Backend:
- mood snapshot service + endpoint
- SSE `emotion.snapshot`

Frontend:
- chatStore `currentMood`
- MoodIndicator

Acceptance:
- Mood pill updates every assistant response without parsing free text.

### Phase 2: Bond + About

Backend:
- bond endpoint
- about endpoint + SOUL parser

Frontend:
- BondModal
- AboutModal

Acceptance:
- User can open bond/about from chat UI.

### Phase 3: Events + milestones

Backend:
- events file service
- events endpoints
- milestone auto-create hooks (idempotent)

Frontend:
- milestone timeline in BondModal

Acceptance:
- milestones persist and render consistently.

### Phase 4: Greeting context

Backend:
- first-turn context helper + injection gate

Frontend:
- replace theatrical hard-coded init greeting with minimal bootstrap message

Acceptance:
- first greeting reflects time/absence/events deterministically.

---

## 10. Testing Plan

### 10.1 Backend

1. `test_soul_window.py`
- mood endpoint payload shape
- bond endpoint labels and stats
- about endpoint parse + fallback

2. `test_workspace_events.py`
- file create/read/update/delete
- idempotent add_milestone
- atomic write resilience

3. `test_chat.py`
- first-turn context injected only when gate is true
- no context on non-first turn/runtime triggers
- SSE includes `emotion.snapshot`

### 10.2 Frontend

1. `MoodIndicator.test.tsx`
- renders snapshot
- expanded details

2. `BondModal.test.tsx`
- fetch + render dimensions/stats/milestones

3. `AboutModal.test.tsx`
- fetch + render sections + fallback

4. `useChat` stream test updates `currentMood` from SSE snapshot.

---

## 11. Risks and Mitigations

1. Risk: drift between designer-v2 bond model and user-facing bond model.
- Mitigation: shared service function for bond serialization.

2. Risk: parsing drift if frontend reads prose context text.
- Mitigation: structured SSE snapshot contract.

3. Risk: filesystem corruption for events file.
- Mitigation: schema validation + atomic writes.

4. Risk: duplicate greeting behavior due to `InitializingPage` synthetic message.
- Mitigation: explicit first-turn gate and aligned init flow.

5. Risk: inferred `relationship_type` feels imprecise at boundaries.
- Mitigation: keep deterministic mapping, expose raw dimensions, and treat type as UX hint only.

---

## 12. Definition of Done

1. Mood indicator visible and updated from structured SSE snapshot.
2. Bond modal available with deterministic labels/stats.
3. About modal available from parsed `SOUL.md` with fallback.
4. Greeting facts injected only on first conversational turn.
5. Events file supports idempotent milestone/event operations (if phase 3 included).
6. No regression to existing chat/emotion/room flows.
7. Tests added for critical paths above.

---

## 13. Decision Log

1. `first_interaction`: earliest message timestamp across all sessions for user-agent.
2. Timezone: UTC.
3. `relationship_type`: include as inferred heuristic from dimensions (not exact).
4. Greeting ownership: simplify frontend init; backend controls greeting context.
5. Events writes: user/admin API only in this phase.
