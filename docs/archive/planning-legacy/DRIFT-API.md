# Drift API

API contract for the `/designer-v2` Drift tab.

Base prefix: `/api/designer/v2`  
Auth: `Authorization: Bearer <token>`

## One-Step Apply + Summary (LLM Workflow)

You can skip separate apply/simulate calls by using:

- `POST /personalities/apply?simulate_archetype=<archetype_id>`

This applies the profile payload first, then runs drift simulation summary and returns:

- `ok`, `agent_id`, `name`
- `simulation_summary` (same compact shape as `/drift-simulate-summary`)

Optional query params for one-step simulation tuning:

- `simulate_user_id` (default: `sim-user`)
- `simulate_duration_days` (default: `7`)
- `simulate_sessions_per_day` (default: `2`)
- `simulate_messages_per_session` (default: `20`)
- `simulate_session_gap_hours` (default: `8`)
- `simulate_overnight_gap_hours` (default: `12`)
- `simulate_seed` (optional)
- `simulate_replay_mode` (`sequential` or `random`, default `sequential`)
- `simulate_include_config=true` (include config in `simulation_summary`)

## Frontend Call Flow

- `GET /personalities` to populate agent picker
- `GET /personalities/{agent_id}` to fetch selected agent baseline/personality for charts
- `GET /archetypes` to populate archetype picker
- `GET /archetypes/{id}` for archetype detail in manager UI
- `POST /archetypes` for manual archetype creation
- `POST /archetypes/generate` for `.txt` upload-based generation
- `PUT /archetypes/{id}` for metadata/weights updates
- `DELETE /archetypes/{id}` for cleanup
- `POST /drift-simulate` for a single-archetype run
- `POST /drift-simulate-summary` for compact automation scorecards
- `POST /drift-compare` for compare mode

## Endpoints

## Available Archetypes (For LLM Selection)

Use `GET /archetypes` to fetch the live list. Archetypes are now DB-backed global assets and can be added/edited/deleted through Designer V2.

LLM agent strategy:

- For quick iteration, call `drift-simulate-summary` with one chosen archetype.
- For broader evaluation, run several archetypes and compare returned scorecards client-side.
- Prefer a small archetype set per iteration (for example `neutral`, one stress archetype, one positive archetype) to keep token usage low.

### `GET /archetypes`

Response:

```json
{
  "archetypes": [
    {
      "id": "aggressive",
      "name": "Aggressive",
      "description": "Demanding, critical, impatient user",
      "sample_count": 140,
      "source_filename": "seed/default",
      "created_at": 1739232000,
      "updated_at": 1739232000
    }
  ]
}
```

### `GET /archetypes/{id}`

Returns full archetype payload including replay data:

```json
{
  "id": "aggressive",
  "name": "Aggressive",
  "description": "Demanding, critical, impatient user",
  "sample_count": 140,
  "message_triggers": [
    [["disapproval", 0.72], ["fear", 0.61]],
    [["disappointment", 0.58]]
  ],
  "outcome_weights": {
    "positive": 0.1,
    "neutral": 0.3,
    "negative": 0.6
  },
  "source_filename": "seed/default",
  "created_at": 1739232000,
  "updated_at": 1739232000
}
```

### `POST /archetypes`

Creates a manual global archetype.

```json
{
  "id": "my-arch",
  "name": "My Archetype",
  "description": "Hand-authored replay",
  "message_triggers": [[["admiration", 0.9]], [["anger", 0.8]]],
  "outcome_weights": {"positive": 0.3, "neutral": 0.4, "negative": 0.3}
}
```

### `POST /archetypes/generate`

`multipart/form-data` upload endpoint.

Fields:

- `file`: UTF-8 `.txt`
- `id`
- `name`
- `description` (optional)
- `outcome_weights` JSON (optional)

Guardrails:

- max file size: 2 MB
- max non-empty lines: 2000
- max line length: 300 chars

### `PUT /archetypes/{id}`

Updates `name`, `description`, `outcome_weights`, and optionally `message_triggers`.

### `DELETE /archetypes/{id}`

Deletes the archetype.

### `POST /drift-simulate`

Request body used by frontend:

```json
{
  "agent_id": "rem",
  "archetype": "supportive",
  "duration_days": 7,
  "sessions_per_day": 2,
  "messages_per_session": 20,
  "seed": 42,
  "replay_mode": "sequential"
}
```

Optional request fields supported by backend:

- `user_id` (default: `"sim-user"`)
- `session_gap_hours` (default: `8`)
- `overnight_gap_hours` (default: `12`)
- `seed` (optional; deterministic when set)
- `replay_mode` (`sequential` or `random`, default `sequential`)

Required fields:

- `agent_id`
- `archetype`

Typical errors:

- `400` for missing required fields, invalid archetype, invalid non-positive counts, or unknown agent
- `401/403` for auth failures

Response shape:

