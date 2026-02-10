# Agent Profile One-Shot

This folder contains a one-shot helper to apply a full Designer V2 personality profile to any agent, plus example profiles.

## Files
- `apply_agent_profile.py` — uploads a JSON profile (calls `PUT /api/designer/v2/personalities/{agent_id}`)
- `rem_rezero_profile.json` — full example profile for Rem (Re:Zero)
- `playful_companion_profile.json` — example profile for a playful companion
- `profile_template.json` — minimal template with all keys

## Quick Start

```bash
cd /home/tbach/Projects/emilia-project/emilia-webapp/backend
source .venv/bin/activate

export AUTH_TOKEN="your-token"

python scripts/agent_profiles/apply_agent_profile.py \
  --agent-id rem \
  --profile scripts/agent_profiles/rem_rezero_profile.json \
  --api http://localhost:8080
```

## How The Profile Is Applied
- `baseline_*`, `volatility`, `recovery_rate` are stored as columns on `agents`.
- The rest of the fields are stored inside `agents.emotional_profile` (JSON).
- Missing keys are left as-is; the engine merges defaults at runtime.
- The engine reads these values when constructing the agent profile for emotion updates.

## Field Legend And Ranges

Top-level fields (these map to the Designer V2 UI):
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
