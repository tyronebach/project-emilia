# P010: Direct Mode V2 - Memory Tools + In-Chat Toggle

**Status:** Implemented
**Created:** 2026-02-12
**Updated:** 2026-02-12 (implemented)

## Goal

Ship Direct Mode V2 with mandatory memory tools and chat-level mode control while keeping the system stable and predictable.

## Locked Decisions (Do Not Reopen)

1. `memory_search`, `memory_read`, and `memory_write` are required in V2 (not optional).
2. Memory tooling reads OpenClaw's SQLite index directly (no HTTP API exists; we share the index, not the runtime).
3. Secrets live in `.env` only (no DB-stored secrets).
4. If an agent is `chat_mode=direct`, do not fallback to OpenClaw chat completions.
5. Rollout is immediate after validation (no canary/gate workflow needed).
6. Add a `Direct/OpenClaw` mode toggle in the main chat view (`/user/:userId/chat/:sessionId`) top nav.

## OpenClaw Memory Architecture (Reference)

OpenClaw does not expose memory as an HTTP API. Memory tools are internal to agent sessions.

**The approach:** Read OpenClaw's SQLite memory index directly and use the same embedding provider.

### Storage Location

```
~/.openclaw/memory/<agent_id>.sqlite
```

> **ID mapping note:** This `<agent_id>` is the OpenClaw agent ID, which corresponds
> to the `clawdbot_agent_id` column in our `agents` table, NOT the `id` column.
> Verify with: `ls ~/.openclaw/memory/` and match filenames to agent records.

### Database Schema

```sql
-- Indexed files
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);

-- Chunked text with embeddings
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,           -- e.g. "gemini-embedding-001"
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,       -- JSON array of floats
  updated_at INTEGER NOT NULL
);

-- FTS5 full-text search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  source UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);

-- sqlite-vec virtual table for vector similarity
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[768]           -- dimensions vary by model
);

-- Embedding cache (optional optimization)
CREATE TABLE embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, provider_key, hash)
);
```

### Search Algorithm

OpenClaw uses hybrid search (vector + FTS):

