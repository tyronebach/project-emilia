# Agent Profile One-Shot

This folder contains JSON payload examples for one-shot Designer V2 personality updates.
Apply them directly through backend API route:
`POST /api/designer/v2/personalities/apply`
Default response is compact (`ok`, `agent_id`, `name`) for low-token clients.
Use `?full=true` if you need the complete personality object.
Add `simulate_archetype=<id>` to run apply + drift summary in one call.

## Files
- `rem_rezero_profile.json` — full example profile for Rem (Re:Zero)
- `playful_companion_profile.json` — example profile for a playful companion
- `profile_template.json` — minimal template with all keys

Example profile (use this):
- `/home/tbach/Projects/emilia-project/emilia-webapp/backend/scripts/agent_profiles/rem_rezero_profile.json`

Schema/template reference:
- `/home/tbach/Projects/emilia-project/emilia-webapp/backend/scripts/agent_profiles/profile_template.json`

## Quick Start

```bash
cd /home/tbach/Projects/emilia-project/emilia-webapp

# Load AUTH_TOKEN from env file (example)
set -a
source backend/.env
set +a

curl -sS -X POST "http://localhost:8080/api/designer/v2/personalities/apply" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @backend/scripts/agent_profiles/rem_rezero_profile.json

# One-step apply + compact simulation summary
curl -sS -X POST "http://localhost:8080/api/designer/v2/personalities/apply?simulate_archetype=neutral" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @backend/scripts/agent_profiles/rem_rezero_profile.json

```

Required in payload:
- `agent_id` or `id`: target agent id

Common failures:
- `400`: missing `agent_id` / `id`
- `400`: invalid `simulate_archetype` (when set)
- `404`: target agent id does not exist
- `401/403`: invalid or missing auth token

## One-Step Simulation Knobs (Query Params)

When using `simulate_archetype`, you can tune simulation from query params:
- `simulate_duration_days` (default `7`)
- `simulate_sessions_per_day` (default `2`)
- `simulate_messages_per_session` (default `20`)
- `simulate_seed` (optional deterministic run)
- `simulate_include_config=true` (include resolved config in `simulation_summary`)

## Archetype Quick Picks (LLM)

Use these ids for `simulate_archetype`:
- `neutral`: baseline stability checks
- `aggressive`: trust loss + conflict resilience
- `supportive`: trust/intimacy gain behavior
- `playful`: teasing/banter behavior
- `flirty`: intimacy/attachment behavior
- `random`: robustness under mixed interactions
- `rough_day_then_recover`: trust loss/recovery cycle
- `lonely_then_playful`: vulnerability-to-play transition
- `moody_week`: phase-shift stability

## How The Profile Is Applied
- `baseline_*`, `volatility`, `recovery_rate` are stored as columns on `agents`.
- The rest of the fields are stored inside `agents.emotional_profile` (JSON).
- Missing keys are left as-is; the engine merges defaults at runtime.
- The engine reads these values when constructing the agent profile for emotion updates.

## Field Legend And Ranges

Top-level fields (these map to the Designer V2 UI):
- `agent_id` / `id`: Target agent id for apply endpoint/script safety.
- `name`: Display name for the agent.
- `description`: Short personality description.
- `baseline_valence`: Baseline mood valence. Range `-1..1`.
- `baseline_arousal`: Baseline energy/arousal. Range `-1..1`.
- `baseline_dominance`: Baseline dominance/assertiveness. Range `-1..1`.
- `volatility`: Reactivity multiplier. Range `0..3` (higher = bigger swings).
- `recovery_rate`: Speed of return to baseline. Range `0..1`.
- `mood_decay_rate`: Speed of mood-weight decay. Range `0..1`.
- `mood_baseline`: Map of mood → weight. Range `0..30` per mood (clamped by the engine).
- `trust_gain_rate`: Trust increase multiplier. Range `0..3`.
- `trust_loss_rate`: Trust decrease multiplier. Range `0..3`.
- `trigger_sensitivities`: Map of trigger → multiplier (float). `1.0` is default; values > 1 amplify, values < 1 dampen. Negative values flip direction.
- `trigger_responses`: Map of trigger → per-axis override. Each entry can include:
  - `preset`: One of `threatening`, `uncomfortable`, `neutral`, `muted`, `normal`, `amplified`, `intense`, `custom`.
  - axis keys: `valence`, `arousal`, `trust`, `attachment`, `intimacy` (numbers; override defaults).
- `essence_floors`: Map of axis → minimum floor. Intended as hard limits on traits.
- `essence_ceilings`: Map of axis → maximum ceiling. Intended as hard limits on traits.
- `vrm_model`: Optional avatar model filename (e.g., `emilia.vrm`).
- `voice_id`: Optional ElevenLabs voice ID.

