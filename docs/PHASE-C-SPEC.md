# Phase C — Standalone Memory + CLI Test Harness

## Goal
Make the backend fully self-contained (no OpenClaw dependency at runtime) and
build a CLI that can drive the full chat/memory/rooms flow from a terminal.
Frontend is out of scope — ignore it entirely.

---

## Scope

### 1. Standalone Memory Engine
Replace `memory_bridge` (reads OpenClaw SQLite) with `services/memory/` implementation.

**Implement:**
- `services/memory/storage.py` — CRUD for `memory_documents` + `memory_chunks` (SQLite via existing `db/connection.py`)
- `services/memory/embedder.py` — embedder abstraction:
  - Default: Ollama `mxbai-embed-large` at `http://localhost:11434` (same as household)
  - Configurable via env: `EMILIA_EMBED_PROVIDER` (ollama|gemini), `EMILIA_EMBED_MODEL`, `EMILIA_EMBED_BASE_URL`
  - Alternative: Gemini `gemini-embedding-001` when `EMILIA_EMBED_PROVIDER=gemini`
  - No fallbacks — misconfigured embedder = startup error, not silent degradation
- `services/memory/indexer.py` — chunk documents, embed, upsert to storage
- `services/memory/search.py` — hybrid FTS + cosine similarity search (same interface as memory_bridge: `search(query, agent_id, claw_agent_id, ...)`)
- `services/memory/writer.py` — write/append memory files (replaces memory_bridge write path)

**Wire up:**
- `services/direct_tool_runtime.py` — replace `from services import memory_bridge` with `from services.memory import search, reader, writer`
- Keep the same tool interface (`memory_search`, `memory_read`, `memory_write`) — only the implementation changes

**DB migrations:**
- Add `memory_documents` table: `(id, agent_id, user_id, path, content_hash, created_at, updated_at)`
- Add `memory_chunks` table: `(id, document_id, chunk_index, content, embedding BLOB, fts_tokens)`
- Add FTS5 virtual table on `memory_chunks`

### 2. Decouple workspace_events
`WorkspaceEventsService` is imported by `soul_window_service.py` and `chat_context_runtime.py`.
These are OpenClaw-specific event bus calls.

**Fix:**
- Make `WorkspaceEventsService` a no-op stub when `OPENCLAW_GATEWAY_URL` not set
- Wrap all calls in try/except so failure is silent, not a crash
- `soul_window` router: return 503 with `{"detail": "soul_window requires OpenClaw"}` if not configured
- `chat_context_runtime.py`: make workspace event emission optional (already in non-critical path)

### 3. Dead code cleanup
- `services/direct_llm.py` — remove `openclaw` mode branches (chat_mode detection, `SUPPORTED_CHAT_MODES`)
- `services/providers/openclaw.py` — replace body with `raise NotImplementedError("OpenClaw provider not available in standalone mode")`
- `config.py` — keep `openclaw_memory_dir` setting (for possible bridge compat), but mark deprecated
- `db/repositories/agents.py` + `schemas/` — remove `chat_mode` field (legacy), keep `provider` + `provider_config`

### 4. Route audit
Verify every route below works standalone (no OpenClaw running). Tag broken ones.

**Core (must work):**
- `GET  /api/health`
- `POST /api/admin/users` — create user
- `GET  /api/admin/users` — list users
- `POST /api/admin/agents` — create agent
- `GET  /api/admin/agents` — list agents
- `POST /api/rooms` — create room
- `GET  /api/rooms` — list rooms
- `POST /api/rooms/{room_id}/agents` — add agent to room
- `POST /api/rooms/{room_id}/chat` — non-streaming chat
- `GET  /api/rooms/{room_id}/stream` — SSE streaming chat
- `GET  /api/rooms/{room_id}/history` — message history
- `GET  /api/memory/list` — list memory files
- `GET  /api/memory/{filename:path}` — read memory file

**Optional (degrade gracefully):**
- `/api/soul-window/*` — requires OpenClaw, return 503 if not configured
- `/api/transcribe` — requires audio infra, out of scope
- `/api/speak` — TTS, out of scope
- `/api/games/*` — modular, skip for now

---

## CLI — `cli/emilia`

Single Python CLI at `cli/emilia.py` (or `cli/` package). Uses `httpx` + `rich` for output.
Config: reads `CLI_BASE_URL` env (default `http://localhost:8080`).

### Commands

```
emilia health                          # GET /api/health
emilia setup                           # bootstrap: create default user + agent + room, print IDs
emilia users list
emilia agents list
emilia rooms list
emilia rooms create [--name NAME]
emilia chat [--room ROOM_ID] [--user USER_ID]   # interactive REPL, streaming SSE
emilia send [--room ROOM_ID] [--user USER_ID] "message"   # single shot, prints response
emilia history [--room ROOM_ID] [--limit 20]
emilia memory list [--agent AGENT_ID]
emilia memory read <path>
emilia memory search <query> [--agent AGENT_ID]
```

### `emilia setup` detail
Creates (idempotent by name):
- User: `cli-user` 
- Agent: `cli-agent` with `provider=native`, model from `EMILIA_DEFAULT_MODEL` env (default `gpt-4o-mini`)
- Room: `cli-room` with cli-agent added
Writes `.emilia-cli.json` in cwd with `{user_id, agent_id, room_id}` for subsequent commands.

### `emilia chat` detail
- Loads config from `.emilia-cli.json` (override with flags)
- REPL loop: prompt `> `, send to `POST /api/rooms/{room_id}/chat`
- Stream response via SSE if available, else non-stream fallback
- Show agent name + response, token count on exit
- `/quit` or Ctrl-C to exit
- `/history` to print last 10 messages
- `/clear` to start fresh context (new room or just visual clear?)

### Tech stack
- Python, `httpx` (already a backend dep), `rich` for colored output
- No new deps beyond what backend already uses
- Single file `cli/emilia.py` or small package `cli/`

---

## Test Plan (CI-friendly)

Add `cli/test_cli.sh` — bash script that:
1. Starts backend in background (if not already running)
2. Runs `emilia setup`
3. Sends a test message: `emilia send "Hello, who are you?"`
4. Checks for non-empty response
5. Checks `emilia memory list` returns 200
6. Checks `emilia history` returns messages
7. Exits with code 0 or 1

This replaces frontend as the smoke test.

---

## Out of Scope (Phase C)
- Frontend changes — zero
- TTS / transcribe / animation
- Emotion engine changes
- Dreams (Phase D)
- Games
- OpenClaw provider actual implementation

---

## Files Changed
**New:**
- `cli/emilia.py`
- `cli/test_cli.sh`
- `backend/services/memory/storage.py` (implement)
- `backend/services/memory/embedder.py` (implement)
- `backend/services/memory/indexer.py` (implement)
- `backend/services/memory/search.py` (implement)
- `backend/services/memory/reader.py` (new — file read helper)
- `backend/services/memory/writer.py` (new — file write helper)
- `backend/db/migrations/004_memory_engine.sql`

**Modified:**
- `backend/services/direct_tool_runtime.py` — swap memory_bridge → services/memory
- `backend/services/direct_llm.py` — remove openclaw mode branches
- `backend/services/providers/openclaw.py` — stub NotImplementedError
- `backend/services/workspace_events.py` — no-op when unconfigured
- `backend/services/chat_context_runtime.py` — make workspace events optional
- `backend/routers/soul_window.py` — 503 guard when OpenClaw not configured
- `backend/config.py` — mark openclaw_memory_dir deprecated
- `backend/db/repositories/agents.py` — remove chat_mode field
