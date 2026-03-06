# Emilia Backend

Standalone LLM companion backend. Multi-agent, multi-room, with persistent memory, long-term character evolution via dreams, and a behavioral rules system that makes characters feel real.

No frontend required to run or test — the CLI covers the full lifecycle.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + SQLite |
| LLM | Any OpenAI-compatible endpoint (OpenAI, Ollama, etc.) |
| Embeddings | Ollama `mxbai-embed-large` (default) or Gemini `gemini-embedding-001` |
| Memory | sqlite-vec + FTS5 hybrid search |
| Frontend | React 19 + Vite *(separate, not required for backend dev)* |

---

## Architecture

Three timescales of emotional state:

| Layer | What | Timescale | System |
|-------|------|-----------|--------|
| **Weather** | Per-turn mood | Seconds–minutes | Emotion engine |
| **Climate** | Relationship evolution | Days–weeks | Dream system |
| **Geography** | Core identity | Permanent | SOUL.md Canon |

**Rooms** contain agents. **Users** are mapped to agents they can talk to. Each user-agent pair has its own Lived Experience that evolves independently via dreams.

---

## Quick Start

```bash
# Start backend
docker compose up -d --build

# Or without Docker
cd backend && pip install -r requirements.txt
python main.py
```

Backend runs on `http://localhost:8080`. API docs at `http://localhost:8080/docs`.

---

## CLI

Install dependencies:
```bash
pip install httpx rich
```

Full agent lifecycle from terminal:

```bash
# 1. Check backend is up
emilia health

# 2. Init a workspace (creates SOUL.md, MEMORY.md)
emilia workspace init ~/agents/emilia --name "Emilia" --archetype "gentle, curious"

# 3. Create agent
emilia agents create \
  --id emilia \
  --name "Emilia" \
  --workspace ~/agents/emilia \
  --provider native \
  --model gpt-4o-mini

# 4. Create user + map to agent
emilia users create --name "Thai" --id thai
emilia users map --user thai --agent emilia

# 5. Create room + add agent
emilia rooms create --name "emilia-thai" --user thai --agent emilia
emilia context auto --user thai

# 6. Chat (uses saved context by default)
emilia chat

# 7. After chatting — check dream state
emilia dream status --agent emilia --user thai

# 8. Manually trigger a dream (character reflects on recent interactions)
emilia dream trigger --agent emilia --user thai
```

### All Commands

```
emilia health
emilia auth check

emilia context show
emilia context set [--user USER_ID] [--agent AGENT_ID] [--room ROOM_ID]
emilia context auto [--user USER_ID] [--agent AGENT_ID]

emilia setup [--user-id USER_ID] [--agent-id AGENT_ID] [--room-name NAME]

emilia workspace init PATH --name NAME [--archetype TEXT]

emilia agents list
emilia agents create --id ID --name NAME --workspace PATH --provider native --model MODEL
emilia agents show AGENT_ID
emilia agents update AGENT_ID [--name NAME] [--workspace PATH] [--model MODEL]
emilia agents delete AGENT_ID --yes

emilia users list
emilia users create --name NAME [--id ID]
emilia users show USER_ID
emilia users update USER_ID --name NAME
emilia users delete USER_ID --yes
emilia users map   --user USER_ID --agent AGENT_ID
emilia users unmap --user USER_ID --agent AGENT_ID

emilia rooms list
emilia rooms create [--name NAME] [--user USER_ID] [--agent AGENT_ID]... [--agents A1,A2]
emilia rooms show ROOM_ID
emilia rooms update ROOM_ID --name NAME
emilia rooms delete ROOM_ID --yes
emilia rooms add-agent    --room ROOM_ID --agent AGENT_ID
emilia rooms remove-agent --room ROOM_ID --agent AGENT_ID

emilia chat   [--room ROOM_ID] [--user USER_ID] [--agent AGENT_ID]   # interactive REPL
emilia send   [--room ROOM_ID] [--user USER_ID] [--agent AGENT_ID] "message"
emilia history [--room ROOM_ID] [--limit 20]

emilia memory list   [--agent AGENT_ID]
emilia memory read   PATH
emilia memory search QUERY [--agent AGENT_ID]

emilia dream trigger --agent AGENT_ID --user USER_ID
emilia dream status  --agent AGENT_ID --user USER_ID
emilia dream log     --agent AGENT_ID --user USER_ID
emilia dream reset   --agent AGENT_ID --user USER_ID
```

Global flags:
- `--json` machine-readable output
- `--profile <name>` select CLI profile
- `--base-url <url>` override backend URL for one command

Profile/context helpers:
```
emilia profile list
emilia profile show [name]
emilia profile use NAME
emilia profile set [name] [--activate] [--set-base-url URL] [--user USER_ID] [--agent AGENT_ID] [--room ROOM_ID]

emilia context show
emilia context set [--set-base-url URL] [--user USER_ID] [--agent AGENT_ID] [--room ROOM_ID]
emilia context auto [--user USER_ID] [--agent AGENT_ID]
```

---

## Persona / SOUL.md

Each agent has a `workspace` — a filesystem directory. The backend reads `{workspace}/SOUL.md` at chat time.

