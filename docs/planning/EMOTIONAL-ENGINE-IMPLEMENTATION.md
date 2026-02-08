# Emotional Engine — Implementation Spec

**Status:** Ready for implementation  
**Parent:** [EMOTIONAL-ENGINE.md](./EMOTIONAL-ENGINE.md)  
**Date:** 2026-02-08

---

## Overview

This document specifies the implementation details for the emotional engine. Read the parent doc for design rationale.

---

## File Structure

```
backend/
├── services/
│   └── emotion_engine.py        # Core engine class
├── db/repositories/
│   ├── emotional_state.py       # State CRUD + decay logic
│   └── emotional_events.py      # Event logging
├── routers/
│   └── emotional.py             # Debug/admin endpoints (optional)
├── tests/
│   └── test_emotion_engine.py   # Unit tests
│
scripts/
├── test-emotion-scenarios.py    # Scenario runner
└── scenarios/                   # Test scenario files
    ├── basic_conversation.json
    ├── conflict_and_repair.json
    ├── trust_building.json
    └── drift_test.json
```

---

## Core Classes

### EmotionEngine (backend/services/emotion_engine.py)

```python
from dataclasses import dataclass
from typing import Optional
import time
import json

@dataclass
class EmotionalState:
    """Current emotional state snapshot."""
    valence: float = 0.0
    arousal: float = 0.0
    dominance: float = 0.0
    trust: float = 0.5
    attachment: float = 0.3
    familiarity: float = 0.0
    
    # Inferred user state
    inferred_user_valence: float = 0.0
    inferred_user_arousal: float = 0.0
    
    # Relationship
    relationship_type: str = 'companion'
    
    # Metadata
    last_updated: float = 0.0
    interaction_count: int = 0

@dataclass  
class AgentProfile:
    """Agent's emotional personality."""
    # Baseline (columns)
    baseline_valence: float = 0.2
    baseline_arousal: float = 0.0
    baseline_dominance: float = 0.0
    emotional_volatility: float = 0.5
    emotional_recovery: float = 0.1
    
    # Extended config (from JSON)
    decay_rates: dict = None
    trust_gain_multiplier: float = 1.0
    trust_loss_multiplier: float = 1.0
    attachment_ceiling: float = 1.0
    trigger_multipliers: dict = None
    play_trust_threshold: float = 0.7

class EmotionEngine:
    """Core emotional processing engine."""
    
    # Default trigger -> delta mappings
    DEFAULT_TRIGGER_DELTAS = {
        'compliment': {'valence': 0.15, 'arousal': 0.05, 'trust': 0.02},
        'affirmation': {'valence': 0.10, 'arousal': 0.03, 'trust': 0.03},
        'rejection': {'valence': -0.20, 'arousal': 0.10, 'trust': -0.05},
        'teasing': {'valence': 0.05, 'arousal': 0.10, 'trust': 0.01},
        'conflict': {'valence': -0.25, 'arousal': 0.30, 'trust': -0.10},
        'comfort': {'valence': 0.20, 'arousal': -0.10, 'trust': 0.05},
        'gratitude': {'valence': 0.12, 'arousal': 0.05, 'trust': 0.02},
        'apology': {'valence': 0.08, 'arousal': -0.05, 'trust': 0.03},
        'dismissal': {'valence': -0.10, 'arousal': -0.05, 'trust': -0.02},
        'curiosity': {'valence': 0.05, 'arousal': 0.08, 'trust': 0.01},
        'shared_joy': {'valence': 0.18, 'arousal': 0.15, 'trust': 0.02, 'attachment': 0.02},
        'vulnerability': {'valence': 0.05, 'arousal': 0.05, 'trust': 0.05, 'attachment': 0.03},
    }
    
    def __init__(self, profile: AgentProfile):
        self.profile = profile
    
    def apply_decay(self, state: EmotionalState, elapsed_seconds: float) -> EmotionalState:
        """Apply temporal decay toward baseline."""
        # Implementation here
        pass
    
    def detect_triggers(self, user_message: str, assistant_response: str) -> list[tuple[str, float]]:
        """Detect emotional triggers from messages. Returns [(trigger, intensity), ...]"""
        # Implementation here
        pass
    
    def apply_trigger(self, state: EmotionalState, trigger: str, intensity: float) -> dict:
        """Apply a trigger and return deltas applied."""
        # Implementation here
        pass
    
    def apply_trust_delta(self, current: float, delta: float) -> float:
        """Apply asymmetric trust change."""
        # Implementation here
        pass
    
    def get_behavior_levers(self, state: EmotionalState) -> dict:
        """Convert state to LLM-injectable behavior levers."""
        # Returns: {warmth: 0.7, playfulness: 0.4, guardedness: 0.2}
        pass
    
    def get_novelty_multiplier(self, trigger: str, user_id: str, agent_id: str) -> float:
        """Get novelty multiplier based on trigger frequency."""
        pass
    
    def check_play_context(self, trigger: str, trust: float) -> float:
        """Adjust trigger delta for play context (teasing at high trust)."""
        pass
```

