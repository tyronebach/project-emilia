# Dreams Runbook

Operational checks for `/api/dreams`.

## Preconditions

- Backend is running
- `Authorization: Bearer <token>` is available
- Target `agent_id` and `user_id` both exist

## Inspect State

```bash
curl -sS \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "http://localhost:8080/api/dreams/${AGENT_ID}/${USER_ID}"
```

Current response shape:
- `agent_id`
- `user_id`
- `lived_experience`
- `last_dream`

`lived_experience` is either the stored row from `character_lived_experience` or a synthesized empty default.

## Trigger a Dream

```bash
curl -sS -X POST \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "http://localhost:8080/api/dreams/${AGENT_ID}/${USER_ID}/trigger"
```

Validate:
- a new `dream_log` row exists
- `character_lived_experience` was updated
- returned deltas are bounded

## Read Audit Log

```bash
curl -sS \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "http://localhost:8080/api/dreams/${AGENT_ID}/${USER_ID}/log"
```

Current response shape:
- `dreams`: newest first
- `count`

Useful fields inside each dream row:
- `triggered_by`
- `dreamed_at`
- `conversation_summary`
- `lived_experience_before`
- `lived_experience_after`
- `relationship_before`
- `relationship_after`
- `model_used`
- `safety_flags`

## Reset for Test Loops

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  "http://localhost:8080/api/dreams/${AGENT_ID}/${USER_ID}/reset"
```

Reset response:
- `status`
- `agent_id`
- `user_id`
- `lived_experience`

## Notes

- Dream execution is the active long-horizon relationship path.
- Deprecated Designer drift endpoints return `410 Gone`; they are not part of the live climate system.
- The background scheduler is started from `backend/main.py` and runs `check_and_trigger_dreams()` hourly.
