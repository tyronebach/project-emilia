# Global Dynamics Tuning

This document covers the backend mood-injection settings stored in `app_settings`.

## What It Controls

Before each response, the emotion engine decides whether to inject only the dominant mood or to sample from nearby moods based on agent volatility and global settings.

Relevant code:
- `backend/services/emotion_engine.py`
- `backend/routers/designer_v2.py` (`GET/PUT /api/designer/v2/mood-injection-settings`)

Stored setting key:
- `mood_injection_settings`

## Knobs

| Knob | Default | Meaning |
|------|---------|---------|
| `top_k` | `3` | maximum number of moods considered for random selection |
| `volatility_threshold` | `0.3` | minimum normalized volatility before randomness can activate |
| `min_margin` | `0.15` | if the top mood wins by at least this ratio, stay deterministic |
| `random_strength` | `0.7` | multiplier for random-selection probability |
| `max_random_chance` | `0.85` | hard cap on random-selection probability |

## Runtime Logic

1. Normalize `AgentProfile.emotional_volatility`.
2. If normalized volatility is below `volatility_threshold`, inject the top mood only.
3. Compare the top two mood weights.
4. If the winner is far enough ahead, stay deterministic.
5. Otherwise compute a random-selection chance, capped by `max_random_chance`.
6. If the random branch wins, sample from the top `top_k` moods.

## Safe Presets

Stable:
- `top_k=1`
- `volatility_threshold=0.9`
- `min_margin=0.05`
- `random_strength=0.1`
- `max_random_chance=0.2`

Moderate:
- use the defaults

Volatile:
- `top_k=5`
- `volatility_threshold=0.05`
- `min_margin=0.5`
- `random_strength=1.5`
- `max_random_chance=0.95`

## Notes

- These are global settings. Per-agent variation still comes from `emotional_volatility`.
- Setting `top_k=1` effectively disables multi-mood sampling regardless of the other values.
