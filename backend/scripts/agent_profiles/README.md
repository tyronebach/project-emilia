# Agent Profile Payloads

JSON examples for `POST /api/designer/v2/personalities/apply`.

This directory currently contains:
- `profile_template.json`
- `rem_rezero_profile.json`

There is no bundled `playful_companion_profile.json` in this repo.

## Apply a Payload

Compact response:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @backend/scripts/agent_profiles/rem_rezero_profile.json \
  "http://localhost:8080/api/designer/v2/personalities/apply"
```

Full response:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @backend/scripts/agent_profiles/rem_rezero_profile.json \
  "http://localhost:8080/api/designer/v2/personalities/apply?full=true"
```

Required payload field:
- `agent_id` or `id`

## Related Endpoints

- `GET /api/designer/v2/personalities`
- `GET /api/designer/v2/personalities/{agent_id}`
- `PUT /api/designer/v2/personalities/{agent_id}`
- `GET /api/designer/v2/trigger-defaults`
- `GET /api/designer/v2/mood-injection-settings`
- `PUT /api/designer/v2/mood-injection-settings`
- `POST /api/designer/v2/soul/simulate`

Use `/api/designer/v2/soul/simulate` separately if you want stateless persona evaluation. The apply endpoint does not run inline drift or soul simulation.

## Field Mapping

Stored on `agents` columns:
- `name` -> `display_name`
- `baseline_valence`
- `baseline_arousal`
- `baseline_dominance`
- `volatility` -> `emotional_volatility`
- `recovery_rate` -> `emotional_recovery`
- `vrm_model`
- `voice_id`

Stored inside `agents.emotional_profile` JSON:
- `description`
- `mood_decay_rate`
- `mood_baseline`
- `trust_gain_rate`
- `trust_loss_rate`
- `valence_gain_multiplier`
- `valence_loss_multiplier`
- `bond_gain_multiplier`
- `bond_loss_multiplier`
- `mood_gain_multiplier`
- `mood_loss_multiplier`
- `trigger_sensitivities`
- `trigger_responses`
- `essence_floors`
- `essence_ceilings`

## Notes

- `essence_floors` and `essence_ceilings` are stored and returned, but the runtime does not currently enforce them.
- Trigger aliases are normalized to canonical trigger labels during runtime processing.
- Canonical trigger defaults come from `GET /api/designer/v2/trigger-defaults`.
- Mood injection settings are global app settings, stored under the `mood_injection_settings` key in `app_settings`.
