# P014: Emilia Standalone Core Redesign (No OpenClaw Required)

**Status:** Approved for implementation  
**Created:** 2026-03-03  
**Owner:** Ram  
**Directive:** Big architectural redesign first. No feature work (animation/VAD/VRM/TTS/games polish) until core is solid.

---

## 0) Executive Summary

We are redesigning Emilia-webapp into a **standalone agent platform** with:

1. **Standalone agent runtime** (no OpenClaw dependency required)
2. **Built-in memory system** (semantic search + read/write)
3. **Built-in dream scheduler** (simple cron-like loop)
4. **Optional OpenClaw adapter plugin** for compatibility
5. **Drift simulator removed from production runtime**

After this foundation is stable, we resume higher-level systems (animation, VAD tuning, VRM, TTS, games, UX polish).

---

## 1) Locked Decisions

1. **No migration/flags required.** Existing data is disposable test data. We can reset schema.
2. **Standalone-first architecture.** OpenClaw is optional integration, not a core dependency.
3. **Provider abstraction is mandatory.** Runtime must not branch all over routers by backend mode.
4. **Dreams are internal.** No dependency on OpenClaw cron/jobs for core dream behavior.
5. **No drift in production behavior.** Drift may survive only as optional diagnostics tool later.
6. **Memory is internal.** Do not depend on OpenClaw memory sqlite layout.

---

## 2) Target Architecture

## 2.1 Runtime layers

- **API layer** (`routers/*`): request validation, auth, DTOs only
- **Orchestration layer** (`services/chat_runtime/*`): message assembly, emotion hooks, memory hooks, provider call
- **Provider layer** (`services/providers/*`): pluggable LLM backends
- **Memory layer** (`services/memory/*`): index/search/read/write
- **Dream layer** (`services/dreams/*`): scheduling + reflection + lived-experience updates
- **Persistence layer** (`db/repositories/*`): thin CRUD only

No router-to-router coupling. No provider-specific branching in routers.

## 2.2 Agent model (new canonical)

Replace `chat_mode + clawdbot_agent_id + direct_*` sprawl with:

- `agents.provider` (`native`, `openclaw`)
- `agents.provider_config_json` (model/base/agentId/etc)
- `agents.persona_source` (`db`, `file`, `hybrid`)
- `agents.persona_text` (optional)
- `agents.workspace` optional (not required)

OpenClaw-specific fields move under adapter config, not global required columns.

## 2.3 Chat pipeline (single path)

`chat` and `rooms` both call one shared runtime:

1. Load room + participants
2. Build context (persona + memory + weather + lived experience)
3. Invoke provider adapter (stream/non-stream)
4. Parse behavior tags
5. Persist message/events
6. Trigger post hooks (emotion updates, dream counters)

---

## 3) Memory System Decision (QMD vs Gemini)

## Decision

Implement a **provider-based internal memory engine**:

- Default: **local embeddings** (no external API dependency)
- Optional: **Gemini embedder** plugin
- Optional future: **QMD adapter** plugin

### Why

- If we lock to QMD, we re-couple to OpenClaw ecosystem.
- If we lock to Gemini, we force external API/key dependency.
- Local-first keeps standalone promise and reduces ops complexity.

## Memory v1 components

- `memory_documents`
- `memory_chunks`
- `memory_embeddings`
- `memory_events` (write audit)

Tools exposed to runtime:
- `memory_search`
- `memory_read`
- `memory_write`

Path policy:
- Agent-scoped memory namespace in DB
- Optional file mirror for human-readable export

---

## 4) Dream System (Internal Scheduler)

Implement a simple internal scheduler (tick loop every 60s):

- checks due dream candidates
- executes dream reflection job
- updates lived experience + relationship deltas
- logs to `dream_log`

## Dream triggers

- interaction count threshold (e.g. every 5 interactions)
- time threshold (e.g. 48h)
- event trigger (large trust drop)

## Dream outputs

- `lived_experience` snapshot (bounded length)
- bounded deltas: trust/attachment/intimacy
- internal monologue saved in audit log (optional visibility)

No external cron dependency.

---

## 5) Emotion Architecture v3 alignment

- **Weather (per-turn):** VAD + mood injection in-session behavior
- **Climate (long-term):** dream updates only
- **Geography (canon):** immutable designer-defined identity

Runtime rules:
- remove long-horizon numeric drift behavior from prod path
- keep relationship dimensions persistent
- enforce behavioral constraints from trust + fragility profile

---

## 6) Designer-V2 Strategy

## Recommendation

**Split Designer-V2 into standalone app after core stabilization**, not before.

### Phase order
1. Keep existing designer routes/UI while redesigning core contracts.
2. Once new contracts are stable, extract Designer-V2 frontend into separate app package.
3. Backend keeps designer API module (or moves to admin service later).

This avoids blocking core redesign on UI extraction.

---

## 7) Implementation Plan (Execution Phases)

## Phase A — Hard reset + scaffolding (Day 1)

