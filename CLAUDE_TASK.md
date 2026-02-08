# Claude CLI Task — Hybrid Emotion Architecture Implementation

## Read First
1. `docs/planning/HYBRID-EMOTION-ARCHITECTURE.md` — full spec
2. `backend/services/emotion_engine.py` — current implementation
3. `backend/services/config_loader.py` — config loading
4. `configs/` — existing config files

---

## Phase 1: Core Mood System

### Task 1.1: Add MOODS constant and mood utilities

Add to `backend/services/emotion_engine.py`:

```python
# After existing imports
MOODS = [
    "bashful", "defiant", "enraged", "erratic", "euphoric", "flirty",
    "melancholic", "sarcastic", "sassy", "seductive", "snarky",
    "supportive", "suspicious", "vulnerable", "whimsical", "zen"
]

# Mood → (valence, arousal) mapping for backwards compatibility
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
```

### Task 1.2: Update EmotionalState dataclass

Add `mood_weights` field:

```python
@dataclass
class EmotionalState:
    valence: float = 0.0
    arousal: float = 0.0
    dominance: float = 0.0
    trust: float = 0.5
    attachment: float = 0.3
    familiarity: float = 0.0
    mood_weights: dict = field(default_factory=dict)  # NEW
    
    def to_dict(self) -> dict:
        return {
            'valence': self.valence,
            'arousal': self.arousal,
            'dominance': self.dominance,
            'trust': self.trust,
            'attachment': self.attachment,
            'familiarity': self.familiarity,
            'mood_weights': self.mood_weights,  # NEW
        }
```

### Task 1.3: Update AgentProfile dataclass

Add `mood_baseline` field:

```python
@dataclass
class AgentProfile:
    # ... existing fields ...
    mood_baseline: dict = field(default_factory=dict)  # NEW: {"zen": 5, "supportive": 8, ...}
    mood_decay_rate: float = 0.3  # NEW
```

### Task 1.4: Add mood calculation methods to EmotionEngine

```python
def calculate_mood_deltas(
    self, 
    triggers: list[tuple[str, float]], 
    trigger_mood_map: dict
) -> dict[str, float]:
    """Calculate mood weight changes from triggers."""
    mood_deltas = {mood: 0.0 for mood in MOODS}
    
    for trigger, intensity in triggers:
        if trigger in trigger_mood_map:
            for mood, weight in trigger_mood_map[trigger].items():
                if mood in MOODS:
                    mood_deltas[mood] += weight * intensity
    
    return mood_deltas

def apply_mood_deltas(self, state: EmotionalState, mood_deltas: dict) -> None:
    """Apply mood deltas with volatility scaling."""
    if not state.mood_weights:
        state.mood_weights = {mood: self.profile.mood_baseline.get(mood, 0) for mood in MOODS}
    
    for mood, delta in mood_deltas.items():
        effective_delta = delta * self.profile.emotional_volatility
        current = state.mood_weights.get(mood, 0)
        state.mood_weights[mood] = self._clamp(current + effective_delta, -10, 20)
    
    # Update valence/arousal from moods
    self._update_valence_arousal_from_moods(state)

def _update_valence_arousal_from_moods(self, state: EmotionalState) -> None:
    """Derive valence/arousal from mood weights."""
    total_weight = sum(max(0, w) for w in state.mood_weights.values()) or 1
    
    valence = sum(
        MOOD_VALENCE_AROUSAL.get(mood, (0, 0))[0] * max(0, weight)
        for mood, weight in state.mood_weights.items()
    ) / total_weight
    
    arousal = sum(
        MOOD_VALENCE_AROUSAL.get(mood, (0, 0))[1] * max(0, weight)
        for mood, weight in state.mood_weights.items()
    ) / total_weight
    
    # Blend with existing (don't completely override)
    state.valence = self._clamp(state.valence * 0.3 + valence * 0.7, -1, 1)
    state.arousal = self._clamp(state.arousal * 0.3 + arousal * 0.7, -1, 1)

def apply_mood_decay(self, state: EmotionalState, elapsed_seconds: float) -> None:
    """Decay mood weights toward baseline."""
    if not state.mood_weights:
        return
    
    hours = elapsed_seconds / 3600
    decay_rate = self.profile.mood_decay_rate
    baseline = self.profile.mood_baseline
    
    for mood in MOODS:
        current = state.mood_weights.get(mood, 0)
        target = baseline.get(mood, 0)
        decay = (current - target) * decay_rate * hours
        state.mood_weights[mood] = current - decay

def get_dominant_moods(self, state: EmotionalState, top_n: int = 3) -> list[tuple[str, float]]:
    """Get top N moods by current weight."""
    if not state.mood_weights:
        return []
    
    sorted_moods = sorted(
        state.mood_weights.items(),
        key=lambda x: x[1],
        reverse=True
    )
    return [(m, w) for m, w in sorted_moods[:top_n] if w > 0]
```

### Task 1.5: Update generate_context_block

