# SOUL Simulator API

Backend endpoint for quick SOUL.md persona consistency checks.

## Endpoint

- `POST /api/designer/v2/soul/simulate`
- Auth: `Authorization: Bearer <token>`

## Request

Provide exactly one input mode:

1. Inline draft SOUL:
```json
{
  "soul_md": "# SOUL.md\n## Essence\n- ...",
  "archetype": "venting-sad",
  "turns": 4
}
```

2. Agent workspace SOUL:
```json
{
  "agent_id": "rem",
  "archetype": "friendly-casual",
  "turns": 4
}
```

Optional parameters:
- `persona_model`: model override for persona responses
- `archetype_model`: model override for archetype user messages
- `judge_model`: model override for analysis judge
- `timeout_per_call`: per-LLM-call timeout in seconds (10-300, default 90)

Defaults:
- `persona_model`: `SOUL_SIM_PERSONA_MODEL` (default `gpt-5-mini`)
- `archetype_model`: `COMPACT_MODEL` (default `gpt-4o-mini`)
- `judge_model`: `COMPACT_MODEL` (default `gpt-4o-mini`)
- `turns`: `SOUL_SIM_MAX_TURNS` (default `8`)

## Response

```json
{
  "ok": true,
  "exchange": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "analysis": {
    "consistency_score": 0.84,
    "voice_markers": ["..."],
    "emotional_alignment": "...",
    "character_breaks": [],
    "tuning_hints": ["..."],
    "verdict": "good",
    "score": 0.82
  },
  "config": {
    "archetype": "venting-sad",
    "turns": 4,
    "persona_model": "...",
    "archetype_model": "...",
    "judge_model": "...",
    "timeout_per_call": 90.0
  }
}
```

## Errors

- `400`: invalid input (bad turns, missing fields, unknown archetype)
- `404`: `agent_id` mode with missing agent/workspace/`SOUL.md`
- `503`: upstream LLM failure
- `504`: upstream timeout

## Archetypes

Canonical IDs:
- `aggressive-realistic`
- `confused-lost`
- `excited-scattered`
- `flirty-playful`
- `friendly-casual`
- `impatient-busy`
- `neutral-realistic`
- `skeptical-pushback`
- `venting-sad`

Alias forms like `venting_sad` are accepted.

Note: this endpoint uses archetypes as prompt personas for roleplay/judging. It does **not** run drift replay `message_triggers` math.

## Expected Latency

Each turn requires 2 LLM calls, plus 1 judge call at the end.

| Turns | LLM Calls | Typical Time | Recommended Client Timeout |
|-------|-----------|--------------|---------------------------|
| 2     | 5         | 30-60s       | 120s                      |
| 4     | 9         | 60-120s      | 180s                      |
| 8     | 17        | 120-240s     | 300s                      |

Set your HTTP client timeout higher than the expected time.