Notes:
- The engine clamps emotional state axes to `[-1, 1]` for valence/arousal/dominance and to `[0, 1]` for trust/attachment/intimacy/familiarity.
- `essence_floors` / `essence_ceilings` are stored and surfaced in the Designer UI, but are not currently enforced by the engine. They are safe to include for future behavior.
- `preset` is supported by the backend. If a preset is provided, the engine converts it into numeric axis deltas using preset multipliers. Explicit axis values override preset-derived values on a per-axis basis.
- `custom` is not a backend multiplier. Use `custom` only when you provide explicit axis values.

## Triggers And Moods
- Canonical triggers are exposed by `GET /api/designer/v2/trigger-defaults` and used by the UI.
- Moods are defined in `backend/db/seed.py` under `_MOOD_SEEDS`.

Canonical mood set (Designer V2 / Emotion Engine):
- `bashful`
- `defiant`
- `enraged`
- `erratic`
- `euphoric`
- `flirty`
- `melancholic`
- `sarcastic`
- `sassy`
- `seductive`
- `snarky`
- `supportive`
- `suspicious`
- `vulnerable`
- `whimsical`
- `zen`

## Tips For AI-Assisted Character Design
- Start from the example JSON, then describe the character in plain language and let the AI edit the values.
- Keep baselines subtle; use mood baselines for personality flavor.
- Use `trigger_responses` if you want specific triggers to feel opposite of default (e.g., flirting feels threatening).

## Quick Tuning Guide (for LLMs)
- Want a more reactive character? Increase `volatility` (0.5 → 0.8) and/or reduce `recovery_rate`.
- Want emotions to linger? Lower `mood_decay_rate` (0.3 → 0.15). Want them to fade fast? Raise it.
- Want a warmer baseline? Increase `baseline_valence` and boost `supportive` / `whimsical` moods.
- Want thicker skin? Lower `trust_loss_rate` and set negative triggers to `muted`.
- Want stronger bonding? Raise `trust_gain_rate` and set `praise`, `affirmation`, `reconnection` to `amplified`.

### Mood Volatility Note (Prompt Dynamics)
- `volatility` now influences not only emotional deltas, but also how injected mood labels can vary between close contenders.
- Low-volatility personas are more stable: injection usually stays with top mood(s).
- High-volatility personas are more dynamic: when top moods are close, injection can occasionally jump to nearby moods.
- This keeps persona flavor coherent while preventing overly static prompts in high-reactivity characters.

## Canonical Triggers (Designer V2)

The engine uses 15 canonical triggers grouped into 5 categories:

- `play`: `teasing`, `banter`, `flirting`
- `care`: `comfort`, `praise`, `affirmation`
- `friction`: `criticism`, `rejection`, `boundary`, `dismissal`
- `repair`: `apology`, `accountability`, `reconnection`
- `vulnerability`: `disclosure`, `trust_signal`

These are the valid keys for `trigger_sensitivities` and `trigger_responses`.

## Trigger Presets (UI Meaning)
Presets are shorthand for how a trigger should *feel* and in which direction it should move the axes.
The backend converts presets to numeric deltas using the default trigger deltas multiplied by the preset multiplier.
If you provide explicit axis values, those override the preset on that axis.

Example trigger (what the LLM should understand):
- Trigger: `praise` — “Complimenting abilities or character.”

Preset meanings:
- `threatening`
  ↓ Valence, ↓ Arousal, ↓ Trust
  Example: praise feels sarcastic, manipulative, or unsafe.
- `uncomfortable`
  ↓ Valence, ↘ Arousal, ↓ Trust
  Example: praise feels awkward or invasive.
- `neutral`
  ~ No change
  Example: praise is acknowledged but not taken personally.
- `muted`
  ↗ Valence, ↗ Arousal, ↗ Trust (small)
  Example: praise lands a little, but the agent stays reserved.
- `normal`
  ↗ Valence, ↗ Arousal, ↗ Trust (default strength)
  Example: praise is welcomed in a healthy way.
- `amplified`
  ↑↑ Valence, ↑ Arousal, ↑↑ Trust
  Example: praise strongly boosts mood and trust.
- `intense`
  ↑↑↑ Valence, ↑↑ Arousal, ↑↑ Trust
  Example: praise is deeply affecting or emotionally significant.

### Example With Mood Drift (LLM-friendly)
Trigger: `flirting` — “Romantic or suggestive playfulness.”

Preset: `threatening`
- Axes: ↓ Valence, ↓ Arousal, ↓ Trust, ↓ Intimacy
  “Flirting feels invasive and alarming — strong negative reaction.”
- Mood drift (typical):
  `bashful` ↓, `seductive` ↓, `vulnerable` ↓, `whimsical` ↓