```python
def generate_context_block(self, state: EmotionalState) -> str:
    """Generate emotional context block for LLM prompt injection."""
    levers = self.get_behavior_levers(state)
    
    # Get dominant moods
    dominant = self.get_dominant_moods(state, top_n=2)
    
    if dominant:
        mood_names = [m[0] for m in dominant]
        top_weight = dominant[0][1]
        intensity = "strongly" if top_weight > 10 else "somewhat" if top_weight > 5 else "slightly"
        mood_desc = f"{intensity} {' and '.join(mood_names)}"
    else:
        mood_desc = "neutral"
    
    return f"""[EMOTIONAL_STATE]
You're feeling {mood_desc} right now.
Warmth: {levers['warmth']:.0%} | Playfulness: {levers['playfulness']:.0%} | Guardedness: {levers['guardedness']:.0%}
Trust level: {state.trust:.0%}
Let this color your tone naturally — don't mention these explicitly.
[/EMOTIONAL_STATE]"""
```

---

## Phase 2: Config Files

### Task 2.1: Create configs/moods.json

```json
{
  "moods": [
    "bashful", "defiant", "enraged", "erratic", "euphoric", "flirty",
    "melancholic", "sarcastic", "sassy", "seductive", "snarky",
    "supportive", "suspicious", "vulnerable", "whimsical", "zen"
  ],
  "mood_valence_arousal": {
    "euphoric": [0.9, 0.8],
    "flirty": [0.6, 0.6],
    "supportive": [0.7, 0.3],
    "whimsical": [0.5, 0.5],
    "bashful": [0.3, 0.4],
    "zen": [0.4, 0.1],
    "sassy": [0.3, 0.6],
    "sarcastic": [0.1, 0.4],
    "vulnerable": [0.2, 0.3],
    "snarky": [0.0, 0.5],
    "suspicious": [-0.2, 0.5],
    "melancholic": [-0.4, 0.2],
    "defiant": [-0.3, 0.7],
    "erratic": [0.0, 0.9],
    "enraged": [-0.8, 0.9],
    "seductive": [0.5, 0.7]
  }
}
```

### Task 2.2: Update configs/relationships/romantic.json

Add `trigger_mood_map`:

```json
{
  "type": "romantic",
  "modifiers": {
    "attachment_ceiling": 0.95,
    "trust_baseline": 0.5,
    "jealousy_enabled": true
  },
  "trigger_mood_map": {
    "compliment": {"euphoric": 3, "vulnerable": 2, "bashful": 1},
    "rejection": {"melancholic": 3, "vulnerable": 2, "defiant": 1},
    "teasing": {"flirty": 2, "bashful": 2, "sassy": 1},
    "conflict": {"defiant": 2, "suspicious": 2, "enraged": 1, "supportive": -2},
    "comfort": {"supportive": 3, "vulnerable": 1, "zen": 2},
    "affirmation": {"euphoric": 2, "supportive": 2, "vulnerable": 1},
    "dismissal": {"melancholic": 2, "suspicious": 1, "defiant": 1},
    "apology": {"supportive": 2, "vulnerable": 1, "zen": 1},
    "vulnerability": {"vulnerable": 3, "supportive": 2, "bashful": 1},
    "gratitude": {"euphoric": 2, "supportive": 2, "bashful": 1},
    "criticism": {"defiant": 2, "suspicious": 1, "melancholic": 1},
    "repair": {"supportive": 2, "zen": 1, "vulnerable": 1}
  }
}
```

### Task 2.3: Update configs/relationships/friend.json

```json
{
  "type": "friend",
  "modifiers": {
    "attachment_ceiling": 0.7,
    "trust_baseline": 0.4
  },
  "trigger_mood_map": {
    "compliment": {"supportive": 2, "whimsical": 1},
    "rejection": {"melancholic": 2, "suspicious": 1},
    "teasing": {"sassy": 2, "whimsical": 2, "snarky": 1},
    "conflict": {"defiant": 1, "suspicious": 1},
    "comfort": {"supportive": 2, "zen": 1},
    "affirmation": {"supportive": 2, "whimsical": 1},
    "dismissal": {"suspicious": 1, "snarky": 1},
    "apology": {"supportive": 1, "zen": 1},
    "vulnerability": {"supportive": 2, "vulnerable": 1},
    "gratitude": {"supportive": 2, "whimsical": 1},
    "criticism": {"snarky": 1, "defiant": 1},
    "repair": {"supportive": 1, "zen": 1}
  }
}
```

### Task 2.4: Update agent profiles with mood_baseline

Update `configs/agents/rem.json`:
```json
{
  "name": "Rem",
  "mood_baseline": {
    "supportive": 8,
    "vulnerable": 6,
    "euphoric": 5,
    "bashful": 4,
    "flirty": 3,
    "zen": 2
  },
  "mood_decay_rate": 0.3,
  ... existing fields ...
}
```

Update `configs/agents/ram.json`:
```json
{
  "name": "Ram",
  "mood_baseline": {
    "zen": 8,
    "snarky": 5,
    "defiant": 4,
    "suspicious": 3,
    "sassy": 2
  },
  "mood_decay_rate": 0.15,
  ... existing fields ...
}
```