1. **Generate query embedding** via Gemini API:
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent
   {
     "content": { "parts": [{ "text": "<query>" }] },
     "taskType": "RETRIEVAL_QUERY"
   }
   ```

2. **Vector search** (cosine distance):
   ```sql
   SELECT c.id, c.path, c.start_line, c.end_line, c.text, c.source,
          vec_distance_cosine(v.embedding, ?) AS dist
     FROM chunks_vec v
     JOIN chunks c ON c.id = v.id
    WHERE c.model = ?
    ORDER BY dist ASC
    LIMIT ?
   ```
   - Pass embedding as `Buffer.from(new Float32Array(embedding).buffer)`
   - Score = `1 - dist`

3. **FTS search** (BM25):
   ```sql
   SELECT id, path, source, start_line, end_line, text,
          bm25(chunks_fts) AS rank
     FROM chunks_fts
    WHERE chunks_fts MATCH ? AND model = ?
    ORDER BY rank ASC
    LIMIT ?
   ```
   - FTS query: tokenize input, wrap each in quotes, join with AND
   - Score = `1 / (1 + max(0, rank))`

4. **Hybrid merge**:
   ```python
   final_score = (vector_weight * vector_score) + (text_weight * text_score)
   ```
   - Default weights: vector=0.7, text=0.3
   - Candidate multiplier: fetch N * multiplier candidates, merge, return top N

### Default Config Values

| Setting | Default |
|---------|---------|
| `maxResults` | 5 |
| `minScore` | 0.3 |
| `hybrid.enabled` | true |
| `hybrid.vectorWeight` | 0.7 |
| `hybrid.textWeight` | 0.3 |
| `hybrid.candidateMultiplier` | 3 |
| `snippetMaxChars` | 700 |

## Scope

### In Scope

- Direct-mode tool loop with required tools:
  - `memory_search`
  - `memory_read`
  - `memory_write`
- SQLite-based memory bridge (reads OpenClaw's index directly).
- Gemini embedding API calls for query vectors.
- Direct mode behavior in both 1:1 chat and rooms.
- Chat-header mode toggle in live chat page.
- Test coverage for tool loop, no-fallback behavior, and UI toggle behavior.

### Out of Scope

- Per-agent secret storage in DB.
- Fallback mode switching when direct fails.
- Progressive rollout controls/canary gating.
- Writing to the index (we read-only; OpenClaw handles indexing).

---

## Code Review Findings & Architectural Decisions

### Issue 1: Streaming + Tool Loop Complexity

**Problem:** The tool loop needs to handle intermediate LLM calls that return tool_calls
instead of content. During streaming, tool call arguments arrive as deltas that must be
accumulated before execution. Streaming tool call deltas to the client makes no sense.

**Decision: Non-stream internally, stream only the final completion.**
- The tool loop always runs `chat_completion()` (non-stream) for intermediate steps.
- When the LLM returns content (no more tool calls), that's the final response.
- For SSE callers: if the final response is ready (no more tools), we can optionally
  re-call with stream=True for the last step, OR just emit the full content as a single
  chunk. Start with single-chunk emission (simpler), optimize to streaming final step later.
- This means slight latency before first visible chunk (tool calls happen first), but
  keeps the implementation clean and testable.

### Issue 2: Duplicated Direct-Mode Code (MUST FIX FIRST)

**Problem:** The following code is duplicated between `chat.py` and `rooms.py`:
- `_normalize_messages_for_direct()` — identical function in both files
- Direct mode branching logic (non-stream and stream paths)
- Stream chunk parsing loops

Adding a tool loop to both files without consolidation doubles the maintenance surface.

**Decision: Consolidation is a prerequisite (Section A), not optional cleanup.**
Move shared direct-mode logic into `services/direct_llm.py` which already exists.

### Issue 3: sqlite-vec Loading Strategy

**Problem:** The original plan loads `vec0.so` from OpenClaw's `node_modules/` path.
This is fragile — depends on OpenClaw's install location, Node.js platform builds,
and `sqlite3.enable_load_extension()` being available (disabled by default in many
Python builds for security).

**Decision: Use `pip install sqlite-vec`.**
The `sqlite-vec` Python package bundles the extension and provides `sqlite_vec.load(conn)`.
No path detection, no ctypes, no Node.js dependency. Falls back to FTS-only if the
package isn't installed or extension fails to load.

### Issue 4: DirectLLMClient Missing `tools` Support

**Problem:** `DirectLLMClient.chat_completion()` and `stream_chat_completion()` don't
accept a `tools` parameter. The tool loop needs to pass tool schemas to the LLM.

**Decision:** Add `tools` parameter to `chat_completion()`. The tool runtime handles
the loop; only `chat_completion()` needs the parameter (streaming is only for the final
content-only call).

### Issue 5: Message Normalization Rejects Tool Messages

**Problem:** `_normalize_messages_for_direct()` filters to `role in {system, user,
assistant}` with `isinstance(content, str)`. Tool loop messages have:
- `role: "assistant"` with `tool_calls` list (not string content)
- `role: "tool"` with `tool_call_id` field

**Decision:** The tool runtime manages its own messages array internally. It starts from
the normalized messages but appends tool-loop messages without re-normalizing. The
existing `_normalize_messages_for_direct()` runs once at the start, then the runtime
owns the array.

### Issue 6: Three Service Files → Two

**Problem:** `gemini_embeddings.py` is only called from `memory_bridge.py`. The repo
pattern is self-contained service modules (see: compaction.py, elevenlabs.py). A
single-function module is unnecessary.

**Decision:** Embed the Gemini embedding call as a private async function inside
`memory_bridge.py`. Two new files total: `direct_tool_runtime.py` + `memory_bridge.py`.

### Issue 7: Config Bloat

**Problem:** 8 new env vars is excessive. Most are search-tuning constants that will
rarely change.

**Decision:** Only env vars for things that vary between deployments:
- `OPENCLAW_MEMORY_DIR` (path differs per machine)
- `GEMINI_API_KEY` (secret)
- `DIRECT_TOOL_MAX_STEPS` (safety knob)

Everything else becomes module-level constants in the service files (matching the
pattern used by `MAX_SOUL_MD_CHARS` in `direct_llm.py`). They can be promoted to
env vars later if needed.

### Issue 8: Agent ID Mapping

**Problem:** OpenClaw's SQLite path uses `<agent_id>` but we have two IDs:
- `agents.id` (our internal ID, e.g., "emilia")
- `agents.clawdbot_agent_id` (OpenClaw agent ID, e.g., "emilia-claw")

**Decision:** Use `clawdbot_agent_id` for the SQLite path since it's the OpenClaw
identifier. The memory bridge takes this ID explicitly — callers resolve it from the
agent record. Verify by checking `ls ~/.openclaw/memory/` against known agent IDs
during development.

### Issue 9: Frontend Toggle Access Control

**Problem:** The toggle calls `PUT /api/manage/agents/{agent_id}` which only requires
`verify_token` — no user-level ACL. Any authenticated user can change any agent's mode.

**Decision:** Acceptable for household app. Note in code comment. If multi-user access
control is needed later, add `UserRepository.can_access_agent()` check to the admin
endpoint (same pattern used in chat routes).

---

## Target Architecture

### 1) Direct chat runtime with tool loop

- `chat_mode=direct` uses direct OpenAI-compatible completion path for assistant generation.
- Tool calls are handled by `direct_tool_runtime.run_tool_loop()` in a bounded loop.
- Memory tools read/write via `memory_bridge.py`.
- The runtime returns a result dict in the same shape as `DirectLLMClient.chat_completion()`,
  so existing response parsing (`parse_chat_completion`) works unchanged.

### 2) Memory bridge (SQLite-based)

- Single service module (`memory_bridge.py`) that:
  - Opens OpenClaw's SQLite database read-only
  - Loads sqlite-vec extension via `sqlite_vec.load(conn)`
  - Calls Gemini embedding API for query vectors (private helper)
  - Implements hybrid search (vector + FTS), falls back to FTS-only on vector failure
- Exposes three functions:
  - `search(claw_agent_id, query, limit, min_score)` → list of snippets
  - `read(workspace, path)` → file content
  - `write(workspace, path, content, mode)` → write/append file

### 3) No fallback policy

- Direct mode must never route assistant generation to OpenClaw chat completions.
- Errors stay explicit (`503`/SSE `error`), with existing rollback behavior preserved.

---

## File-Level Implementation Checklist

## A. Prerequisite: Consolidate Shared Direct-Mode Code

This MUST happen before adding tool loop logic to avoid doubling duplication.

- [x] Move `_normalize_messages_for_direct()` from `chat.py` into `services/direct_llm.py`.
- [x] Remove the duplicate copy from `rooms.py`, import from `direct_llm`.
- [x] Extract shared stream-chunk-parsing into a helper (or leave inline if the tool
      runtime replaces the direct path entirely — evaluate during implementation).
- [x] Verify existing direct-mode tests still pass after consolidation.

## B. Extend DirectLLMClient

- [x] Add `tools: list[dict] | None = None` parameter to `chat_completion()`.
- [x] When `tools` is provided, include it in the API payload.
- [x] No changes needed to `stream_chat_completion()` (final content-only call
      can still use the existing streaming path).

## C. Tool Runtime (`backend/services/direct_tool_runtime.py`)

- [x] Define `MEMORY_TOOLS` list (OpenAI-compatible tool schemas) as module constant.
- [x] Implement `run_tool_loop(client, model, messages, workspace, claw_agent_id, ...)`:
  - [x] Call `client.chat_completion(model=..., messages=..., tools=MEMORY_TOOLS)`.
  - [x] Check response for `tool_calls` in assistant message.
  - [x] If no tool calls → return result as-is (content response).
  - [x] If tool calls → execute each via `_execute_tool()`, append assistant + tool
        messages, re-call. Bounded by `MAX_TOOL_STEPS` (default 6).
  - [x] On max-step → append a system message telling the LLM to respond without tools,
        do one final call without `tools` param.
- [x] Implement `_execute_tool(name, arguments, workspace, claw_agent_id)`:
  - [x] Route to `memory_bridge.search/read/write` based on tool name.
  - [x] Wrap in try/except, return error string on failure (don't crash the loop).
  - [x] Truncate tool output to `MAX_TOOL_OUTPUT_CHARS` (4000).
- [x] Return final result in same dict shape as `DirectLLMClient.chat_completion()`
      so `parse_chat_completion()` works unchanged.
- [x] Add `tool_calls_count` to returned metadata for logging.

## D. Memory Bridge (`backend/services/memory_bridge.py`)

- [x] Add `sqlite-vec` to requirements: `pip install sqlite-vec`.
- [x] Private helper `_get_memory_db(claw_agent_id)`:
  - [x] Path: `OPENCLAW_MEMORY_DIR / f"{claw_agent_id}.sqlite"`
  - [x] Open read-only (`?mode=ro`)
  - [x] `sqlite_vec.load(conn)` (catch + log on failure)
  - [x] Return connection (caller must close)
- [x] Private helper `_embed_query(text) -> list[float]`:
  - [x] POST to Gemini embedding API with `RETRIEVAL_QUERY` task type
  - [x] Use `GEMINI_API_KEY` from env
  - [x] Timeout: 10s
  - [x] Return embedding values array
- [x] `search(claw_agent_id, query, limit=5, min_score=0.3)`:
  - [x] Try hybrid search (vector + FTS):
    - [x] Call `_embed_query(query)` for vector search
    - [x] Run vector search on `chunks_vec` with cosine distance
    - [x] Run FTS search on `chunks_fts` with BM25
    - [x] Merge results with hybrid scoring (vector=0.7, text=0.3)
  - [x] On vector failure (no extension, embedding API error): fall back to FTS-only.
  - [x] Return `[{ path, start_line, end_line, snippet, score, source }]`
  - [x] Handle missing DB gracefully (return empty list + log warning).
- [x] `read(workspace, path)`:
  - [x] Validate `path` matches `MEMORY.md` or `memory/*.md` (no traversal).
  - [x] Read file from `<workspace>/<path>`.
  - [x] Truncate to `SNIPPET_MAX_CHARS` (700).
  - [x] Return content string, or error string if file not found.
- [x] `write(workspace, path, content, mode="append")`:
  - [x] Validate `path` matches `MEMORY.md` or `memory/*.md`.
  - [x] Create `memory/` subdirectory if needed.
  - [x] Write or append to file.
  - [x] Return success confirmation string.
  - [x] OpenClaw auto-reindexes on next sync cycle.

Module-level constants (not env vars):
```python
MAX_SEARCH_RESULTS = 5
MIN_SEARCH_SCORE = 0.3
SNIPPET_MAX_CHARS = 700
VECTOR_WEIGHT = 0.7
TEXT_WEIGHT = 0.3
CANDIDATE_MULTIPLIER = 3
```

## E. Config (`.env` only)

- [x] Add to `backend/config.py`:
  - [x] `OPENCLAW_MEMORY_DIR` (default `~/.openclaw/memory`)
  - [x] `DIRECT_TOOL_MAX_STEPS` (default 6)
- [x] Keep secrets env-only:
  - [x] `OPENAI_API_KEY` (existing)
  - [x] `GEMINI_API_KEY` (new, for Gemini embeddings)
- [x] Do not add any secret columns to `agents` table.

## F. Chat Router Integration (1:1)

- [x] In non-stream direct path: replace `DirectLLMClient.chat_completion()` call with
      `direct_tool_runtime.run_tool_loop()`, passing `workspace` and `claw_agent_id`.
- [x] In stream direct path: call `run_tool_loop()` (non-stream) then emit the final
      content. If tool calls occurred, emit full content as single chunk + done event.
      If no tool calls occurred, optionally re-stream via `stream_chat_completion()`
      for progressive UX (evaluate complexity — single-chunk may be fine for V2).
- [x] Preserve existing behavior extraction (`extract_avatar_commands`) and message persistence.
- [x] Preserve rollback on failure (delete orphaned user message).
- [x] Enforce explicit no-fallback: no branch from `direct` -> OpenClaw completion.

## G. Rooms Router Integration

- [x] In `_call_llm_non_stream()`: replace `DirectLLMClient.chat_completion()` with
      `run_tool_loop()` when `chat_mode == "direct"`.
- [x] In `_stream_room_chat_sse()`: same approach as chat.py — run tool loop non-stream,
      emit final content.
- [x] Import `_normalize_messages_for_direct` from `services/direct_llm` (after Section A).
- [x] Keep room SSE event contract unchanged (`agent_start`, `agent_done`, `agent_error`).
- [x] Enforce no-fallback semantics for direct-mode room agents.

## H. Frontend Chat Header Toggle (`/chat/:sessionId`)

- [x] Add toggle button in `frontend/src/components/Header.tsx`:
  - [x] Show current mode indicator next to agent name (small pill/badge).
  - [x] On click: flip between "openclaw" and "direct".
  - [x] Follow existing TTS toggle pattern (optimistic update, revert on error).
- [x] Add `updateAgent(agentId, updates)` helper in `frontend/src/utils/api.ts`:
  - [x] Wraps `PUT /api/manage/agents/{agent_id}`.
  - [x] Reuse existing `fetchWithAuth` pattern.
- [x] Add `updateCurrentAgent(updates)` in `frontend/src/store/userStore.ts`:
  - [x] Merges partial updates into `currentAgent` in place.
  - [x] Persists via existing localStorage middleware.
- [x] Wire toggle:
  - [x] On click → set pending state → call `updateAgent()` → on success call
        `updateCurrentAgent({ chat_mode })` → clear pending.
  - [x] On failure → revert UI + log error.

---

## Tool Schemas (OpenAI-compatible)

```python
MEMORY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "memory_search",
            "description": "Semantically search the agent's memory files (MEMORY.md + memory/*.md). Use before answering questions about prior work, decisions, dates, people, preferences, or todos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query"
                    },
                    "maxResults": {
                        "type": "integer",
                        "description": "Maximum results to return (default 5)"
                    },
                    "minScore": {
                        "type": "number",
                        "description": "Minimum relevance score 0-1 (default 0.3)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_read",
            "description": "Read content from a memory file. Use after memory_search to get full context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path (MEMORY.md or memory/*.md)"
                    },
                    "from": {
                        "type": "integer",
                        "description": "Start line (1-indexed, optional)"
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of lines to read (optional)"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_write",
            "description": "Write or append to a memory file. Use for storing important information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path (MEMORY.md or memory/*.md)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["overwrite", "append"],
                        "description": "Write mode (default: append)"
                    }
                },
                "required": ["path", "content"]
            }
        }
    }
]
```

---

## Test Checklist

### Backend

- [x] Unit tests for direct tool runtime (`test_direct_tool_runtime.py`):
  - [x] No tool calls → returns content immediately
  - [x] Single tool call → executes and returns final content
  - [x] Chained tool calls (search → read) → correct message threading
  - [x] Max-step termination → forces final content response
  - [x] Malformed tool args → error message returned to LLM, loop continues
  - [x] Unknown tool name → error message returned to LLM
- [x] Unit tests for memory bridge (`test_memory_bridge.py`):
  - [x] Search with mocked embedding + sqlite (hybrid path)
  - [x] Search FTS-only fallback (when vector fails)
  - [x] Search with missing DB → empty results, no crash
  - [x] Read file success + truncation
  - [x] Read file not found → error string
  - [x] Write file (overwrite + append modes)
  - [x] Path validation rejects traversal (`../../../etc/passwd`)
  - [x] Path validation rejects non-memory paths (`src/main.py`)
- [x] Integration tests in `backend/tests/test_api.py`:
  - [x] Direct non-stream with tool call (mock tool runtime)
  - [x] Direct stream with tool call (content emission)
  - [x] No-fallback assertion when direct call fails
  - [x] Rollback still deletes orphaned user message on failure
- [x] Integration tests in `backend/tests/test_rooms.py`:
  - [x] Direct room non-stream tool call
  - [x] Direct room stream tool call
  - [x] Mixed-mode room behavior remains correct

### Frontend

- [x] Add tests for chat-header mode toggle component behavior:
  - [x] Initial render from `currentAgent.chat_mode`
  - [x] Sends update request on toggle
  - [x] Disables during pending request
  - [x] Reverts and shows error on failure
- [x] Keep existing frontend suites green.

---

## Validation Commands

```bash
backend/.venv/bin/python -m pytest -q backend/tests
cd frontend && npx vitest run && npm run build
```

## Implementation Order

Recommended sequence to minimize risk:

1. **Section A** — Consolidate shared code (pure refactor, no behavior change)
2. **Section B** — Extend DirectLLMClient with `tools` param (backward compatible)
3. **Section D** — Memory bridge (standalone, fully unit-testable in isolation)
4. **Section E** — Config additions (trivial)
5. **Section C** — Tool runtime (depends on B + D)
6. **Section F + G** — Router integration (depends on A + C)
7. **Section H** — Frontend toggle (independent of backend tool work)

Sections D and H can be developed in parallel with the rest.

## Acceptance Criteria (Definition of Done)

1. Direct-mode agents can complete chats using required memory tools (`memory_search`, `memory_read`, `memory_write`).
2. Memory search reads OpenClaw's SQLite index directly with hybrid vector+FTS scoring (FTS-only fallback if vector unavailable).
3. No direct→openclaw chat fallback occurs when `chat_mode=direct`.
4. `/user/:userId/chat/:sessionId` top nav exposes mode toggle and persists changes.
5. Secrets are environment-only; DB schema does not store secret material.
6. No duplicated direct-mode logic between `chat.py` and `rooms.py`.
7. Backend and frontend test suites pass, including new V2 coverage.

## Rollout Plan

- Implement all checklist items in one V2 branch.
- Run full validation suite.
- Merge and deploy immediately after tests pass (single trusted household app).

## Dependencies

- `sqlite-vec` Python package (`pip install sqlite-vec`)
- Gemini API key (shared with OpenClaw, already in env)
- OpenClaw memory index must exist (`openclaw memory index --agent <id>` if needed)