---

## Repository Layer

### EmotionalStateRepository (backend/db/repositories/emotional_state.py)

```python
class EmotionalStateRepository:
    
    @staticmethod
    def get_or_create(user_id: str, agent_id: str) -> dict:
        """Get current state or create default."""
        pass
    
    @staticmethod
    def update(user_id: str, agent_id: str, **fields) -> None:
        """Update state fields."""
        pass
    
    @staticmethod
    def get_agent_profile(agent_id: str) -> AgentProfile:
        """Load agent's baseline + emotional_profile JSON."""
        pass
    
    @staticmethod
    def increment_trigger_count(user_id: str, agent_id: str, trigger: str, window: str) -> int:
        """Increment and return trigger count for novelty calculation."""
        pass
```

### EmotionalEventsRepository (backend/db/repositories/emotional_events.py)

```python
class EmotionalEventsRepository:
    
    @staticmethod
    def log_event(
        user_id: str,
        agent_id: str,
        session_id: str,
        trigger_type: str,
        trigger_value: str,
        deltas: dict,
        state_after: dict
    ) -> None:
        """Log an emotional event for debugging."""
        pass
    
    @staticmethod
    def get_recent(user_id: str, agent_id: str, limit: int = 50) -> list[dict]:
        """Get recent events for debugging."""
        pass
```

---

## Integration Points

### Chat Flow Integration (backend/routers/chat.py)

```python
from services.emotion_engine import EmotionEngine

async def _process_with_emotion(
    user_message: str,
    user_id: str,
    agent_id: str,
    session_id: str
) -> tuple[str, dict]:
    """
    Called BEFORE and AFTER LLM.
    
    Before:
    1. Load emotional state
    2. Apply time-based decay
    3. Detect triggers from user message
    4. Apply trigger deltas
    5. Get behavior levers for LLM prompt injection
    
    After:
    1. Parse behavior tags from response
    2. Apply any self-reported mood shifts
    3. Log events
    4. Save updated state
    """
    
    # Load state and profile
    state = EmotionalStateRepository.get_or_create(user_id, agent_id)
    profile = EmotionalStateRepository.get_agent_profile(agent_id)
    engine = EmotionEngine(profile)
    
    # Apply decay since last interaction
    elapsed = time.time() - state['last_updated']
    state = engine.apply_decay(state, elapsed)
    
    # Detect triggers from user message
    triggers = engine.detect_triggers(user_message, None)
    
    # Apply triggers
    for trigger, intensity in triggers:
        deltas = engine.apply_trigger(state, trigger, intensity)
        EmotionalEventsRepository.log_event(
            user_id, agent_id, session_id,
            'user_message', trigger, deltas, state
        )
    
    # Get behavior levers for prompt
    levers = engine.get_behavior_levers(state)
    
    # Save pre-LLM state
    EmotionalStateRepository.update(user_id, agent_id, **state)
    
    return levers


def inject_emotional_context(levers: dict) -> str:
    """Generate emotional context block for LLM prompt."""
    return f"""[EMOTIONAL_CONTEXT]
warmth: {levers['warmth']:.2f}
playfulness: {levers['playfulness']:.2f}
guardedness: {levers['guardedness']:.2f}
[/EMOTIONAL_CONTEXT]"""
```

---

## Trigger Detection

### Simple Classifier (Phase 1)

Start with keyword/pattern matching:

