# SOUL Simulator API

Backend contract for `POST /api/designer/v2/soul/simulate`.

## Auth

- `Authorization: Bearer <token>`

## Request

Provide exactly one of:
- `soul_md`
- `agent_id`

Required:
- `archetype`

Optional:
- `turns`
- `persona_model`
- `archetype_model`
- `judge_model`
- `timeout_per_call`

Example with inline SOUL:

```json
{
  "soul_md": "# SOUL.md\n## Canon\n...",
  "archetype": "venting-sad",
  "turns": 4
}
```

Example with agent workspace:

```json
{
  "agent_id": "rem",
  "archetype": "friendly-casual",
  "turns": 4
}
```

Defaults:
- `turns`: `SOUL_SIM_MAX_TURNS`
- `persona_model`: `SOUL_SIM_PERSONA_MODEL`
- `archetype_model`: `SOUL_SIM_JUDGE_MODEL`
- `judge_model`: `SOUL_SIM_JUDGE_MODEL`
- `timeout_per_call`: `90.0`

Validation:
- `turns` must be within `1..SOUL_SIM_MAX_TURNS`
- `timeout_per_call` must be between `10` and `300`
- `agent_id` mode requires an agent row, a workspace, and a readable `SOUL.md`

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

- `400`: bad input or unknown archetype
- `404`: missing agent, workspace, or `SOUL.md` in `agent_id` mode
- `503`: upstream model failure
- `504`: timeout

## Canonical Archetypes

- `aggressive-realistic`
- `confused-lost`
- `excited-scattered`
- `flirty-playful`
- `friendly-casual`
- `impatient-busy`
- `neutral-realistic`
- `skeptical-pushback`
- `venting-sad`

Snake-case aliases are accepted and normalized.
