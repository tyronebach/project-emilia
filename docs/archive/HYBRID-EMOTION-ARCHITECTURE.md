# Hybrid Emotion Architecture

**Date:** 2026-02-08  
**Status:** Implementation Spec

Merges the best of our current engine with synthlove's mood system.

---

## Overview

### Current System (Keep)
- Valence/arousal/trust core axes
- Time-based decay toward baseline
- Trust asymmetry (slow gain, fast loss)
- Behavior levers (warmth, playfulness, guardedness)
- LLM trigger detection (optional)

### Synthlove Additions (Port)
- 16 discrete mood labels
- Per-mood baseline weights (personality shape)
- Per-relationship trigger→mood matrices
- Dominant mood calculation for LLM injection

---

## Data Model

### 1. Mood Definitions (Constant)

```python
MOODS = [
    "bashful", "defiant", "enraged", "erratic", "euphoric", "flirty",
    "melancholic", "sarcastic", "sassy", "seductive", "snarky", 
    "supportive", "suspicious", "vulnerable", "whimsical", "zen"
]
```

### 2. Agent Profile (Per-Agent)

```json
{
  "name": "Rem",
  "description": "Devoted, expressive",
  
  "baseline": {
    "valence": 0.3,
    "arousal": 0.1,
    "dominance": -0.1
  },
  
  "volatility": 1.2,
  "recovery": 1.0,
  
  "decay_rates": {
    "valence": 0.4,
    "arousal": 0.5,
    "trust": 0.05,
    "moods": 0.3
  },
  
  "trust": {
    "gain_multiplier": 1.3,
    "loss_multiplier": 0.7
  },
  
  "mood_baseline": {
    "supportive": 8,
    "vulnerable": 6,
    "euphoric": 5,
    "bashful": 4,
    "flirty": 3,
    "zen": 2
  }
}
```

### 3. Relationship Config (Per-Relationship)

```json
{
  "type": "romantic",
  
  "modifiers": {
    "attachment_ceiling": 0.95,
    "trust_baseline": 0.5,
    "jealousy_enabled": true
  },
  
  "trigger_mood_map": {
    "compliment": {
      "euphoric": 3,
      "vulnerable": 2,
      "bashful": 1
    },
    "rejection": {
      "melancholic": 3,
      "vulnerable": 2,
      "defiant": -1
    },
    "teasing": {
      "flirty": 2,
      "bashful": 2,
      "sassy": 1
    },
    "conflict": {
      "defiant": 2,
      "suspicious": 2,
      "enraged": 1,
      "supportive": -2
    },
    "comfort": {
      "supportive": 3,
      "vulnerable": 1,
      "zen": 2
    },
    "affirmation": {
      "euphoric": 2,
      "supportive": 2,
      "vulnerable": 1
    },
    "dismissal": {
      "melancholic": 2,
      "suspicious": 1,
      "defiant": 1
    },
    "apology": {
      "supportive": 2,
      "vulnerable": 1,
      "zen": 1
    },
    "vulnerability": {
      "vulnerable": 3,
      "supportive": 2,
      "bashful": 1
    },
    "gratitude": {
      "euphoric": 2,
      "supportive": 2,
      "bashful": 1
    }
  }
}
```

### 4. Agent × Relationship Override (Optional)

For agent-specific relationship behavior:

```
configs/
  agents/
    rem/
      profile.json              # base profile
      romantic_overrides.json   # rem-specific romantic tweaks
    ram/
      profile.json
      romantic_overrides.json   # ram reacts differently to same triggers
```

Override example (`ram/romantic_overrides.json`):
```json
{
  "trigger_mood_map": {
    "compliment": {
      "bashful": 1,
      "zen": 1,
      "suspicious": 1
    }
  }
}
```

---

## Processing Flow

### 1. Input Classification

```
User message → Trigger detection (regex or LLM)
                      ↓
              [("compliment", 0.8), ("gratitude", 0.6)]
```

### 2. Mood Delta Calculation