```python
TRIGGER_PATTERNS = {
    'compliment': [
        r'\b(amazing|wonderful|great|awesome|love you|proud of you)\b',
        r'\b(you.re|you are) (so |really )?(smart|kind|sweet|beautiful)\b',
    ],
    'rejection': [
        r'\b(don.t care|leave me alone|go away|shut up)\b',
        r'\b(hate|can.t stand) you\b',
    ],
    'gratitude': [
        r'\b(thank you|thanks|appreciate)\b',
    ],
    'teasing': [
        r'\b(haha|lol|just kidding|tease|dummy|silly)\b',
    ],
    'conflict': [
        r'\b(angry|upset|furious|how could you|why did you)\b',
    ],
    'comfort': [
        r'\b(it.s okay|don.t worry|i.m here|there there)\b',
    ],
}

def detect_triggers(text: str) -> list[tuple[str, float]]:
    """Simple pattern-based trigger detection."""
    triggers = []
    text_lower = text.lower()
    
    for trigger, patterns in TRIGGER_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                triggers.append((trigger, 0.7))  # Default intensity
                break
    
    return triggers
```

### LLM-Enhanced Detection (Phase 2)

Parse behavior tags from assistant response:

```python
def detect_from_response(response: str, behavior: dict) -> list[tuple[str, float]]:
    """Extract triggers from LLM response behavior tags."""
    triggers = []
    
    if behavior.get('mood'):
        mood = behavior['mood']
        intensity = behavior.get('mood_intensity', 0.7)
        
        mood_to_trigger = {
            'happy': ('shared_joy', intensity),
            'sad': ('empathy_needed', intensity),
            'embarrassed': ('vulnerability', intensity * 0.5),
            'angry': ('conflict', intensity),
        }
        
        if mood in mood_to_trigger:
            triggers.append(mood_to_trigger[mood])
    
    return triggers
```

---

## Testing Framework

### Unit Tests (backend/tests/test_emotion_engine.py)

```python
import pytest
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile

class TestEmotionEngine:
    
    @pytest.fixture
    def default_profile(self):
        return AgentProfile()
    
    @pytest.fixture
    def default_state(self):
        return EmotionalState()
    
    def test_decay_toward_baseline(self, default_profile, default_state):
        """State should decay toward baseline over time."""
        engine = EmotionEngine(default_profile)
        
        # Set state away from baseline
        default_state.valence = 0.8
        
        # Apply decay (1 hour)
        new_state = engine.apply_decay(default_state, 3600)
        
        # Should be closer to baseline (0.2)
        assert new_state.valence < 0.8
        assert new_state.valence > default_profile.baseline_valence
    
    def test_compliment_increases_valence(self, default_profile, default_state):
        """Compliment trigger should increase valence."""
        engine = EmotionEngine(default_profile)
        
        initial_valence = default_state.valence
        engine.apply_trigger(default_state, 'compliment', 0.8)
        
        assert default_state.valence > initial_valence
    
    def test_trust_asymmetry(self, default_profile, default_state):
        """Negative trust changes should be larger than positive."""
        engine = EmotionEngine(default_profile)
        
        # Positive change
        trust_after_positive = engine.apply_trust_delta(0.5, +0.1)
        positive_delta = trust_after_positive - 0.5
        
        # Negative change
        trust_after_negative = engine.apply_trust_delta(0.5, -0.1)
        negative_delta = 0.5 - trust_after_negative
        
        # Negative should be larger magnitude
        assert abs(negative_delta) > abs(positive_delta)
    
    def test_volatility_scaling(self):
        """High volatility agents should have larger deltas."""
        low_vol = AgentProfile(emotional_volatility=0.5)
        high_vol = AgentProfile(emotional_volatility=1.5)
        
        state_low = EmotionalState()
        state_high = EmotionalState()
        
        EmotionEngine(low_vol).apply_trigger(state_low, 'compliment', 0.8)
        EmotionEngine(high_vol).apply_trigger(state_high, 'compliment', 0.8)
        
        assert state_high.valence > state_low.valence
    
    def test_play_context_flips_teasing(self, default_profile):
        """Teasing should be positive at high trust."""
        engine = EmotionEngine(default_profile)
        
        low_trust_state = EmotionalState(trust=0.3, valence=0.0)
        high_trust_state = EmotionalState(trust=0.8, valence=0.0)
        
        engine.apply_trigger(low_trust_state, 'teasing', 0.7)
        engine.apply_trigger(high_trust_state, 'teasing', 0.7)
        
        # Low trust: teasing hurts
        # High trust: teasing is bonding
        assert high_trust_state.valence > low_trust_state.valence
    
    def test_state_bounds(self, default_profile, default_state):
        """State values should stay within bounds."""
        engine = EmotionEngine(default_profile)
        
        # Apply many positive triggers
        for _ in range(100):
            engine.apply_trigger(default_state, 'compliment', 1.0)
        
        assert -1.0 <= default_state.valence <= 1.0
        assert -1.0 <= default_state.arousal <= 1.0
        assert 0.0 <= default_state.trust <= 1.0
```

