# Direct Mode Implementation (Repo-Aligned)

Status: Implemented (Lean V1)  
Last updated: 2026-02-12

## Goal
Add a per-agent chat backend toggle:

- `openclaw` (default): current behavior (`model: agent:{clawdbot_agent_id}` via gateway)
- `direct`: call an OpenAI-compatible API directly (`/chat/completions`) for that agent

Primary outcome: support persona-focused agents that should not depend on OpenClaw agent/tool wiring, while preserving current behavior for utility agents.

## Executive Assessment
This idea improves robustness and operational flexibility, but the previous draft introduces more complexity than needed for v1.

Robustness gains:
- Reduces coupling to OpenClaw agent prompt/tool behavior for selected agents.
- Enables provider portability (OpenAI-like backends) without changing frontend flow.
- Allows mixed-mode deployments per agent.

Complexity costs in previous draft:
- Adds a full custom tool loop + sqlite-vec memory search path not present in current repo.
- Proposes a migration style (standalone SQL file) that does not match this codebase.
- Only patches 1:1 chat path, but current room chat has separate LLM call paths.
- Moves internal services (simulator/judge/compactor) to direct mode unnecessarily for the core feature.

Recommendation: ship a lean v1 first (toggle + shared direct caller + 1:1 + rooms), then add optional memory tools later.

## Implementation Summary (Completed)

Lean V1 is now implemented in repo with the following delivered scope:

- Per-agent mode fields added and persisted: `chat_mode`, `direct_model`, `direct_api_base`.
- New direct client service added: `backend/services/direct_llm.py`.
- 1:1 chat now branches by `chat_mode` in both non-stream and stream paths.
- Room chat now branches per responding agent in both non-stream and stream paths.
- Manage API and frontend admin UI now support configuring mode/model/base per agent.
- Rollback semantics on direct-call failure are preserved (orphaned user message cleanup).
- `SOUL.md` prepend support is available in direct mode when workspace file exists.

Implemented files:

- `backend/config.py`
- `backend/db/connection.py`
- `backend/db/repositories/agents.py`
- `backend/schemas/requests.py`
- `backend/schemas/responses.py`
- `backend/routers/admin.py`
- `backend/routers/chat.py`
- `backend/routers/rooms.py`
- `backend/services/direct_llm.py`
- `frontend/src/utils/api.ts`
- `frontend/src/components/AdminPanel.tsx`
- `frontend/src/components/admin/AgentsTab.tsx`
- `backend/tests/test_api.py`
- `backend/tests/test_rooms.py`

## Current Repo Reality Check

| Assumption from old draft | Current repo reality | Action |
|---|---|---|
| `chat_mode` already exists on agents | It does not exist in DB/schema/repo/frontend types | Add DB columns + schema/type support |
| Add SQL migration file under `backend/scripts/migrations` | This repo uses idempotent schema changes in `backend/db/connection.py` via `_add_column` | Implement migration in `connection.py` |
| Only `backend/routers/chat.py` needs branching | Room chat has independent OpenClaw calls in `backend/routers/rooms.py` (stream + non-stream) | Add mode routing in both chat and rooms |
| Memory tools can read OpenClaw sqlite memory index | Runtime memory today is workspace files (`MEMORY.md`, `memory/*.md`); no sqlite-vec integration in app | Defer vector memory tools for v1 |
| Internal services should switch to direct client now | `compaction` / `soul_simulator` use shared `services/llm_client.py` and are not part of agent chat toggle | Keep unchanged for v1 |
| Per-agent API keys in DB are fine | Storing provider keys in DB increases secret-management complexity | Use env/API-secret store for v1; optionally add per-agent secret refs later |
| Frontend/admin unaffected | `/manage` agent edit currently only supports display/voice/VRM/workspace | Extend backend schema + frontend types/UI |

## V1 Scope (Implemented)

### Included
1. Per-agent backend mode fields:
- `chat_mode`: `openclaw | direct`
- `direct_model`: nullable override
- `direct_api_base`: nullable override

2. Shared direct caller service:
- OpenAI-compatible non-stream + stream support
- No tool-calling loop in v1

3. Mode-aware routing in:
- `POST /api/chat` (stream and non-stream)
- `POST /api/rooms/{room_id}/chat` (stream and non-stream, per responding agent)

4. Admin/manage support:
- Existing `PUT /api/manage/agents/{agent_id}` accepts new fields
- `GET /api/manage/agents` returns new fields
- Basic toggle/inputs in manage UI

### Explicitly Deferred
- Custom memory tool-calling loop (`memory_search/read/write`)
- sqlite-vec / OpenClaw memory index dependency
- Migrating compaction/simulator/judge to direct mode
- Per-agent raw API key storage

## Implementation (As Built)

### 1) Database (`backend/db/connection.py`)
Use idempotent columns in `init_db()`:

```python
_add_column(cur, "agents", "chat_mode", "TEXT DEFAULT 'openclaw'")
_add_column(cur, "agents", "direct_model", "TEXT")
_add_column(cur, "agents", "direct_api_base", "TEXT")
```

Optional hardening (recommended): normalize invalid values to `openclaw` during startup.

### 2) Repository + Schemas

#### `backend/db/repositories/agents.py`
Allow updates for new fields:

- `chat_mode`
- `direct_model`
- `direct_api_base`

