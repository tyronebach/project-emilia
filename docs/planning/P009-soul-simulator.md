# P009: SOUL.md Persona Simulator

**Status:** Planning (revised after repo alignment review)  
**Created:** 2026-02-11  
**Updated:** 2026-02-12  
**Author:** Beatrice (via Thai)

## Goal

Add one backend endpoint that can quickly simulate how a SOUL.md persona behaves across different user archetypes, then return structured tuning feedback.

```
SOUL.md + archetype prompt -> multi-turn exchange -> judge analysis -> tuning hints
```

Primary users:
1. Echidna loops (automated persona tuning)
2. Designer users (manual "does this feel in-character?" checks)

## Repo Alignment Review (2026-02-12)

### Findings and Fixes

1. **High** - Model default assumptions conflicted with project policy  
Issue: prior draft defaulted persona to `openai/claude-sonnet-4`. Repo policy says companion agents use `gpt-5.1-codex-mini`.  
Fix: default persona model to `openai-codex/gpt-5.1-codex-mini`; reuse existing `COMPACT_MODEL` as default for archetype/judge unless overridden.

2. **High** - Archetype mapping claim was false  
Issue: prior draft said "1:1 with mined archetypes" but definitions and IDs were mismatched.  
Fix: use canonical hyphen IDs and include all prompt personas needed for practical coverage (including neutral).

3. **Medium** - `get_agent_workspace` reuse was a false fit  
Issue: dependency is query/header-based and user-scoped; this endpoint is body-driven on `designer_v2` admin router.  
Fix: use a local helper to load workspace SOUL.md by `agent_id` inside `designer_v2.py`. Keep this endpoint admin-scoped like existing Designer V2 routes.

4. **Medium** - Test plan assumed live LLM/network  
Issue: prior tests would be flaky/costly and used sync-style calls inconsistent with current async test client pattern.  
Fix: add async tests (`pytest.mark.anyio`) with monkeypatched LLM functions; no external network calls.

5. **Medium** - Validation/failure behavior was underspecified  
Issue: ambiguous input precedence, no SOUL.md size guard, unclear upstream failure contract.  
Fix: explicit validation rules, size limits, and deterministic 4xx/5xx behavior.

## Scope

### In Scope (MVP)

- One endpoint: `POST /api/designer/v2/soul/simulate`
- Two input modes:
  - inline `soul_md`
  - `agent_id` -> load `{workspace}/SOUL.md`
- Multi-turn exchange generation
- LLM judge analysis (JSON contract)
- No persistence (stateless response)
- Minimal shared LLM helper reused by compaction and simulator

### Out of Scope

- DB tables for version history
- A/B compare endpoints
- SSE streaming
- Frontend implementation details (endpoint is backend-ready only)

## API Contract

### Endpoint

`POST /api/designer/v2/soul/simulate`

### Request

```json
{
  "soul_md": "# SOUL.md\n...",
  "agent_id": null,
  "archetype": "venting_sad",
  "turns": 8,
  "persona_model": null,
  "archetype_model": null,
  "judge_model": null
}
```

### Request Rules

- Exactly one of `soul_md` or `agent_id` is required.
- `archetype` is required.
- `turns` default: `SOUL_SIM_MAX_TURNS` (env default `8`), allowed range `1..SOUL_SIM_MAX_TURNS`.
- `soul_md` is trimmed and capped (for example `MAX_SOUL_MD_CHARS = 30000`).
- If `agent_id` is used:
  - agent must exist
  - workspace must exist
  - `SOUL.md` must exist and obey same size cap

### Response (success)

```json
{
  "ok": true,
  "exchange": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "analysis": {
    "consistency_score": 0.84,
    "voice_markers": ["third-person reference", "gentle reassurance"],
    "emotional_alignment": "Warm and validating under distress.",
    "character_breaks": [],
    "tuning_hints": ["Add clearer boundary language in playful contexts."],
    "verdict": "good",
    "score": 0.82
  },
  "config": {
    "archetype": "venting_sad",
    "turns": 8,
    "persona_model": "openai-codex/gpt-5.1-codex-mini",
    "archetype_model": "openai/gpt-4o-mini",
    "judge_model": "openai/gpt-4o-mini"
  }
}
```

### Error Behavior

- `400`: invalid input (missing fields, bad turns, unknown archetype)
- `404`: agent/workspace/SOUL.md not found for `agent_id` mode
- `502`: upstream LLM failure
- `504`: upstream timeout

