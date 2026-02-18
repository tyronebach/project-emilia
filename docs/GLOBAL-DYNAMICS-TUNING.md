# Global Dynamics — Mood Injection Tuning Guide

## What This Controls

Each agent has an emotional state with weighted moods (e.g., "content: 0.45, playful: 0.38, curious: 0.30"). Before each LLM call, the engine picks which mood(s) to inject into the prompt. Normally it picks the top mood deterministically. But for **high-volatility agents**, it can randomly select from runner-up moods — so a character who's 45% content and 38% playful might sometimes act playful instead of always content.

Global Dynamics controls this volatility-driven selection. The knobs live in Designer V2 → Dynamics tab and are persisted in the `app_settings` table.

## The Knobs

| Knob | Default | Range | Description |
|------|---------|-------|-------------|
| **Top K** | 3 | 1–6 | How many candidate moods to consider for random selection |
| **Volatility Threshold** | 0.3 | 0–1 | Minimum normalized volatility before random selection activates |
| **Min Margin** | 0.15 | 0–1 | If #1 mood leads by this ratio, stay deterministic |
| **Random Strength** | 0.7 | 0–2 | Base probability multiplier for choosing randomly |
| **Max Random Chance** | 0.85 | 0–1 | Hard cap on random selection probability |

## How It Works

1. Agent's `emotional_volatility` (0–3 range, set per-agent in profile) gets normalized to 0–1 by dividing by 1.5 and clamping.
2. If normalized volatility < **Volatility Threshold** → always pick the top mood. No randomness.
3. Otherwise, check margin between #1 and #2 mood weights. If `(#1 - #2) / #1` >= **Min Margin** → stay deterministic (clear winner).
4. If both checks pass, compute random chance: `Random Strength × vol_factor × margin_factor`, capped at **Max Random Chance**.
5. Roll the dice. If random wins, sample from **Top K** moods weighted by their scores (high-volatility flattens the distribution).

## Tuning Presets

### Stable (Deterministic) — Agents always use their dominant mood

| Knob | Value | Why |
|------|-------|-----|
| Top K | 1 | Only the #1 mood is considered |
| Volatility Threshold | 0.9 | Almost no agent crosses this bar |
| Min Margin | 0.05 | Even a tiny lead stays deterministic |
| Random Strength | 0.1 | Minimal random pull when it does trigger |
| Max Random Chance | 0.2 | Hard cap at 20% in extreme cases |

**Shortcut**: Set Volatility Threshold to **1.0** to disable randomness entirely — normalized volatility can never reach 1.0 in practice.

### Volatile — Agents frequently shift between close moods

| Knob | Value | Why |
|------|-------|-----|
| Top K | 5–6 | Wider pool of mood candidates |
| Volatility Threshold | 0.05 | Nearly every agent qualifies for random selection |
| Min Margin | 0.5 | Only a massive lead (50%+) stays deterministic |
| Random Strength | 1.5 | Strong random pull |
| Max Random Chance | 0.95 | Nearly always random when conditions are met |

### Moderate (Default) — Balanced behavior

| Knob | Value |
|------|-------|
| Top K | 3 |
| Volatility Threshold | 0.3 |
| Min Margin | 0.15 |
| Random Strength | 0.7 |
| Max Random Chance | 0.85 |

## Per-Agent vs Global

These knobs are **global** — they affect all agents. Per-agent mood variation is controlled by `emotional_volatility` in the agent's profile (Designer V2 → Personality tab, 0–3 range). That's the value that gets compared against the Volatility Threshold.

To make one specific agent more volatile without affecting others, bump that agent's `emotional_volatility` instead of touching global dynamics.

## Where It Lives

- **Backend logic**: `backend/services/emotion_engine.py` → `select_moods_for_injection()`
- **API endpoints**: `GET/PUT /api/designer/v2/mood-injection-settings`
- **DB storage**: `app_settings` table, key `mood_injection`
- **Frontend UI**: `frontend/src/components/designer/GlobalDynamicsTab.tsx`
