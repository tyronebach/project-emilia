# Emotional Engine — Implementation Spec

**Status:** Implemented ✓  
**Last Updated:** 2026-02-08  
**Parent:** [EMOTIONAL-ENGINE.md](./EMOTIONAL-ENGINE.md)

---

## Overview

This document specifies the implementation details for the emotional engine with the hybrid 16-mood architecture.

---

## Data Storage

### Single Source of Truth: SQLite

All agent emotional configuration lives in the **SQLite database**, not JSON files.

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Designer UI                        │
│                   (localhost:3002)                          │
└────────────────────────┬────────────────────────────────────┘
                         │ PUT /api/designer/agents/{id}
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               SQLite: agents table                          │
│  - emotional_profile (JSON column)                          │
│  - baseline_valence, baseline_arousal, baseline_dominance   │
│  - emotional_volatility, emotional_recovery                 │
└────────────────────────┬────────────────────────────────────┘
                         │ EmotionalStateRepository.get_agent_profile()
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               EmotionEngine                                 │
│  - Loads AgentProfile from DB                               │
│  - Applies triggers, decay, mood calculations               │
│  - Injects emotional context into LLM prompt                │
└─────────────────────────────────────────────────────────────┘
```

### agents.emotional_profile Schema

```json
{
  "description": "Sweet, caring, playful",
  "mood_baseline": {
    "supportive": 6,
    "whimsical": 5,
    "flirty": 4,
    "bashful": 3
  },
  "mood_decay_rate": 0.3,
  "decay_rates": {
    "valence": 0.3,
    "arousal": 0.4,
    "trust": 0.05
  },
  "trigger_multipliers": {
    "compliment": 1.3,
    "rejection": 1.4
  },
  "trust_gain_multiplier": 1.0,
  "trust_loss_multiplier": 1.0,
  "attachment_ceiling": 1.0,
  "play_trust_threshold": 0.7
}
```

### Relationship Configs (JSON files)

Relationship templates remain in JSON files since they're shared across agents:

```
configs/relationships/
├── friend.json       # trigger_mood_map for friend relationships
└── romantic.json     # trigger_mood_map for romantic relationships
```

These are loaded via `services/config_loader.py` with LRU caching.

---

## The 16 Moods

```python
MOODS = [
    "bashful", "defiant", "enraged", "erratic", "euphoric", "flirty",
    "melancholic", "sarcastic", "sassy", "seductive", "snarky",
    "supportive", "suspicious", "vulnerable", "whimsical", "zen"
]
```

Each mood maps to (valence, arousal) for backwards compatibility:

```python
MOOD_VALENCE_AROUSAL = {
    "euphoric":    (0.9, 0.8),
    "flirty":      (0.6, 0.6),
    "supportive":  (0.7, 0.3),
    "whimsical":   (0.5, 0.5),
    "bashful":     (0.3, 0.4),
    "zen":         (0.4, 0.1),
    # ... etc
}
```

---

## File Structure

```
backend/
├── services/
│   ├── emotion_engine.py        # Core engine class
│   └── config_loader.py         # Loads relationship configs (JSON)
├── db/repositories/
│   ├── emotional_state.py       # State CRUD + agent profile loader
│   └── emotional_events.py      # Event logging (optional)
├── routers/
│   ├── emotional.py             # Debug/tuning endpoints
│   ├── designer.py              # Agent Designer admin API
│   └── chat.py                  # Main chat flow (integrates emotion)
├── tests/
│   └── test_emotion_engine.py   # Unit tests (98 passing)
│
frontend/designer/               # Agent Designer admin UI
├── src/
│   ├── components/
│   │   ├── MoodSlider.tsx       # Single mood slider (0-10)
│   │   ├── MoodBaselineEditor.tsx  # Grid of 16 sliders
│   │   ├── TriggerMoodEditor.tsx   # Edit trigger→mood mappings
│   │   └── AgentCard.tsx        # Agent preview card
│   └── routes/
│       ├── index.tsx            # Dashboard
│       ├── agents.$agentId.tsx  # Agent editor
│       └── relationships.$type.tsx  # Relationship editor
│
configs/
├── moods.json                   # Mood definitions (static)
└── relationships/
    ├── friend.json              # trigger_mood_map templates
    └── romantic.json
