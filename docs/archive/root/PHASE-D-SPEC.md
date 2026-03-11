# Phase D — Dream System + Behavioral Rules Framework

Source design: `docs/planning/P013-emotional-architecture-v3.md`
Branch: `master` (continuing from Phase C merge)

---

## Goal
Implement the Dream System (climate layer) and Behavioral Rules Framework
from P013. No frontend changes — backend + CLI verifiable.

---

## 1. DB Schema

Add to `db/connection.py` and new migration `005_dreams.sql`:

```sql
-- Per user-agent Lived Experience (dream-writable)
CREATE TABLE IF NOT EXISTS character_lived_experience (
    agent_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    lived_experience TEXT NOT NULL DEFAULT '',
    last_dream_at    TEXT,
    dream_count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, user_id)
);

-- Audit trail for every dream
CREATE TABLE IF NOT EXISTS dream_log (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id                TEXT NOT NULL,
    user_id                 TEXT NOT NULL,
    dreamed_at              TEXT NOT NULL,
    triggered_by            TEXT NOT NULL DEFAULT 'scheduler',
    conversation_summary    TEXT,
    lived_experience_before TEXT,
    lived_experience_after  TEXT,
    relationship_before     TEXT,   -- JSON {trust, attachment, intimacy, ...}
    relationship_after      TEXT,   -- JSON
    internal_monologue      TEXT,
    model_used              TEXT
);
```

---

## 2. Dream Runtime (`services/dreams/runtime.py`)

Replace the `raise NotImplementedError` stub with full implementation.

### `execute_dream(user_id, agent_id, triggered_by)`