```python
def calculate_mood_deltas(triggers, relationship_config, agent_overrides=None):
    """Calculate mood weight changes from triggers."""
    mood_deltas = {mood: 0.0 for mood in MOODS}
    
    # Get trigger→mood map (with agent overrides if present)
    trigger_map = relationship_config["trigger_mood_map"]
    if agent_overrides:
        trigger_map = merge_deep(trigger_map, agent_overrides.get("trigger_mood_map", {}))
    
    for trigger, intensity in triggers:
        if trigger in trigger_map:
            for mood, weight in trigger_map[trigger].items():
                mood_deltas[mood] += weight * intensity
    
    return mood_deltas
```

### 3. Apply to State

```python
def apply_mood_deltas(state, mood_deltas, agent_profile):
    """Apply mood deltas with volatility scaling."""
    volatility = agent_profile["volatility"]
    
    for mood, delta in mood_deltas.items():
        effective_delta = delta * volatility
        state.mood_weights[mood] = clamp(
            state.mood_weights.get(mood, 0) + effective_delta,
            -10, 20
        )
    
    # Also update valence/arousal from weighted mood average
    state.valence = calculate_valence_from_moods(state.mood_weights)
    state.arousal = calculate_arousal_from_moods(state.mood_weights)
```

### 4. Decay Toward Baseline

```python
def apply_mood_decay(state, agent_profile, elapsed_seconds):
    """Decay mood weights toward baseline."""
    hours = elapsed_seconds / 3600
    decay_rate = agent_profile["decay_rates"].get("moods", 0.3)
    baseline = agent_profile["mood_baseline"]
    
    for mood in MOODS:
        current = state.mood_weights.get(mood, 0)
        target = baseline.get(mood, 0)
        
        decay = (current - target) * decay_rate * hours
        state.mood_weights[mood] = current - decay
```

### 5. Calculate Dominant Moods

```python
def get_dominant_moods(mood_weights, top_n=3):
    """Get top N moods by current weight."""
    sorted_moods = sorted(
        mood_weights.items(),
        key=lambda x: x[1],
        reverse=True
    )
    return sorted_moods[:top_n]
```

### 6. Generate LLM Context

```python
def generate_emotional_context(state, agent_profile):
    """Generate context block for LLM injection."""
    levers = get_behavior_levers(state)  # existing
    dominant = get_dominant_moods(state.mood_weights, top_n=2)
    
    mood_desc = " and ".join([m[0] for m in dominant])
    intensity = "strongly" if dominant[0][1] > 10 else "somewhat" if dominant[0][1] > 5 else "slightly"
    
    return f"""[EMOTIONAL_STATE]
You're feeling {intensity} {mood_desc} right now.
Warmth: {levers['warmth']:.0%} | Playfulness: {levers['playfulness']:.0%} | Guardedness: {levers['guardedness']:.0%}
Trust level: {state.trust:.0%}
Let this color your tone naturally — don't mention these explicitly.
[/EMOTIONAL_STATE]"""
```

---

## Schema Updates

### emotional_state table additions

```sql
ALTER TABLE emotional_state ADD COLUMN mood_weights TEXT;  -- JSON: {"zen": 5, "bashful": 3, ...}
```

### agents table additions

```sql
ALTER TABLE agents ADD COLUMN mood_baseline TEXT;  -- JSON: {"zen": 10, ...}
```

---

## Data Storage

### Agents: SQLite (Single Source of Truth)

Agent emotional profiles are stored in the `agents` table:

```sql
-- Columns for emotional config
baseline_valence REAL DEFAULT 0.2,
baseline_arousal REAL DEFAULT 0.0,
baseline_dominance REAL DEFAULT 0.0,
emotional_volatility REAL DEFAULT 0.5,
emotional_recovery REAL DEFAULT 0.1,
emotional_profile TEXT  -- JSON blob with mood_baseline, decay_rates, etc.
```

The `emotional_profile` JSON column contains:
- `mood_baseline`: Per-mood weights (0-10)
- `mood_decay_rate`: How fast moods return to baseline
- `decay_rates`: Per-axis decay rates
- `trigger_multipliers`: Agent-specific trigger scaling
- `trust_gain_multiplier` / `trust_loss_multiplier`

### Relationships: JSON Files

Relationship templates (shared across agents) remain in JSON:

```
configs/
  moods.json                    # MOODS constant + mood→valence/arousal mappings
  
  relationships/
    friend.json                 # trigger_mood_map for friend
    romantic.json               # trigger_mood_map for romantic
```

### Agent Designer Admin UI

Visual editor at `http://localhost:3002`:
- Edit mood_baseline with sliders (0-10 for each of 16 moods)
- Edit trigger→mood mappings for relationships
- Changes write directly to SQLite
- See: `frontend/designer/` and `backend/routers/designer.py`

---

## Implementation Status ✓

All phases complete as of 2026-02-08.

### Phase 1: Core Mood System ✓
- MOODS constant in emotion_engine.py
- mood_weights in EmotionalState
- mood_baseline in AgentProfile
- calculate_mood_deltas(), apply_mood_decay(), get_dominant_moods()
- generate_context_block() includes mood

### Phase 2: Config & Storage ✓
- configs/moods.json with mood definitions
- Relationship trigger_mood_maps in JSON files
- **Agent profiles in SQLite** (not JSON files)
- config_loader.py for relationship configs

### Phase 3: Integration ✓
- _process_emotion_pre_llm() uses mood system
- mood_weights_json column in emotional_state table
- EmotionalStateRepository handles mood persistence
- Debug endpoints show moods

### Phase 4: Testing & Tuning ✓
- test-dialogues.py shows mood trajectories
- 98 unit tests passing
- emotion-lab.py for interactive tuning

### Phase 5: Agent Designer UI ✓
- Visual editor at localhost:3002
- MoodBaselineEditor with 16 sliders
- TriggerMoodEditor for relationship mappings
- Writes to SQLite, not JSON files

---

## Mood → Valence/Arousal Mapping

During transition cleanup, derive valence/arousal from moods:

```python
MOOD_VALENCE_AROUSAL = {
    "euphoric":    (0.9, 0.8),
    "flirty":      (0.6, 0.6),
    "supportive":  (0.7, 0.3),
    "whimsical":   (0.5, 0.5),
    "bashful":     (0.3, 0.4),
    "zen":         (0.4, 0.1),
    "sassy":       (0.3, 0.6),
    "sarcastic":   (0.1, 0.4),
    "vulnerable":  (0.2, 0.3),
    "snarky":      (0.0, 0.5),
    "suspicious":  (-0.2, 0.5),
    "melancholic": (-0.4, 0.2),
    "defiant":     (-0.3, 0.7),
    "erratic":     (0.0, 0.9),
    "enraged":     (-0.8, 0.9),
    "seductive":   (0.5, 0.7),
}

def calculate_valence_from_moods(mood_weights):
    """Weighted average of mood valences."""
    total_weight = sum(max(0, w) for w in mood_weights.values()) or 1
    valence = sum(
        MOOD_VALENCE_AROUSAL.get(mood, (0, 0))[0] * max(0, weight)
        for mood, weight in mood_weights.items()
    ) / total_weight
    return clamp(valence, -1, 1)
```

---

## Example: Rem vs Ram Romantic Response

**Input:** "I love you" → triggers: [("affirmation", 0.9), ("vulnerability", 0.7)]

### Rem (romantic)
```
Trigger map (romantic): affirmation → euphoric+2, supportive+2, vulnerable+1
                        vulnerability → vulnerable+3, supportive+2, bashful+1

Mood deltas: euphoric=1.8, supportive=3.6, vulnerable=3.4, bashful=0.7
After volatility (1.2): euphoric=2.2, supportive=4.3, vulnerable=4.1, bashful=0.8

Dominant moods: supportive, vulnerable
Context: "You're feeling strongly supportive and vulnerable right now."
```

### Ram (romantic with overrides)
```
Override: affirmation → bashful+1, zen+1, suspicious+1
          vulnerability → zen+2, suspicious+1

Mood deltas: bashful=0.9, zen=2.3, suspicious=1.5
After volatility (0.6): bashful=0.5, zen=1.4, suspicious=0.9

Dominant moods: zen, suspicious  
Context: "You're feeling somewhat zen and suspicious right now."
```

**Result:** Same input, completely different emotional reactions based on personality.

---

*This architecture preserves our existing engine while adding synthlove's richer mood vocabulary and per-relationship personalization.*