#### `backend/schemas/requests.py` (`AgentUpdate`)
Add optional fields with validation:

- `chat_mode: Literal["openclaw", "direct"] | None`
- `direct_model: str | None`
- `direct_api_base: str | None`

#### `backend/schemas/responses.py` (`AgentResponse`)
Add returned fields:

- `chat_mode`
- `direct_model`
- `direct_api_base`

### 3) Config (`backend/config.py`)
Add direct-mode settings:

- `OPENAI_API_KEY` (required when direct mode is used)
- `OPENAI_API_BASE` (default `https://api.openai.com/v1`)
- `DIRECT_DEFAULT_MODEL` (default `openai-codex/gpt-5.1-codex-mini`)

Keep existing `CLAWDBOT_TOKEN` requirement for now because internal services still use OpenClaw.

### 4) New service: direct chat client
Create `backend/services/direct_llm.py`.

Responsibilities:
- Build OpenAI-compatible request payloads.
- Non-stream call returning a completion-like JSON payload.
- Stream call yielding chunks in the same shape routers already parse.
- Convert provider errors to actionable exceptions.

Non-goals for v1:
- Tool-calling loop.
- Embeddings/vector memory logic.

### 5) Router integration

#### `backend/routers/chat.py`
In both non-stream and SSE paths, branch by `agent.chat_mode`:

- `openclaw` -> existing logic unchanged
- `direct` -> call `DirectLLMClient` with:
  - `model = agent.direct_model or settings.direct_default_model`
  - `api_base = agent.direct_api_base or settings.openai_api_base`
  - `api_key = settings.openai_api_key`

Important:
- Reuse existing `_build_llm_messages(...)`; do not drop `system` messages.
- Preserve existing behavior parsing (`parse_chat_completion` / `extract_avatar_commands`).
- Preserve existing message persistence + rollback-on-LLM-failure semantics.

#### `backend/routers/rooms.py`
Apply the same per-agent mode routing for each responding room agent in:

- `_call_llm_non_stream(...)`
- `_stream_room_chat_sse(...)`

Rooms can be mixed mode per agent.

### 6) Frontend manage support

#### `frontend/src/utils/api.ts`
Extend `Agent` type and update payload handling for:

- `chat_mode`
- `direct_model`
- `direct_api_base`

#### `frontend/src/components/admin/AgentsTab.tsx` and `frontend/src/components/AdminPanel.tsx`
Add controls:

- Mode select: `OpenClaw` / `Direct`
- Direct model input
- Direct API base input

Use current save flow (`PUT /api/manage/agents/{id}`), no new endpoint required.

## Prompt Source in Direct Mode
Current OpenClaw mode relies on OpenClaw-managed agent prompting.

For direct mode v1, keep behavior deterministic:
1. Build message stack using existing app logic (summary/history/emotion/game context).
2. Optionally prepend `SOUL.md` as first system prompt if `workspace/SOUL.md` exists.

If `SOUL.md` is missing, proceed with existing message stack (no hard failure).

## Validation Results

### Backend
Added and passing tests cover:
1. `POST /api/chat?stream=0` routes to direct path when `chat_mode=direct`.
2. `POST /api/chat?stream=1` routes to direct stream path.
3. rollback cleanup deletes orphaned user message on direct call failure.
4. room non-stream chat supports direct-mode agents.
5. room streaming chat supports direct-mode agents.
6. manage agent update persists and returns the new fields.

Command run:

```bash
backend/.venv/bin/python -m pytest -q backend/tests
```

Result: `209 passed, 1 skipped`.

### Frontend
Frontend checks run:

```bash
cd frontend
npm test
npm run lint
npm run build
```

Result: tests/lint/build passed (within `./scripts/check-all.sh`).

### Full Stack Check

Command run:

```bash
./scripts/check-all.sh
```

Result: passed (backend tests + frontend tests/lint/build + game loader check).

## Operational Notes Learned

- The direct toggle introduces moderate, targeted complexity and materially improves robustness by reducing hard dependency on OpenClaw routing for all agents.
- V1 keeps complexity controlled by explicitly deferring tool-calling and vector-memory coupling.
- This architecture is V2-ready because routing is centralized around `chat_mode` and shared direct-client helpers.

## Risks and Mitigations

1. Direct provider response format variance
- Mitigation: normalize completion payload in `direct_llm.py` before router parsing.

2. Missing API key for direct mode
- Mitigation: fail fast with clear 503 detail when direct agent selected and key absent.

3. Behavioral mismatch between 1:1 and rooms
- Mitigation: implement mode branching in both routers in the same PR.

4. Secret sprawl
- Mitigation: keep provider key env-based in v1; avoid DB key storage.

## Complexity vs Robustness Verdict
- As a lean toggle-based implementation: net positive, more robust.
- As originally drafted (tool loop + vector memory + internal-service migration): high complexity for limited immediate gain.

Ship v1 lean, then evaluate v2 memory-tools based on production behavior.

## V2 Plan (Concrete Checklist)

V2 execution plan now lives in:

- `docs/planning/P010-direct-mode-v2-checklist.md`

That plan is the active source of truth for:

- mandatory memory tools in direct mode (`memory_search`, `memory_read`, `memory_write`)
- OpenClaw-backed memory system usage
- env-only secret handling
- explicit no-fallback behavior for direct mode
- live chat top-nav mode toggle in `/user/:userId/chat/:sessionId`