### Scenario Tests (scripts/test-emotion-scenarios.py)

```python
#!/usr/bin/env python3
"""
Run emotional scenario tests.
Usage: python scripts/test-emotion-scenarios.py [scenario_name]
"""

import json
import sys
from pathlib import Path

def run_scenario(scenario_path: Path) -> dict:
    """Run a scenario and return results."""
    with open(scenario_path) as f:
        scenario = json.load(f)
    
    # Initialize engine with agent profile
    profile = AgentProfile(**scenario['agent_profile'])
    engine = EmotionEngine(profile)
    state = EmotionalState(**scenario.get('initial_state', {}))
    
    results = {
        'scenario': scenario['name'],
        'steps': [],
        'passed': True,
        'failures': []
    }
    
    for step in scenario['steps']:
        # Simulate time passage
        if 'wait_seconds' in step:
            state = engine.apply_decay(state, step['wait_seconds'])
        
        # Apply triggers
        if 'triggers' in step:
            for trigger, intensity in step['triggers']:
                engine.apply_trigger(state, trigger, intensity)
        
        # Check assertions
        if 'assert' in step:
            for assertion in step['assert']:
                field = assertion['field']
                actual = getattr(state, field)
                
                if 'min' in assertion and actual < assertion['min']:
                    results['passed'] = False
                    results['failures'].append(f"{field} = {actual} < {assertion['min']}")
                
                if 'max' in assertion and actual > assertion['max']:
                    results['passed'] = False
                    results['failures'].append(f"{field} = {actual} > {assertion['max']}")
        
        results['steps'].append({
            'description': step.get('description', ''),
            'state': state.__dict__.copy()
        })
    
    return results

if __name__ == '__main__':
    scenarios_dir = Path('scripts/scenarios')
    
    if len(sys.argv) > 1:
        scenarios = [scenarios_dir / f"{sys.argv[1]}.json"]
    else:
        scenarios = list(scenarios_dir.glob('*.json'))
    
    all_passed = True
    for scenario_path in scenarios:
        result = run_scenario(scenario_path)
        status = '✓' if result['passed'] else '✗'
        print(f"{status} {result['scenario']}")
        
        if not result['passed']:
            all_passed = False
            for failure in result['failures']:
                print(f"  - {failure}")
    
    sys.exit(0 if all_passed else 1)
```

### Example Scenario File (scripts/scenarios/basic_conversation.json)

```json
{
  "name": "Basic Conversation - Compliments and Normal Chat",
  "agent_profile": {
    "baseline_valence": 0.2,
    "emotional_volatility": 1.0,
    "emotional_recovery": 0.1
  },
  "initial_state": {
    "valence": 0.2,
    "arousal": 0.0,
    "trust": 0.5
  },
  "steps": [
    {
      "description": "User gives a compliment",
      "triggers": [["compliment", 0.8]],
      "assert": [
        {"field": "valence", "min": 0.3, "max": 0.6}
      ]
    },
    {
      "description": "Normal conversation (no trigger)",
      "wait_seconds": 300
    },
    {
      "description": "Another compliment",
      "triggers": [["compliment", 0.7]],
      "assert": [
        {"field": "valence", "min": 0.35, "max": 0.7}
      ]
    },
    {
      "description": "Wait 1 hour - should decay toward baseline",
      "wait_seconds": 3600,
      "assert": [
        {"field": "valence", "min": 0.2, "max": 0.5}
      ]
    },
    {
      "description": "Trust should have grown slightly",
      "assert": [
        {"field": "trust", "min": 0.52, "max": 0.58}
      ]
    }
  ]
}
```

### Drift Test Scenario (scripts/scenarios/drift_test.json)

