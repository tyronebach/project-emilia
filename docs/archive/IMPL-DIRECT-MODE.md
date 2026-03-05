# Direct Mode Implementation (Repo-Aligned)

Status: Implemented (V1 + V2)
Last updated: 2026-02-12

## Goal
Add a per-agent chat backend toggle:

- `openclaw` (default): current behavior (`model: agent:{clawdbot_agent_id}` via gateway)
- `direct`: call an OpenAI-compatible API directly (`/chat/completions`) for that agent

Primary outcome: support persona-focused agents that should not depend on OpenClaw agent/tool wiring, while preserving current behavior for utility agents.

## Executive Assessment
This idea improves robustness and operational flexibility. V1 shipped a lean toggle + shared direct caller. V2 added the memory tool loop and in-chat mode toggle.

Robustness gains:
- Reduces coupling to OpenClaw agent prompt/tool behavior for selected agents.
- Enables provider portability (OpenAI-like backends) without changing frontend flow.
- Allows mixed-mode deployments per agent.
- V2 memory tools give direct-mode agents access to the same memory files as OpenClaw agents.

## Implementation Summary

### V1 (Lean Toggle)

- Per-agent mode fields added and persisted: `chat_mode`, `direct_model`, `direct_api_base`.
- New direct client service added: `backend/services/direct_llm.py`.
- 1:1 chat now branches by `chat_mode` in both non-stream and stream paths.
- Room chat now branches per responding agent in both non-stream and stream paths.
- Manage API and frontend admin UI now support configuring mode/model/base per agent.
- Rollback semantics on direct-call failure are preserved (orphaned user message cleanup).
- `SOUL.md` prepend support is available in direct mode when workspace file exists.

### V2 (Memory Tools + In-Chat Toggle)

- Bounded tool loop (`run_tool_loop`) with 3 required memory tools: `memory_search`, `memory_read`, `memory_write`.
- Memory bridge reads OpenClaw's SQLite memory index directly (hybrid vector+FTS search via `sqlite-vec`, FTS-only fallback).
- Gemini embedding API for query vectors (`gemini-embedding-001`, dynamic dimension handling).
- Consolidated shared direct-mode code: `normalize_messages_for_direct()` moved to `services/direct_llm.py`.
- Streaming direct path runs tool loop non-stream internally, emits final content as single SSE chunk.
- In-chat mode toggle pill in `Header.tsx` (amber "Direct" / blue "OC") with optimistic update pattern.
- New config settings: `OPENCLAW_MEMORY_DIR`, `DIRECT_TOOL_MAX_STEPS`, `GEMINI_API_KEY`.

### Implemented files

V1:
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

V2 (additional):
- `backend/services/direct_tool_runtime.py` (new — tool loop runtime)
- `backend/services/memory_bridge.py` (new — memory search/read/write)
- `backend/tests/test_direct_tool_runtime.py` (new — 11 tests)
- `backend/tests/test_memory_bridge.py` (new — 18 tests)
- `frontend/src/store/userStore.ts` (added `updateCurrentAgent`)
- `frontend/src/components/Header.tsx` (added mode toggle pill)

## Current Repo Reality Check

| Assumption from old draft | Current repo reality | Action |
|---|---|---|
| `chat_mode` already exists on agents | It does not exist in DB/schema/repo/frontend types | Add DB columns + schema/type support |
| Add SQL migration file under `backend/scripts/migrations` | This repo uses idempotent schema changes in `backend/db/connection.py` via `_add_column` | Implement migration in `connection.py` |
| Only `backend/routers/chat.py` needs branching | Room chat has independent OpenClaw calls in `backend/routers/rooms.py` (stream + non-stream) | Add mode routing in both chat and rooms |
| Memory tools can read OpenClaw sqlite memory index | V2 implemented: `memory_bridge.py` reads OpenClaw's SQLite index directly via `sqlite-vec` | Implemented in V2 |
| Internal services should switch to direct client now | `compaction` / `soul_simulator` use shared `services/llm_client.py` and are not part of agent chat toggle | Keep unchanged for v1 |
| Per-agent API keys in DB are fine | Storing provider keys in DB increases secret-management complexity | Use env/API-secret store for v1; optionally add per-agent secret refs later |
| Frontend/admin unaffected | `/manage` agent edit currently only supports display/voice/VRM/workspace | Extend backend schema + frontend types/UI |

## Scope

### V1 (Implemented)
1. Per-agent backend mode fields: `chat_mode`, `direct_model`, `direct_api_base`
2. Shared direct caller service (OpenAI-compatible non-stream + stream)
3. Mode-aware routing in `POST /api/chat` and `POST /api/rooms/{room_id}/chat`
4. Admin/manage support for configuring mode per agent

### V2 (Implemented)
1. Bounded tool loop with 3 memory tools (`memory_search`, `memory_read`, `memory_write`)
2. SQLite-based memory bridge reading OpenClaw's index (hybrid vector+FTS search)
3. Gemini embedding API for query vectors
4. Consolidated shared direct-mode code in `services/direct_llm.py`
5. In-chat mode toggle in Header.tsx

### Still Deferred
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

V2 additions:
- Tool-calling loop via `direct_tool_runtime.run_tool_loop()`.
- Embeddings/vector memory via `memory_bridge.py`.

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
Tests cover both V1 and V2 paths:
1. `POST /api/chat?stream=0` routes to direct path when `chat_mode=direct`.
2. `POST /api/chat?stream=1` routes to direct stream path (V2: via `run_tool_loop`).
3. Rollback cleanup deletes orphaned user message on direct call failure.
4. Room non-stream chat supports direct-mode agents (V2: via `run_tool_loop`).
5. Room streaming chat supports direct-mode agents.
6. Manage agent update persists and returns the new fields.
7. Tool loop: no-tool passthrough, single/chained tool calls, max-step termination, malformed args.
8. Memory bridge: path validation, file read/write, hybrid search merge, FTS fallback.

```bash
backend/.venv/bin/python -m pytest -q backend/tests
```

Result: `247 passed, 1 skipped`.

### Frontend

```bash
cd frontend && npx vitest run && npm run build
```

Result: 126 tests passed, build succeeded.

## Operational Notes Learned

- The direct toggle introduces moderate, targeted complexity and materially improves robustness by reducing hard dependency on OpenClaw routing for all agents.
- V2 adds tool-calling and vector-memory coupling in a clean, bounded way: tool loop is isolated in `direct_tool_runtime.py`, memory bridge is self-contained in `memory_bridge.py`.
- Streaming + tool loop solved by running tool steps non-stream internally, emitting final content as single SSE chunk.
- Shared code consolidated in `services/direct_llm.py` prevents duplication between `chat.py` and `rooms.py`.

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
- V1 lean toggle: net positive, minimal complexity.
- V2 memory tools: adds bounded complexity (tool loop + memory bridge), but keeps it isolated in two new service files. No changes to existing OpenClaw paths.

## V2 Implementation Reference

V2 implementation checklist (all items completed):

- `docs/planning/archive/P010-direct-mode-v2-checklist.md`

Key V2 service files:
- `backend/services/direct_tool_runtime.py` — Bounded tool loop (`run_tool_loop`) with `MEMORY_TOOLS` schema
- `backend/services/memory_bridge.py` — SQLite memory reader (hybrid vector+FTS search, file read/write)
- `backend/services/direct_llm.py` — Shared `normalize_messages_for_direct()` + `DirectLLMClient` with `tools` param