Steps:
1. Load agent's SOUL.md (Canon section only — read from `workspace` path)
2. Load current Lived Experience from `character_lived_experience` table (or empty string)
3. Load current relationship state (trust, attachment, intimacy, familiarity) from `emotional_state` table
4. Build conversation summary: last 20 messages from `room_messages` for this user-agent pair, summarised to ~300 tokens (simple truncation is fine for v1 — no extra LLM call)
5. Call LLM via `llm_caller` (non-stream, use agent's configured provider):
   - Prompt template from P013 §3.3
   - Request JSON output: `{lived_experience_update, relationship_adjustments, internal_monologue}`
6. Parse + validate response:
   - `trust_delta` bounded to [-0.2, +0.2]
   - `attachment_delta` bounded to [-0.1, +0.1]
   - `intimacy_delta` bounded to [-0.1, +0.1]
   - `lived_experience_update` truncated to 500 chars
7. Write updated Lived Experience to `character_lived_experience`
8. Apply relationship deltas (clamp final values to [0.0, 1.0])
9. Insert `dream_log` row
10. Return the dream_log row dict

---

## 3. Dream Scheduler (`services/dreams/scheduler.py`)

Replace stub with:

### `check_and_trigger_dreams()`
Called from a background task on app startup (every hour).

For each active user-agent pair (has messages in last 7 days):
- **Session count trigger:** if sessions since last dream >= 5 → trigger
- **Time trigger:** if last_dream_at is null OR >48h ago → trigger
- **Event trigger:** if trust dropped >0.15 in last session → trigger immediately

Use a simple per-pair lock (in-process dict) to prevent concurrent dreams for same pair.

### `trigger_dream_for_pair(user_id, agent_id, triggered_by)`
Async wrapper that calls `execute_dream` and logs exceptions without crashing.

---

## 4. Dream API Endpoints

Add to `routers/admin.py` (or new `routers/dreams.py`):

```
GET  /api/dreams/{agent_id}/{user_id}              # get lived experience + dream history
POST /api/dreams/{agent_id}/{user_id}/trigger       # manually trigger a dream (for testing)
DELETE /api/dreams/{agent_id}/{user_id}/reset        # reset lived experience to empty
GET  /api/dreams/{agent_id}/{user_id}/log            # dream audit trail
```

---

## 5. Behavioral Rules Framework

### `services/behavioral_rules.py` (new file)

```python
@dataclass
class FragilityProfile:
    hostility_threshold: int = 5
    trust_decay_multiplier: float = 1.0
    trust_repair_rate: float = 0.05
    hostility_response: str = "withdraw"   # withdraw | deflect | escalate | freeze
    breaking_behaviors: dict = field(default_factory=lambda: {
        0.3:  ["shorter_responses", "no_questions"],
        0.15: ["minimal_responses", "no_endearments", "no_disclosure"],
        0.05: ["single_word_only"],
    })
    behavioral_unlocks: dict = field(default_factory=lambda: {
        0.7:  ["personal_disclosure", "playfulness"],
        0.85: ["vulnerability", "genuine_intimacy"],
    })

def get_fragility_profile(agent: dict) -> FragilityProfile:
    """Parse fragility config from agent's provider_config or return defaults."""

def generate_behavioral_rules(trust: float, fragility: FragilityProfile) -> str:
    """Return system prompt block for current trust level. Empty string if no constraints."""
```

Rule text map (from P013 §6.3) — all 8 codes implemented.

### Wire into prompt assembly

`services/direct_llm.py` → `prepend_webapp_system_prompt()`:
1. Load lived experience for this user-agent pair from DB
2. Load trust from emotional_state
3. Compute behavioral rules block
4. Inject into system prompt in order: Canon → Lived Experience → Behavioral Rules → Mood

---

## 6. Session-Scoped Emotion State

Per P013 §2.1:
- VAD state (valence, arousal, dominance) resets at session start to baseline
- Trust / attachment / familiarity / intimacy persist (relationship dimensions)

**Change:** `emotion_runtime.py` — on session start, reset VAD fields only.
Keep existing DB columns. Add `session_id` tracking to know when a new session starts.

For v1: define "new session" as >2 hours since last message in this room.

---

## 7. Deprecate Drift Simulator

Per P013 §1.1:
- Remove `drift_simulator.py` and `drift_archetype_seed.py` from active code paths
- Keep files but add `# DEPRECATED — use dream system` header
- Any API endpoints calling drift simulation return 410 Gone with `{"detail": "drift simulator deprecated — use /api/dreams"}`

---

## 8. SOUL.md Parser Extension

`services/soul_parser.py` — extend to handle v3 format:

```
# SOUL.md — {Name}
## Canon
### Identity / Emotional Baseline / Fragility Profile / Boundaries
## Lived Experience
(per-user, injected from DB at runtime — not stored in file)
```

Parser should:
- Extract Canon section text
- Extract Fragility Profile block → parse into `FragilityProfile` dataclass
- If old format is encountered (no Canon/Lived Experience headers) → fail validation and require the v3 Canon/Lived Experience structure.

---

## 9. CLI Commands (extend `cli/emilia.py`)

```
emilia dream trigger --agent AGENT_ID --user USER_ID   # trigger manually
emilia dream status  --agent AGENT_ID --user USER_ID   # show lived experience + last dream
emilia dream log     --agent AGENT_ID --user USER_ID   # show dream audit trail
emilia dream reset   --agent AGENT_ID --user USER_ID   # reset lived experience
```

---

## 10. Tests

- `test_dreams.py` — unit tests for execute_dream (mock LLM, verify DB writes, delta clamping)
- `test_behavioral_rules.py` — test rule generation at various trust levels + fragility profiles
- `test_soul_parser.py` — extend to cover v3 format + fragility extraction
- Existing tests must still pass (261+)

---

## Out of Scope (Phase D)
- Designer V2 UI (frontend)
- Baseline derivation from SOUL via LLM
- Character's Journal (dream transparency feature)
- Factory reset framing ("character giving another chance")
- Multi-character dream concurrency beyond simple in-process lock

---

## Files Changed

**New:**
- `backend/db/migrations/005_dreams.sql`
- `backend/services/behavioral_rules.py`
- `backend/routers/dreams.py`
- `backend/tests/test_dreams.py`
- `backend/tests/test_behavioral_rules.py`

**Modified:**
- `backend/services/dreams/runtime.py` — implement
- `backend/services/dreams/scheduler.py` — implement
- `backend/services/soul_parser.py` — v3 format
- `backend/services/direct_llm.py` — inject lived experience + behavioral rules
- `backend/services/emotion_runtime.py` — session-scoped VAD reset
- `backend/db/connection.py` — new tables
- `backend/routers/admin.py` — wire in dream endpoints
- `backend/services/drift_simulator.py` — deprecation header
- `backend/services/drift_archetype_seed.py` — deprecation header
- `cli/emilia.py` — dream subcommands
- `backend/tests/test_soul_parser.py` — v3 format