```

---

## Core Classes

### AgentProfile (from DB)

```python
@dataclass
class AgentProfile:
    """Agent's emotional personality configuration."""
    baseline_valence: float = 0.2
    baseline_arousal: float = 0.0
    baseline_dominance: float = 0.0
    emotional_volatility: float = 0.5
    emotional_recovery: float = 0.1
    
    # From emotional_profile JSON column
    decay_rates: dict = field(default_factory=dict)
    trust_gain_multiplier: float = 1.0
    trust_loss_multiplier: float = 1.0
    attachment_ceiling: float = 1.0
    trigger_multipliers: dict = field(default_factory=dict)
    play_trust_threshold: float = 0.7
    mood_baseline: dict = field(default_factory=dict)  # 16-mood weights
    mood_decay_rate: float = 0.3

    @classmethod
    def from_db(cls, agent_row: dict, profile_json: dict) -> 'AgentProfile':
        """Load from database row + emotional_profile JSON."""
        return cls(
            baseline_valence=agent_row.get('baseline_valence') or 0.2,
            baseline_arousal=agent_row.get('baseline_arousal') or 0.0,
            baseline_dominance=agent_row.get('baseline_dominance') or 0.0,
            emotional_volatility=agent_row.get('emotional_volatility') or 0.5,
            emotional_recovery=agent_row.get('emotional_recovery') or 0.1,
            decay_rates=profile_json.get('decay_rates', {}),
            trust_gain_multiplier=profile_json.get('trust_gain_multiplier', 1.0),
            trust_loss_multiplier=profile_json.get('trust_loss_multiplier', 1.0),
            attachment_ceiling=profile_json.get('attachment_ceiling', 1.0),
            trigger_multipliers=profile_json.get('trigger_multipliers', {}),
            play_trust_threshold=profile_json.get('play_trust_threshold', 0.7),
            mood_baseline=profile_json.get('mood_baseline', {}),
            mood_decay_rate=profile_json.get('mood_decay_rate', 0.3),
        )
```

### EmotionalState (per user-agent pair)

```python
@dataclass
class EmotionalState:
    """Snapshot of emotional state."""
    valence: float = 0.0
    arousal: float = 0.0
    dominance: float = 0.0
    trust: float = 0.5
    attachment: float = 0.3
    familiarity: float = 0.0
    mood_weights: dict = field(default_factory=dict)  # Current 16-mood state
```

---

## Designer API

The Agent Designer admin UI reads/writes to SQLite via these endpoints:

```python
# backend/routers/designer.py

GET  /api/designer/moods              # List 16 mood definitions
GET  /api/designer/agents             # List all agents
GET  /api/designer/agents/{id}        # Get agent with mood_baseline
PUT  /api/designer/agents/{id}        # Update agent (saves to emotional_profile)
POST /api/designer/agents             # Create agent
DEL  /api/designer/agents/{id}        # Delete agent

GET  /api/designer/relationships      # List relationship types
GET  /api/designer/relationships/{t}  # Get relationship config
PUT  /api/designer/relationships/{t}  # Update (writes JSON file)
```

---

## Chat Integration Flow

```python
# backend/routers/chat.py

async def _process_emotion_pre_llm(user_id, agent_id, user_message, session_id):
    """
    1. Load emotional state from DB
    2. Load agent profile from DB (emotional_profile column)
    3. Apply time-based decay
    4. Detect triggers from user message
    5. Apply trigger deltas using trigger_mood_map
    6. Compute mood weights from mood_baseline + deltas
    7. Return emotional context for prompt injection
    """
    
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    profile_data = EmotionalStateRepository.get_agent_profile(agent_id)
    agent = AgentRepository.get_by_id(agent_id)
    
    # Build profile from DB
    profile = AgentProfile.from_db(agent, profile_data)
    engine = EmotionEngine(profile)
    
    # Load current state
    state = EmotionalState.from_dict(state_row)
    
    # Apply decay
    elapsed = time.time() - state_row.get('last_updated', 0)
    state = engine.apply_decay(state, elapsed)
    engine.apply_mood_decay(state, elapsed)
    
    # Detect and apply triggers
    triggers = engine.detect_triggers(user_message)
    trigger_mood_map = get_trigger_mood_map(relationship_type)
    
    for trigger, intensity in triggers:
        engine.apply_trigger(state, trigger, intensity, trigger_mood_map)
    
    # Save and return context
    EmotionalStateRepository.update(user_id, agent_id, state)
    return engine.get_emotional_context(state)
```

---

## Running the Designer

```bash
# Terminal 1: Backend (existing FastAPI app)
cd backend && source .venv/bin/activate
python -m uvicorn main:app --reload --port 8080

# Terminal 2: Designer frontend
cd frontend/designer && npm run dev
# → http://localhost:3002
```

---

## Testing

```bash
# Run all emotion tests
cd backend && python -m pytest tests/test_emotion_engine.py -v

# 98 tests passing as of 2026-02-08
```

---

## Migration from JSON Files

If you have existing JSON configs in `configs/agents/`, run the migration script:

```bash
cd backend
python -m scripts.migrate_agent_configs
```

This reads `configs/agents/*.json` and merges them into the `emotional_profile` column.

---

## Notes

- **Agents**: SQLite is the single source of truth
- **Relationships**: JSON files (templates shared across agents)
- **Moods**: Static definitions in `configs/moods.json`
- **Cache**: Relationship configs use LRU cache, cleared on save via Designer