- [ ] Freeze non-core feature work
- [ ] Reset local DB schema for redesign
- [ ] Create new module boundaries:
  - [ ] `services/providers/`
  - [ ] `services/memory/`
  - [ ] `services/dreams/`
  - [ ] `services/chat_runtime/`
- [ ] Add architecture tests for import boundaries (no router-to-router)

**Exit criteria:** Clean boot, tests running, new module skeleton in place.

## Phase B — Provider abstraction + native provider (Days 2-3)

- [ ] Define provider interface (`generate`, `stream`, capability flags)
- [ ] Implement `native` provider (OpenAI-compatible)
- [ ] Refactor chat runtime to call provider interface only
- [ ] Remove direct provider branching from routers
- [ ] Keep OpenClaw adapter stubbed (not active yet)

**Exit criteria:** DM/room chat works with native provider only.

## Phase C — Internal memory engine (Days 4-5)

- [ ] Replace OpenClaw memory bridge usage in runtime path
- [ ] Implement indexing/chunking/search/read/write in internal service
- [ ] Add embedder abstraction (`local`, `gemini` optional)
- [ ] Integrate memory tools into provider tool loop
- [ ] Add tests for retrieval quality + write safety

**Exit criteria:** memory_search/read/write working with no OpenClaw.

## Phase D — Dream scheduler + lived experience (Days 6-7)

- [ ] Add lived experience + dream log schema
- [ ] Implement scheduler loop + due selection
- [ ] Implement dream prompt + JSON validation + bounded deltas
- [ ] Wire dream counters from chat runtime
- [ ] Add manual trigger endpoint for testing

**Exit criteria:** dreams run automatically and persist audited updates.

## Phase E — Remove drift from production path (Day 8)

- [ ] Remove drift usage from runtime code paths
- [ ] Keep or archive drift endpoints as diagnostics-only (optional)
- [ ] Update docs + UI labels to reflect non-production status

**Exit criteria:** no production request path depends on drift simulator.

## Phase F — OpenClaw adapter plugin (optional, Days 9-10)

- [ ] Implement provider adapter for OpenClaw gateway
- [ ] Map adapter config (`agentId`, endpoint, token)
- [ ] Ensure hot-switch per agent (`native` vs `openclaw`) via provider field
- [ ] Add adapter integration tests

**Exit criteria:** OpenClaw works as optional backend, not required for system boot.

## Phase G — Stabilization before feature work (Days 11-12)

- [ ] Full backend/frontend test sweep
- [ ] Load and latency sanity checks
- [ ] API contract freeze for next phase
- [ ] Update docs (`README`, `DOCUMENTATION`, changelog, architecture notes)

**Exit criteria:** core marked stable; then unlock animation/VAD/VRM/TTS/games work.

---

## 8) API/Schema Contract Changes (breaking, accepted)

- `AgentCreate` no longer requires `clawdbot_agent_id`
- `chat_mode` replaced by `provider`
- provider-specific settings move to `provider_config`
- workspace optional in all non-memory-file endpoints
- memory endpoints become DB-backed and agent-scoped, not workspace-path dependent

Because test data is disposable, we accept breaking changes now.

---

## 9) File Impact Map (high-confidence)

## Replace/refactor heavily
- `backend/services/llm_caller.py`
- `backend/services/direct_llm.py`
- `backend/services/direct_tool_runtime.py`
- `backend/services/memory_bridge.py`
- `backend/routers/chat.py`
- `backend/routers/rooms.py`
- `backend/schemas/requests.py`
- `backend/schemas/responses.py`
- `backend/db/repositories/agents.py`
- `backend/db/connection.py`

## Add
- `backend/services/providers/base.py`
- `backend/services/providers/native.py`
- `backend/services/providers/openclaw.py` (optional adapter)
- `backend/services/memory/indexer.py`
- `backend/services/memory/search.py`
- `backend/services/memory/storage.py`
- `backend/services/dreams/scheduler.py`
- `backend/services/dreams/runtime.py`
- `backend/services/chat_runtime/pipeline.py`

## Frontend likely updates
- `frontend/src/utils/api.ts` (agent/provider DTO changes)
- manage/designer forms for provider config and memory/dream controls

---

## 10) Acceptance Criteria (must pass)

1. System boots and runs with **zero OpenClaw dependencies**.
2. DM and room chat both work through one runtime pipeline.
3. Memory search/read/write works with internal memory backend.
4. Dreams run on schedule and update lived experience with audit logs.
5. Drift is removed from production behavior path.
6. OpenClaw adapter (if enabled) works without infecting core abstractions.
7. Documentation reflects standalone-first architecture.

---

## 11) Immediate Next Actions

1. Approve this plan as the active project runway.
2. Start Phase A today.
3. Commit architecture scaffold + DB reset as first checkpoint.
4. Report only after each phase reaches exit criteria.

---

Built for Thai’s directive: foundation first, everything else later.
