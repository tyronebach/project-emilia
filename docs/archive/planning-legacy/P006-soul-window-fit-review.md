# P006 Soul Window Fit Review

Date: 2026-02-11
Reviewer: Codex
Source plan: `docs/planning/P006-soul-window.md`

## Executive Verdict

P006 is directionally strong and can fit this repo, but not as-is.

- Fit: **medium-high** (good product intent, several implementation mismatches)
- Required structural changes: **yes, moderate**
- Main risk: drift from current architecture conventions (identity model, mood taxonomy, workspace/file ownership)

If adjusted, this can stay simple, robust, and extendable.

## What Already Fits Well

1. Core data already exists for mood/bond:
- `emotional_state` has trust/intimacy/familiarity/interaction_count/last_interaction and mood weights (`backend/db/connection.py:254`, `backend/db/connection.py:333`).

2. Mood context already flows through chat:
- Emotion preprocessing and context injection already happen before LLM (`backend/routers/chat.py:537`, `backend/routers/chat.py:544`).

3. Frontend already receives emotion events and stores them:
- SSE `emotion` event is parsed in API layer (`frontend/src/utils/api.ts:763`) and stored in chat store (`frontend/src/hooks/useChat.ts:261`, `frontend/src/store/chatStore.ts:15`).

4. Bond read model already exists (designer-v2):
- Full bond payload builder exists (`backend/routers/designer_v2.py:218`) and endpoints already exist (`backend/routers/designer_v2.py:440`, `backend/routers/designer_v2.py:474`).

5. Existing modal patterns are reusable:
- `MemoryModal` provides the same UX pattern P006 proposes for Bond/About modals (`frontend/src/components/MemoryModal.tsx:12`).

## High-Risk Mismatches (Must Fix Before Implementation)

### 1) Identity and authorization model mismatch

Plan proposes endpoints with explicit `user_id` in query/path (`docs/planning/P006-soul-window.md:206`, `docs/planning/P006-soul-window.md:226`, `docs/planning/P006-soul-window.md:299`), but app conventions already use `X-User-Id` + access checks.

- Current protected patterns use dependency checks (`backend/dependencies.py:21`, `backend/dependencies.py:45`).
- Existing designer-v2 bond endpoints are token-only and not user-scoped (`backend/routers/designer_v2.py:32`, `backend/routers/designer_v2.py:440`).

Risk: cross-user data access and API inconsistency.

Recommendation:
- User-facing Soul Window endpoints should derive user from header dependencies.
- Avoid `user_id` in path/query for user-facing reads/writes.

### 2) Workspace assumptions are outdated in the plan

Plan says memory access is based on `CLAWDBOT_AGENTS_DIR` (`docs/planning/P006-soul-window.md:36`). Current code does not use that.

- Workspace is per-agent DB field (`backend/dependencies.py:58`).
- Memory router only exposes `MEMORY.md` and `memory/*.md` (`backend/routers/memory.py:18`, `backend/routers/memory.py:63`), not root `SOUL.md`.

Risk: implementation follows wrong path model and breaks in production.

Recommendation:
- Treat `agents.workspace` as canonical.
- Add explicit SOUL reader route/service instead of relying on memory route behavior.

### 3) Mood contract mismatch (taxonomy and payload)

Plan examples and emoji map use moods like `happy/playful/curious` (`docs/planning/P006-soul-window.md:212`, `docs/planning/P006-soul-window.md:635`).

Current emotional engine mood IDs are DB-driven moods like `supportive/whimsical/zen/...` with seeded emoji (`backend/db/seed.py:11`).

Also, plan suggests parsing mood from `emotion_debug.context_block` (`docs/planning/P006-soul-window.md:391`), but this is free text and brittle.

- Current SSE emotion payload only has `triggers` + `context_block` (`backend/routers/chat.py:775`, `frontend/src/utils/api.ts:681`).

Risk: fragile parsing and silent UI drift when prompt text changes.

Recommendation:
- Add explicit structured mood payload (dominant mood, secondaries, emoji, description, trust/intimacy snapshot).
- Use moods table as source of emoji/description, not a second static map.

### 4) Greeting flow conflict with existing new-session boot

