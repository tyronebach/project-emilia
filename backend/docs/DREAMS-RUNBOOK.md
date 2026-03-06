# Dreams Runbook (P013 Climate Layer)

Use this to validate climate evolution via `/api/dreams`.

## Preconditions

- Backend running
- `AUTH_TOKEN` configured (or `AUTH_ALLOW_DEV_TOKEN=1` in local dev)
- Target `(agent_id, user_id)` pair exists

## 1) Inspect current dream state

```bash
curl -s -H "Authorization: Bearer $AUTH_TOKEN" \
  http://localhost:8080/api/dreams/<agent_id>/<user_id>
```

Expect:
- `lived_experience`
- `dream_count`
- `last_dream_at`
- latest `last_dream` metadata

## 2) Trigger a manual dream run

```bash
curl -s -X POST -H "Authorization: Bearer $AUTH_TOKEN" \
  http://localhost:8080/api/dreams/<agent_id>/<user_id>/trigger
```

Expect:
- persisted dream log row
- bounded relationship deltas applied
- updated lived experience snapshot

## 3) Read dream audit trail

```bash
curl -s -H "Authorization: Bearer $AUTH_TOKEN" \
  http://localhost:8080/api/dreams/<agent_id>/<user_id>/log
```

Verify:
- before/after lived experience
- before/after relationship JSON
- model + safety metadata

## 4) Reset lived experience for test loops

```bash
curl -s -X DELETE -H "Authorization: Bearer $AUTH_TOKEN" \
  http://localhost:8080/api/dreams/<agent_id>/<user_id>/reset
```

## Notes

- Drift simulator endpoints are deprecated (`410`) and should not be used for climate behavior.
- Weather (V/A/D) is session-scoped; climate changes should be observed via dream outputs + relationship persistence.