**v3 format:**
```markdown
# SOUL.md — Emilia

## Canon
### Identity
- **Name:** Emilia
- **Archetype:** gentle, curious, sometimes stubborn
- **Voice:** soft but direct, occasionally teasing

### Emotional Baseline
- **Default mood:** warm, slightly guarded
- **Volatility:** low
- **Recovery:** moderate

### Fragility Profile
- **Resilience to hostility:** medium
- **Trust repair rate:** slow
- **Breaking behaviors:**
  - trust < 0.3: shorter responses, no questions
  - trust < 0.15: minimal responses, no warmth, no disclosure

### Boundaries
- Will not pretend to be human

## Lived Experience
(Populated per-user by the dream system — do not edit manually)
```

**Canon** is immutable — only the designer changes it.
**Lived Experience** is written by the dream system per user. The same character has different relationship states with different users.

Memory files (`MEMORY.md`, `memory/YYYY-MM-DD.md`) live in the same workspace directory.

---

## Dream System

After N sessions or 48h of inactivity, the character reflects on recent interactions and updates their relationship with that user:

- Reads Canon + current Lived Experience + blended context (recent interactions, room summaries, optional memory hits)
- LLM generates: updated Lived Experience prose + relationship adjustments (trust/attachment/intimacy deltas, bounded)
- Writes back to DB + logs to `dream_log` audit table
- Behavioral rules in the next session automatically reflect the new trust level

Recent realism upgrade (P021/P013 alignment):
- Persona-aware compaction with structured/factual fallback
- Top-of-mind memory recollection injection (threshold/budget-gated)
- Session-scoped weather reset (V/A/D) with relationship dimensions preserved
- Optional backend memory auto-capture (disabled by default)

This is what makes a character who's been treated poorly start giving shorter responses — and what makes a character who's been treated well start opening up.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EMILIA_DB_PATH` | `.data/emilia.db` | SQLite database path |
| `OPENAI_API_KEY` | — | Required for OpenAI provider |
| `EMILIA_EMBED_PROVIDER` | `ollama` | Embedding provider (`ollama` or `gemini`) |
| `EMILIA_EMBED_MODEL` | `mxbai-embed-large` | Embedding model |
| `EMILIA_EMBED_BASE_URL` | `http://localhost:11434` | Ollama base URL |
| `GEMINI_API_KEY` | — | Required if `EMILIA_EMBED_PROVIDER=gemini` |
| `AUTH_ALLOW_DEV_TOKEN` | `0` | Set to `1` to skip auth in dev |
| `CLAWDBOT_TOKEN` | — | API auth token |
| `MEMORY_AUTORECALL_ENABLED` | `0` | Enables backend proactive top-of-mind memory injection |
| `COMPACTION_PERSONA_MODE` | `dm_only` | Persona compaction mode (`off`, `dm_only`, `all`) |
| `DREAM_CONTEXT_MAX_MESSAGES` | `60` | Max recent messages used in dream context |
| `EMOTION_TRIGGER_CALIBRATION_ENABLED` | `1` | Enables per-user trigger calibration multipliers |
| `EMOTION_SESSION_REANCHOR_MODE` | `soft` | Deprecated in active runtime path after P013 weather reset |
| `MEMORY_AUTOCAPTURE_ENABLED` | `0` | Enables optional backend auto memory capture |
| `MEMORY_AUTOCAPTURE_MODEL` | `DIRECT_DEFAULT_MODEL` | Neutral extractor model used for structured memory candidates |
| `MEMORY_AUTOCAPTURE_TIMEOUT_S` | `8.0` | Timeout (seconds) for memory extraction call |

---

## Testing

```bash
# Docker (preferred)
bash backend/scripts/run-tests.sh

# Direct
cd backend && .venv/bin/python -m pytest -q
```

372 tests. CI-gated on every commit.

---

## Roadmap

| Phase | Status | Summary |
|-------|--------|---------|
| A | ✅ | Standalone scaffold, new DB schema, provider/memory/dream stubs |
| B | ✅ | Native provider runtime, streaming SSE, tool loop |
| C | ✅ | Standalone memory engine (Ollama embeddings), OpenClaw decoupled, CLI |
| D | ✅ | Dream system, behavioral rules framework, session-scoped emotion |
| P021/P013 follow-up | ✅ | Backend realism + emotional architecture alignment: top-of-mind recall, compaction v2, dream v2 climate path, session-scoped weather reset, calibration feature flag |
| E | 🔄 | CLI completeness (agents create/update, users map, workspace init) |
| Frontend redesign | — | Planned — major refactor |

---

## Key Docs

| File | Purpose |
|------|---------|
| `docs/PHASE-C-SPEC.md` | Memory engine + CLI design |
| `docs/PHASE-D-SPEC.md` | Dream system + behavioral rules design |
| `docs/PHASE-E-CLI-SPEC.md` | CLI completeness spec |
| `docs/planning/P013-emotional-architecture-v3.md` | Full emotional architecture design (Beatrice) |
| `docs/planning/P021-backend-realism-implementation-spec-2026-03-04.md` | Backend realism implementation spec |
| `docs/planning/P021-implementation-ticket-list-2026-03-04.md` | P021 engineering ticket breakdown |
| `docs/planning/P021-rollout-runbook-2026-03-04.md` | Canary/rollback rollout runbook |
| `docs/SOUL-SIMULATOR-API.md` | SOUL simulator endpoint |
| `backend/scripts/run-tests.sh` | Test runner |

---

*Backend: Ram. Architecture: Thai + Beatrice.*