Plan assumes backend "session start" context injection (`docs/planning/P006-soul-window.md:117`, `docs/planning/P006-soul-window.md:329`).

Current flow sends a fixed synthetic greeting from frontend initialization page:
- session created in new chat flow (`frontend/src/components/NewChatPage.tsx:54`)
- initialization sends hard-coded greeting (`frontend/src/components/InitializingPage.tsx:93`)

Risk: greeting logic splits across frontend and backend, causing duplicate or contradictory behavior.

Recommendation:
- Define one source of truth for "first-turn greeting context".
- Prefer backend gate (e.g., zero prior non-runtime messages) and keep frontend init message minimal/stable.

## Medium-Risk Vagueness That Can Cause Drift

1. `relationship_type` source is unspecified.
- Plan includes `relationship_type` in response (`docs/planning/P006-soul-window.md:234`) but no canonical source exists in current active schema.

2. `first_interaction` definition is unspecified.
- Could mean first emotional interaction, first message in any session, or first message in current session.

3. Milestone semantics are underspecified.
- "auto-detected" and "custom" are listed, but dedupe/idempotency rules are not defined (`docs/planning/P006-soul-window.md:166`, `docs/planning/P006-soul-window.md:320`).

4. Events storage ownership is unclear.
- Plan says "agent can add milestones" (`docs/planning/P006-soul-window.md:195`), but current runtime has no direct LLM filesystem write path.

5. Timezone/date behavior is undefined.
- Upcoming event windows and "days since" need explicit timezone rule.

6. Layering placement is inconsistent.
- Plan puts file-backed events in `db/repositories` (`docs/planning/P006-soul-window.md:565`), but existing `db/repositories` are SQL repos.

## Structural Changes Recommended

### A) Introduce a small shared read-model service

Create one backend service that composes mood + relationship snapshot from current sources.

Why:
- Avoid duplicate logic between designer-v2 and user-facing routes.
- Keep thresholds and labels in one place.

### B) Keep filesystem file logic out of DB repository layer

Use a workspace-oriented service/repository module for `events.json` and `SOUL.md` parsing.

Why:
- Preserves current architectural meaning of `db/repositories`.
- Keeps file I/O concerns isolated.

### C) Normalize API identity surface

For user-facing Soul Window endpoints:
- derive user from `X-User-Id`
- require `X-Agent-Id` or path `agent_id` with access check
- avoid public `user_id` parameters

### D) Add a structured emotion event contract

Extend SSE emotion event (or add follow-up read endpoint) so frontend never parses natural language context text.

## Suggested Plan Rewrite (Lean, Maintainable)

### Phase 0: Contract Freeze (required)
- Define canonical mood IDs and labels from moods table.
- Define first-interaction and milestone semantics.
- Define timezone rule (UTC default or user preference).

### Phase 1: Read APIs only (no writes yet)
- Add user-scoped mood snapshot endpoint.
- Add user-scoped bond snapshot endpoint (reuse existing bond builder logic).
- Add agent about endpoint reading/parsing `SOUL.md`.

### Phase 2: UI
- Mood indicator from structured payload.
- Bond modal via React Query.
- About modal via React Query.
- Reuse MemoryModal interaction pattern.

### Phase 3: Events file (optional after read path is stable)
- Add events read/write with schema version + atomic write + idempotent milestone append.
- Keep events as "supplemental timeline"; DB remains canonical for relationship dimensions.

### Phase 4: Greeting context
- Add explicit first-turn detection in backend chat path.
- Inject deterministic context facts only when gate condition is met.
- Align or simplify `InitializingPage` first user message so behavior is predictable.

## Final Answers to the Original Questions

1. Will the plan fit nicely?
- **Yes, with targeted refactoring.** Without it, there will be drift.

2. Do we need structural changes to keep it simple/robust/extendable/minimal maintenance?
- **Yes.** Main changes: identity model alignment, shared read model, and proper layer boundaries for workspace files.

3. Can the plan be better?
- **Yes.** Use existing designer-v2 bond logic and existing mood/emoji DB data instead of introducing parallel mappings/contracts.

4. Is there vagueness that could cause drift?
- **Yes.** Relationship type source, first interaction semantics, milestone idempotency, timezone behavior, and greeting trigger conditions need to be specified before implementation.
