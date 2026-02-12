# P010: Direct Mode V2 - Memory Tools + In-Chat Toggle

**Status:** Planning (owner constraints locked)
**Created:** 2026-02-12
**Updated:** 2026-02-12

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

## Target Architecture

### 1) Direct chat runtime remains primary

- `chat_mode=direct` uses direct OpenAI-compatible completion path for assistant generation.
- Tool calls are handled by a webapp-side tool executor loop.
- Memory tools read OpenClaw's SQLite index directly.

### 2) Memory bridge (SQLite-based)

- Add a dedicated service that:
  - Opens the SQLite database read-only
  - Loads sqlite-vec extension for vector search
  - Calls Gemini embedding API for query vectors
  - Implements hybrid search (vector + FTS)
- The bridge exposes typed methods:
  - `search(agent_claw_id, query, limit, min_score)` → list of snippets
  - `read(path)` → file content (direct file read, not from index)
  - `write(path, content, mode)` → writes to workspace file (triggers OpenClaw re-index)

### 3) No fallback policy

- Direct mode must never route assistant generation to OpenClaw chat completions.
- Errors stay explicit (`503`/SSE `error`), with existing rollback behavior preserved.

## File-Level Implementation Checklist

## A. Backend Foundation

- [ ] Add `backend/services/direct_tool_runtime.py`.
- [ ] Define tool schemas (`memory_search`, `memory_read`, `memory_write`) in OpenAI-compatible `tools` format.
- [ ] Implement a bounded tool loop (`MAX_DIRECT_TOOL_STEPS`, default 6-8).
- [ ] Ensure loop appends tool call + tool result messages correctly before continuing completion.
- [ ] Return final assistant content and usage in the same shape expected by existing router parsers.

## B. Memory Bridge (SQLite-based)

- [ ] Add `backend/services/memory_bridge.py`.
- [ ] Add dependency: `sqlite-vec` Python bindings (or use ctypes to load `.so` directly).
- [ ] Implement database connection:
  - [ ] Path: `~/.openclaw/memory/<agent_claw_id>.sqlite`
  - [ ] Open read-only (`?mode=ro`)
  - [ ] Load sqlite-vec extension (path from OpenClaw: `node_modules/sqlite-vec-linux-x64/vec0.so`)
- [ ] Implement `search(agent_claw_id, query, limit, min_score)`:
  - [ ] Call Gemini embedding API with `RETRIEVAL_QUERY` task type
  - [ ] Run vector search on `chunks_vec` with cosine distance
  - [ ] Run FTS search on `chunks_fts` with BM25
  - [ ] Merge results with hybrid scoring
  - [ ] Return `[{ path, start_line, end_line, snippet, score, source }]`
- [ ] Implement `read(workspace_path, file_path)`:
  - [ ] Direct file read from `<workspace>/MEMORY.md` or `<workspace>/memory/*.md`
  - [ ] Validate path is within allowed patterns
  - [ ] Return file content (truncated to max chars if needed)
- [ ] Implement `write(workspace_path, file_path, content, mode)`:
  - [ ] Validate path is within allowed patterns (`MEMORY.md`, `memory/*.md`)
  - [ ] Write/append to file
  - [ ] OpenClaw will auto-reindex on next sync cycle
- [ ] Add timeout and size guards.

## C. Gemini Embedding Client