No partial-success payload in MVP (keeps contract simple and predictable).

## Archetype Source of Truth

Canonical IDs (hyphen format):

- `aggressive-realistic`
- `confused-lost`
- `excited-scattered`
- `flirty-playful`
- `friendly-casual`
- `impatient-busy`
- `neutral-realistic`
- `skeptical-pushback`
- `venting-sad`

Implementation keeps a single `ARCHETYPE_PERSONAS` dictionary with:
- `description`
- `system_prompt`

Optional compatibility aliases are accepted (for example `venting_sad` -> `venting-sad`).

## Architecture and File Placement

### New Files

- `backend/services/llm_client.py`
- `backend/services/soul_simulator.py`
- `backend/tests/test_soul_simulator.py`

### Modified Files

- `backend/routers/designer_v2.py`
- `backend/services/compaction.py`
- `backend/config.py`

### Why this placement fits repo conventions

- Endpoint stays in existing Designer V2 router (`designer_v2.py`) like other simulation routes.
- No new router registration needed in `main.py`.
- Service logic stays in `backend/services/`, same as drift/compaction/emotion helpers.
- No schema or DB migration required for MVP.

## LLM Utility (Duplication Reduction)

Add small shared helper:

```python
# backend/services/llm_client.py
async def chat_completion_text(
    *,
    model: str,
    messages: list[dict[str, str]],
    user_tag: str,
    temperature: float = 0.7,
    timeout_s: float = 90.0,
    max_tokens: int | None = None,
) -> str: ...
```

Use it in:
- `CompactionService.summarize_messages()`
- `soul_simulator.py`

Note: chat/rooms keep current logic for now to limit blast radius.

## Soul Simulator Service

`backend/services/soul_simulator.py` should own:

- archetype definitions and normalization
- exchange runner
- judge prompt + JSON parsing
- input validation helpers (`turns`, size cap)

Core functions:

```python
async def run_exchange(
    soul_md: str,
    archetype_id: str,
    turns: int,
    *,
    persona_model: str,
    archetype_model: str,
) -> list[dict[str, str]]: ...

async def analyze_exchange(
    soul_md: str,
    archetype_id: str,
    exchange: list[dict[str, str]],
    *,
    judge_model: str,
) -> dict[str, Any]: ...
```

Judge parser must tolerate fenced JSON responses and raise `ValueError` on invalid payload shape.

## Router Wiring

In `backend/routers/designer_v2.py`:

1. Parse/validate body.
2. Resolve SOUL.md from inline text or agent workspace.
3. Resolve models:
   - `persona_model`: request override or `settings.soul_sim_persona_model`
   - `archetype_model`: request override or `settings.compact_model`
   - `judge_model`: request override or `settings.compact_model`
4. Run exchange and analysis.
5. Return `{ok, exchange, analysis, config}`.

Keep errors mapped through existing exception helpers (`bad_request`, `not_found`, `service_unavailable`, `timeout_error`).

## Config Changes

Add to `backend/config.py`:

```python
self.soul_sim_persona_model: str = os.getenv(
    "SOUL_SIM_PERSONA_MODEL",
    "openai-codex/gpt-5.1-codex-mini",
)
self.soul_sim_max_turns: int = int(os.getenv("SOUL_SIM_MAX_TURNS", "8"))
```

No extra judge/archetype env vars in MVP (reuse `COMPACT_MODEL` to keep config surface small).

## Testing Plan (No Live LLM Calls)

Create `backend/tests/test_soul_simulator.py` with async tests (`pytestmark = pytest.mark.anyio`):

1. Inline SOUL.md happy path
2. Agent workspace SOUL.md load path
3. Unknown archetype -> 400
4. Missing both `soul_md` and `agent_id` -> 400
5. Invalid turns (0 / over max) -> 400
6. Upstream LLM exception -> 502
7. Alias normalization (`venting_sad`) resolves to canonical (`venting-sad`)

Use monkeypatch on service functions or `llm_client.chat_completion_text` for deterministic outputs.

## Complexity/Robustness Summary

- **Complexity reduced:** one endpoint, no DB, no frontend coupling, two new settings only.
- **Duplication reduced:** shared LLM helper for compaction + simulator.
- **Robustness improved:** strict validation, deterministic error codes, async mocked tests.
- **Integration-safe:** lives entirely in existing backend conventions and file locations.
