# Implementation Guide: Soul Simulator Configurable Timeout

## Summary

Add `timeout_per_call` optional parameter to `/api/designer/v2/soul/simulate` endpoint to allow callers to specify LLM call timeout based on expected turn count.

## Current State

- **File:** `backend/services/soul_simulator.py`
- **Hardcoded:** `timeout_s=90.0` in three places (lines 322, 334, 384)
- **Problem:** 4+ turn simulations can exceed caller's HTTP timeout before completing

## Changes Required

### 1. `backend/services/soul_simulator.py`

**Update `run_exchange` signature:**
```python
async def run_exchange(
    soul_md: str,
    archetype_id: str,
    turns: int,
    *,
    persona_model: str,
    archetype_model: str,
    timeout_per_call: float = 90.0,  # ADD THIS
) -> list[dict[str, str]]:
```

**Update both `chat_completion_text` calls inside `run_exchange`:**
```python
user_msg = await chat_completion_text(
    model=archetype_model,
    messages=archetype_messages,
    user_tag="emilia:soul-sim-archetype",
    temperature=0.9,
    timeout_s=timeout_per_call,  # CHANGE FROM 90.0
)
```

```python
persona_msg = await chat_completion_text(
    model=persona_model,
    messages=[
        {"role": "system", "content": persona_system},
        *exchange,
    ],
    user_tag="emilia:soul-sim-persona",
    temperature=0.7,
    timeout_s=timeout_per_call,  # CHANGE FROM 90.0
)
```

**Update `analyze_exchange` signature:**
```python
async def analyze_exchange(
    soul_md: str,
    archetype_id: str,
    exchange: list[dict[str, str]],
    *,
    judge_model: str,
    timeout_per_call: float = 90.0,  # ADD THIS
) -> dict[str, Any]:
```

**Update the `chat_completion_text` call inside `analyze_exchange`:**
```python
raw = await chat_completion_text(
    model=judge_model,
    messages=[
        {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ],
    user_tag="emilia:soul-sim-judge",
    temperature=0.2,
    timeout_s=timeout_per_call,  # CHANGE FROM 90.0
)
```

### 2. `backend/routers/designer_v2.py`

**In `soul_simulate` function, add parameter extraction after line ~786:**
```python
judge_model = str(body.get("judge_model") or settings.compact_model).strip()
if not persona_model or not archetype_model or not judge_model:
    raise bad_request("persona_model, archetype_model, and judge_model must be non-empty when provided")

# ADD THIS BLOCK:
timeout_per_call_raw = body.get("timeout_per_call")
if timeout_per_call_raw is not None:
    try:
        timeout_per_call = float(timeout_per_call_raw)
        if timeout_per_call < 10.0 or timeout_per_call > 300.0:
            raise bad_request("timeout_per_call must be between 10 and 300 seconds")
    except (TypeError, ValueError) as exc:
        raise bad_request("timeout_per_call must be a number") from exc
else:
    timeout_per_call = 90.0
```

**Update the `run_exchange` and `analyze_exchange` calls:**
```python
exchange = await run_exchange(
    soul_md=soul_md,
    archetype_id=archetype,
    turns=turns,
    persona_model=persona_model,
    archetype_model=archetype_model,
    timeout_per_call=timeout_per_call,  # ADD THIS
)
analysis = await analyze_exchange(
    soul_md=soul_md,
    archetype_id=archetype,
    exchange=exchange,
    judge_model=judge_model,
    timeout_per_call=timeout_per_call,  # ADD THIS
)
```

**Update the config response to include the timeout:**
```python
return {
    "ok": True,
    "exchange": exchange,
    "analysis": analysis,
    "config": {
        "archetype": archetype,
        "turns": turns,
        "persona_model": persona_model,
        "archetype_model": archetype_model,
        "judge_model": judge_model,
        "timeout_per_call": timeout_per_call,  # ADD THIS
    },
}
```

### 3. Update `docs/SOUL-SIMULATOR-API.md`

Add to Request section:
```markdown
Optional parameters:
- `timeout_per_call`: Per-LLM-call timeout in seconds (10-300, default 90)
```

Add latency guidance:
```markdown
## Expected Latency

Each turn requires 2 LLM calls, plus 1 judge call at the end.

| Turns | LLM Calls | Typical Time | Recommended Client Timeout |
|-------|-----------|--------------|---------------------------|
| 2     | 5         | 30-60s       | 120s                      |
| 4     | 9         | 60-120s      | 180s                      |
| 8     | 17        | 120-240s     | 300s                      |

Set your HTTP client timeout higher than the expected time.
```

---

## Codex Prompt

```
Add configurable timeout_per_call parameter to the soul simulator endpoint.

Files to modify:
- backend/services/soul_simulator.py
- backend/routers/designer_v2.py
- docs/SOUL-SIMULATOR-API.md

Requirements:
1. Add timeout_per_call optional parameter to /api/designer/v2/soul/simulate endpoint
2. Default: 90.0 seconds (current behavior)
3. Valid range: 10-300 seconds (return 400 if outside range)
4. Pass it through to run_exchange() and analyze_exchange() functions
5. Update both functions to accept timeout_per_call parameter and use it instead of hardcoded 90.0
6. Include timeout_per_call in the response config object
7. Update SOUL-SIMULATOR-API.md with the new parameter and add latency guidance table

See docs/IMPL-SOUL-SIM-TIMEOUT.md for detailed implementation guide.
```

---

## Testing

```bash
# Test with default timeout
curl -X POST http://localhost:8080/api/designer/v2/soul/simulate \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"soul_md": "# Test\n- Name: Test", "archetype": "friendly-casual", "turns": 2}'

# Test with custom timeout
curl -X POST http://localhost:8080/api/designer/v2/soul/simulate \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"soul_md": "# Test\n- Name: Test", "archetype": "friendly-casual", "turns": 4, "timeout_per_call": 120}'

# Test invalid timeout (should 400)
curl -X POST http://localhost:8080/api/designer/v2/soul/simulate \
  -H "Authorization: Bearer emilia-dev-token-2026" \
  -H "Content-Type: application/json" \
  -d '{"soul_md": "# Test", "archetype": "friendly-casual", "turns": 2, "timeout_per_call": 5}'
```