```json
{
  "name": "Drift Test - Return to Baseline",
  "agent_profile": {
    "baseline_valence": 0.2,
    "baseline_arousal": 0.0,
    "emotional_recovery": 0.1
  },
  "initial_state": {
    "valence": 0.8,
    "arousal": 0.5
  },
  "steps": [
    {
      "description": "Wait 10 minutes",
      "wait_seconds": 600,
      "assert": [
        {"field": "valence", "min": 0.5, "max": 0.8}
      ]
    },
    {
      "description": "Wait 1 hour",
      "wait_seconds": 3600,
      "assert": [
        {"field": "valence", "min": 0.3, "max": 0.6}
      ]
    },
    {
      "description": "Wait 6 hours - should be near baseline",
      "wait_seconds": 21600,
      "assert": [
        {"field": "valence", "min": 0.15, "max": 0.35},
        {"field": "arousal", "min": -0.1, "max": 0.15}
      ]
    }
  ]
}
```

---

## Seed Data

### Test Agents (add to backend/db/seed.py)

```python
TEST_AGENTS = [
    {
        "id": "test-rem",
        "display_name": "Test Rem",
        "baseline_valence": 0.3,
        "baseline_arousal": 0.1,
        "baseline_dominance": -0.2,
        "emotional_volatility": 1.2,
        "emotional_recovery": 0.12,
        "emotional_profile": json.dumps({
            "trust_gain_multiplier": 1.3,
            "trust_loss_multiplier": 0.7,
            "attachment_ceiling": 0.95,
            "trigger_multipliers": {"compliment": 1.5}
        })
    },
    {
        "id": "test-ram",
        "display_name": "Test Ram", 
        "baseline_valence": 0.0,
        "baseline_arousal": -0.1,
        "baseline_dominance": 0.3,
        "emotional_volatility": 0.6,
        "emotional_recovery": 0.08,
        "emotional_profile": json.dumps({
            "trust_gain_multiplier": 0.5,
            "trust_loss_multiplier": 1.8,
            "attachment_ceiling": 0.7,
            "trigger_multipliers": {"compliment": 0.6, "rejection": 1.5}
        })
    },
    {
        "id": "test-beatrice",
        "display_name": "Test Beatrice",
        "baseline_valence": 0.1,
        "baseline_arousal": 0.0,
        "baseline_dominance": 0.2,
        "emotional_volatility": 0.9,
        "emotional_recovery": 0.15,
        "emotional_profile": json.dumps({
            "trust_gain_multiplier": 0.4,
            "trust_loss_multiplier": 1.2,
            "trigger_multipliers": {"compliment": 0.3, "teasing": 1.5}
        })
    }
]
```

---

## Convergence Criteria

The implementation is "done" when:

| Test | Criteria |
|------|----------|
| Decay to baseline | After 6h no interaction, state within ±0.1 of baseline |
| Compliment effect | Valence increases 0.10-0.25 per compliment |
| Trust growth | ~0.02-0.04 per positive interaction |
| Trust asymmetry | Negative trust delta 1.5-2x magnitude of positive |
| Volatility scaling | High-vol agent has 2x state change vs low-vol |
| Bounds respected | All axes stay in valid ranges after 100 triggers |
| Play context | Teasing positive at trust > 0.7, negative at < 0.4 |
| Scenario tests | All scenario JSON files pass |

---

## API Endpoints (Optional Debug UI)

```python
# backend/routers/emotional.py

@router.get("/api/debug/emotional-state/{user_id}/{agent_id}")
async def get_emotional_state(user_id: str, agent_id: str):
    """Get current emotional state (debug only)."""
    state = EmotionalStateRepository.get_or_create(user_id, agent_id)
    return state

@router.get("/api/debug/emotional-events/{user_id}/{agent_id}")
async def get_emotional_events(user_id: str, agent_id: str, limit: int = 50):
    """Get recent emotional events (debug only)."""
    events = EmotionalEventsRepository.get_recent(user_id, agent_id, limit)
    return {"events": events}

@router.post("/api/debug/emotional-trigger")
async def apply_test_trigger(user_id: str, agent_id: str, trigger: str, intensity: float = 0.7):
    """Manually apply a trigger (debug only)."""
    # Implementation
    pass
```

---

## Notes for Implementation

1. **Start simple** — Pattern matching for triggers, basic decay formula
2. **Log everything** — Every event goes to emotional_events for debugging
3. **Test-driven** — Write scenario tests first, then implement to pass them
4. **No frontend yet** — Backend only in Phase 1
5. **Don't integrate with chat yet** — Test engine in isolation first