```json
{
  "config": {
    "agent_id": "rem",
    "user_id": "sim-user",
    "archetype": "supportive",
    "duration_days": 7,
    "sessions_per_day": 2,
    "messages_per_session": 20,
    "session_gap_hours": 8.0,
    "overnight_gap_hours": 12.0,
    "seed": 42,
    "replay_mode": "sequential"
  },
  "timeline": [
    {
      "day": 0,
      "session": 0,
      "message": 0,
      "elapsed_hours": 0.0,
      "trigger": "praise",
      "intensity": 0.72,
      "outcome": "positive",
      "state": {
        "valence": 0.3,
        "arousal": 0.1,
        "trust": 0.55,
        "mood_weights": {
          "supportive": 6.2
        }
      },
      "dominant_mood": "supportive",
      "primary_mood": "supportive",
      "secondary_mood": "whimsical",
      "triggers": [
        {"trigger": "admiration", "intensity": 0.72},
        {"trigger": "approval", "intensity": 0.51}
      ]
    }
  ],
  "daily_summaries": [
    {
      "day": 0,
      "avg_valence": 0.22,
      "avg_arousal": 0.08,
      "avg_trust": 0.53,
      "avg_intimacy": 0.21,
      "dominant_moods": [
        "supportive"
      ],
      "trigger_counts": {
        "praise": 8
      }
    }
  ],
  "start_state": {},
  "end_state": {},
  "drift_vector": {},
  "mood_distribution": {},
  "trigger_stats": [
    {
      "trigger": "praise",
      "count": 8,
      "avg_intensity": 0.66,
      "avg_valence_delta": 0.04,
      "avg_arousal_delta": 0.01,
      "avg_trust_delta": 0.02
    }
  ],
  "stability_score": 0.81,
  "recovery_rate": 0.74,
  "significant_events": [
    {
      "day": 2,
      "session": 1,
      "message": 4,
      "event": "mood_shift",
      "details": "Dominant mood shifted to supportive"
    }
  ]
}
```

Notes:

- Timeline length is `duration_days * sessions_per_day * messages_per_session`.
- `drift_vector` keys:
  - `valence`
  - `arousal`
  - `dominance`
  - `trust`
  - `intimacy`
  - `playfulness_safety`
  - `conflict_tolerance`
  - `attachment`
  - `familiarity`

### `POST /drift-simulate-summary`

Runs the same simulation engine as `/drift-simulate`, but returns a compact response intended for LLM iteration loops.

Request body:

Same as `POST /drift-simulate`.

Response shape:

```json
{
  "messages_simulated": 280,
  "scorecard": {
    "start_core": { "valence": 0.2, "arousal": 0.0, "trust": 0.5, "intimacy": 0.2 },
    "end_core": { "valence": 0.34, "arousal": 0.08, "trust": 0.62, "intimacy": 0.24 },
    "core_drift": { "valence": 0.14, "arousal": 0.08, "trust": 0.12, "intimacy": 0.04 },
    "stability_score": 0.79,
    "recovery_rate": 0.71
  },
  "top_moods": [
    { "id": "supportive", "value": 0.42 },
    { "id": "whimsical", "value": 0.21 },
    { "id": "zen", "value": 0.13 }
  ],
  "top_triggers": [
    { "trigger": "praise", "count": 56, "avg_valence_delta": 0.04, "avg_trust_delta": 0.02 }
  ],
  "significant_event_counts": {
    "mood_shift": 5,
    "valence_peak": 1
  },
  "risk_flags": {
    "negative_drift": false,
    "trust_erosion": false,
    "low_stability": false,
    "slow_recovery": false
  },
  "tuning_hints": [
    "Current profile appears stable for this archetype and timeframe."
  ]
}
```

`risk_flags` and `tuning_hints` are heuristic summaries to support quick profile iteration.

Token-efficiency note:

- By default, response omits `config`.
- Add `?include_config=true` when you need resolved/defaulted config echoed back for debugging.

### `POST /drift-compare`

Request body used by frontend:

```json
{
  "agent_id": "rem",
  "archetypes": [
    "aggressive",
    "supportive",
    "playful"
  ],
  "duration_days": 7,
  "sessions_per_day": 2,
  "messages_per_session": 20,
  "replay_mode": "random",
  "seed": 42
}
```

Optional request fields supported by backend:

- `session_gap_hours`
- `overnight_gap_hours`
- `replay_mode` (`sequential` or `random`, default `sequential`)
- `seed` (optional; applies deterministic random-mode sampling)

Response:

```json
{
  "comparisons": [
    {
      "archetype": "aggressive",
      "result": {
        "config": {},
        "timeline": [],
        "daily_summaries": [],
        "start_state": {},
        "end_state": {},
        "drift_vector": {},
        "mood_distribution": {},
        "trigger_stats": [],
        "stability_score": 0.5,
        "recovery_rate": 0.4,
        "significant_events": []
      }
    }
  ]
}
```