- [ ] Add `backend/services/gemini_embeddings.py`.
- [ ] Implement `embed_query(text: str) -> list[float]`:
  - [ ] POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`
  - [ ] Use `GEMINI_API_KEY` from env (same key OpenClaw uses)
  - [ ] Return embedding values array
- [ ] Add caching layer (optional, check `embedding_cache` table first).
- [ ] Add timeout handling.

## D. Config and Secrets (`.env` only)

- [ ] Extend `backend/config.py` with V2 runtime knobs (non-secret):
  - [ ] `DIRECT_TOOL_MAX_STEPS` (default 8)
  - [ ] `DIRECT_TOOL_TIMEOUT_S` (default 60)
  - [ ] `DIRECT_TOOL_MAX_OUTPUT_CHARS` (default 4000)
  - [ ] `MEMORY_SEARCH_MAX_RESULTS` (default 5)
  - [ ] `MEMORY_SEARCH_MIN_SCORE` (default 0.3)
  - [ ] `MEMORY_SNIPPET_MAX_CHARS` (default 700)
  - [ ] `OPENCLAW_MEMORY_DIR` (default `~/.openclaw/memory`)
  - [ ] `SQLITE_VEC_PATH` (path to vec0.so, auto-detect from OpenClaw node_modules)
- [ ] Keep secrets env-only:
  - [ ] `OPENAI_API_KEY`
  - [ ] `GEMINI_API_KEY` (for Gemini embeddings)
- [ ] Do not add any secret columns to `agents` table.

## E. Chat Router Integration (1:1)

- [ ] Update direct path in `backend/routers/chat.py` to call `direct_tool_runtime` instead of one-shot direct completion.
- [ ] Preserve existing behavior extraction (`extract_avatar_commands`) and message persistence.
- [ ] Preserve rollback on failure (delete orphaned user message).
- [ ] Preserve stream mode behavior with tool loop support for SSE path.
- [ ] Enforce explicit no-fallback: no branch from `direct` -> OpenClaw completion.

## F. Rooms Router Integration

- [ ] Update direct path in `backend/routers/rooms.py` to use shared direct tool runtime.
- [ ] Support per-agent mixed modes within the same room.
- [ ] Keep room SSE event contract unchanged (`agent_chunk`, `agent_done`, `agent_error`).
- [ ] Enforce no-fallback semantics for direct-mode room agents.

## G. Frontend Chat Header Toggle (`/chat/:sessionId`)

- [ ] Update `frontend/src/components/Header.tsx` to include a chat mode toggle control.
- [ ] Add update helper in `frontend/src/utils/api.ts` for agent mode update (or reuse existing manage endpoint cleanly).
- [ ] Add store helper in `frontend/src/store/userStore.ts` to update current agent fields in place.
- [ ] Wire toggle to `PUT /api/manage/agents/{agent_id}` with payload `{ chat_mode }`.
- [ ] Add pending state + disabled UI while request in flight.
- [ ] On success, update local agent state immediately.
- [ ] On failure, revert UI state and surface error via app error channel.

## H. Optional but Recommended Cleanup During V2

- [ ] Consolidate duplicated direct-path logic between `chat.py` and `rooms.py` into shared helpers.
- [ ] Add a compact telemetry log tag for `chat_mode` and tool usage counts.

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

## Test Checklist

### Backend

- [ ] Unit tests for direct tool runtime:
  - [ ] single tool call
  - [ ] chained tool calls
  - [ ] max-step termination
  - [ ] malformed tool args
- [ ] Unit tests for memory bridge:
  - [ ] search with mocked embedding + sqlite
  - [ ] read file success/failure
  - [ ] write file success/failure
  - [ ] path validation rejects bad paths
- [ ] Unit tests for Gemini embedding client:
  - [ ] successful embedding call
  - [ ] API error handling
  - [ ] timeout handling
- [ ] Integration tests in `backend/tests/test_api.py`:
  - [ ] direct non-stream with tool call
  - [ ] direct stream with tool call
  - [ ] no-fallback assertion when direct call fails
  - [ ] rollback still deletes orphaned user message on failure
- [ ] Integration tests in `backend/tests/test_rooms.py`:
  - [ ] direct room non-stream tool call
  - [ ] direct room stream tool call
  - [ ] mixed-mode room behavior remains correct

### Frontend

- [ ] Add tests for chat-header mode toggle component behavior:
  - [ ] initial render from `currentAgent.chat_mode`
  - [ ] sends update request on toggle
  - [ ] disables during pending request
  - [ ] reverts and shows error on failure
- [ ] Keep existing frontend suites green.

## Validation Commands

```bash
backend/.venv/bin/python -m pytest -q backend/tests
cd frontend && npm test && npm run lint && npm run build
cd .. && ./scripts/check-all.sh
```

## Acceptance Criteria (Definition of Done)

1. Direct-mode agents can complete chats using required memory tools (`memory_search`, `memory_read`, `memory_write`).
2. Memory search reads OpenClaw's SQLite index directly with hybrid vector+FTS scoring.
3. No direct->openclaw chat fallback occurs when `chat_mode=direct`.
4. `/user/:userId/chat/:sessionId` top nav exposes mode toggle and persists changes.
5. Secrets are environment-only; DB schema does not store secret material.
6. Backend and frontend test suites pass, including new V2 coverage.

## Rollout Plan

- Implement all checklist items in one V2 branch.
- Run full validation suite.
- Merge and deploy immediately after tests pass (single trusted household app).

## Dependencies

- `sqlite-vec` Python bindings or direct `.so` loading
- Gemini API key (shared with OpenClaw, already in env)
- OpenClaw memory index must exist (`openclaw memory index --agent <id>` if needed)