Update `configs/agents/beatrice.json`:
```json
{
  "name": "Beatrice",
  "mood_baseline": {
    "snarky": 6,
    "defiant": 5,
    "vulnerable": 4,
    "bashful": 3,
    "zen": 3,
    "supportive": 2
  },
  "mood_decay_rate": 0.25,
  ... existing fields ...
}
```

---

## Phase 3: Config Loader Updates

### Task 3.1: Update config_loader.py

```python
def load_relationship_config(relationship_type: str) -> dict:
    """Load relationship config including trigger_mood_map."""
    path = CONFIGS_DIR / "relationships" / f"{relationship_type}.json"
    if not path.exists():
        return {"trigger_mood_map": {}}
    with open(path) as f:
        return json.load(f)

def load_agent_mood_baseline(agent_name: str) -> dict:
    """Load agent's mood baseline."""
    profile = load_agent_profile(agent_name)
    return profile.get("mood_baseline", {})

def get_trigger_mood_map(relationship_type: str, agent_name: str = None) -> dict:
    """Get trigger→mood map, with optional agent overrides."""
    rel_config = load_relationship_config(relationship_type)
    base_map = rel_config.get("trigger_mood_map", {})
    
    if agent_name:
        # Check for agent-specific overrides
        override_path = CONFIGS_DIR / "agents" / agent_name / f"{relationship_type}_overrides.json"
        if override_path.exists():
            with open(override_path) as f:
                overrides = json.load(f)
                # Merge overrides into base map
                for trigger, moods in overrides.get("trigger_mood_map", {}).items():
                    if trigger in base_map:
                        base_map[trigger].update(moods)
                    else:
                        base_map[trigger] = moods
    
    return base_map
```

---

## Phase 4: Integration

### Task 4.1: Update _process_emotion_pre_llm in chat.py

After trigger detection, add mood processing:

```python
# After getting triggers...

# Get relationship type (default to companion)
relationship_type = state_row.get('relationship_type') or 'companion'
if relationship_type == 'companion':
    relationship_type = 'friend'  # Map companion to friend for now

# Load trigger→mood map
from services.config_loader import get_trigger_mood_map
trigger_mood_map = get_trigger_mood_map(relationship_type, agent.get('name', '').lower())

# Calculate and apply mood deltas
mood_deltas = engine.calculate_mood_deltas(triggers, trigger_mood_map)
if any(d != 0 for d in mood_deltas.values()):
    engine.apply_mood_deltas(state, mood_deltas)

# Apply mood decay
engine.apply_mood_decay(state, elapsed)
```

### Task 4.2: Update schema

Add migration to `backend/db/connection.py`:

```python
# In init_db() or as migration
cursor.execute("""
    ALTER TABLE emotional_state ADD COLUMN mood_weights TEXT
""")
```

### Task 4.3: Update EmotionalStateRepository

Handle mood_weights serialization:

```python
# In get_or_create:
mood_weights = json.loads(row.get('mood_weights') or '{}')

# In update:
mood_weights_json = json.dumps(mood_weights) if mood_weights else None
```

---

## Phase 5: Testing

### Task 5.1: Update test-dialogues.py

Show mood trajectories:

```python
def run_dialogue(dialogue_path, agent_name, relationship_type="romantic"):
    # ... existing code ...
    
    # Load trigger_mood_map
    trigger_mood_map = get_trigger_mood_map(relationship_type, agent_name)
    
    for msg in messages:
        # ... trigger detection ...
        
        # Calculate mood deltas
        mood_deltas = engine.calculate_mood_deltas(triggers, trigger_mood_map)
        engine.apply_mood_deltas(state, mood_deltas)
        
        # Get dominant moods for display
        dominant = engine.get_dominant_moods(state, top_n=2)
        step["dominant_moods"] = dominant
```

### Task 5.2: Run comparison tests

```bash
# Test all agents with romantic relationship
python3 scripts/test-dialogues.py rem romantic
python3 scripts/test-dialogues.py ram romantic  
python3 scripts/test-dialogues.py beatrice romantic

# Test same agent with different relationships
python3 scripts/test-dialogues.py rem friend
python3 scripts/test-dialogues.py rem romantic
```

---

## Commit Strategy

1. "feat: add mood constants and EmotionalState mood_weights"
2. "feat: add mood calculation methods to EmotionEngine"
3. "feat: update config files with trigger_mood_map and mood_baseline"
4. "feat: update config_loader for mood system"
5. "feat: integrate mood system into chat processing"
6. "test: update dialogue runner for mood trajectories"

Run `./scripts/check-backend.sh` after each phase.

---

## Success Criteria

1. ✅ All 96+ backend tests pass
2. ✅ Dialogue runner shows mood trajectories
3. ✅ Different agents have different dominant moods for same input
4. ✅ Same agent reacts differently in friend vs romantic mode
5. ✅ LLM context includes "feeling [mood] right now"
6. ✅ Moods decay toward baseline over time
