# Emotion Tuning Phase 2 — LLM Detection + Profiles

**Date:** 2026-02-08  
**Status:** In Progress

---

## Goals

1. **LLM trigger detection** — Replace regex with LLM for nuanced trigger + intensity detection
2. **Mock dialogue docs** — Test scenarios (angry, neutral, loving, etc.)
3. **Agent personality profiles** — Rem, Ram, Beatrice with distinct baselines
4. **Relationship configs** — Friend vs Romantic modifiers
5. **Config files** — Not hardcoded, loadable JSON profiles

---

## 1. LLM Trigger Detection

### Current (Regex)
```python
TRIGGER_PATTERNS = {
    'compliment': [r'\b(amazing|wonderful|great)\b'],
    ...
}
# Returns: [('compliment', 0.7)]  # Fixed intensity
```

### New (LLM)
```python
async def detect_triggers_llm(message: str, context: str = "") -> list[tuple[str, float]]:
    """
    Use LLM to detect emotional triggers with nuanced intensity.
    
    Returns: [('compliment', 0.85), ('gratitude', 0.6)]
    """
```

### LLM Prompt Template
```
Analyze this message for emotional triggers.

Message: "{message}"

Detect which triggers are present and their intensity (0.0-1.0):
- compliment, criticism, gratitude, rejection, teasing, comfort, conflict, 
  apology, repair, dismissal, affirmation, vulnerability, greeting, farewell

Return JSON: [{"trigger": "name", "intensity": 0.0-1.0}]
Only include triggers actually present. Be nuanced about intensity.

Examples:
"You're the best!" → [{"trigger": "compliment", "intensity": 0.9}]
"That's okay I guess" → [{"trigger": "affirmation", "intensity": 0.3}]
"I HATE YOU" → [{"trigger": "conflict", "intensity": 1.0}, {"trigger": "rejection", "intensity": 0.9}]
```

### Implementation Location
- `backend/services/emotion_engine.py` — add `detect_triggers_llm()` method
- Config flag: `use_llm_triggers: bool` to toggle
- Fallback to regex if LLM fails

---

## 2. Mock Dialogue Test Docs

Create test scenarios in `scripts/dialogues/`:

### Scenario Files

| File | Description |
|------|-------------|
| `angry_exchange.json` | Escalating conflict, harsh words |
| `loving_exchange.json` | Affection, compliments, intimacy |
| `neutral_chat.json` | Casual, no strong emotions |
| `mixed_chaotic.json` | Mood swings, unpredictable |
| `trust_crisis.json` | Betrayal → repair sequence |
| `slow_burn.json` | Gradual warmth over many turns |

### Format
```json
{
  "name": "Angry Exchange",
  "description": "Tests conflict handling and trust damage",
  "messages": [
    {"role": "user", "content": "Why didn't you help me earlier?"},
    {"role": "user", "content": "You're useless sometimes"},
    {"role": "user", "content": "Whatever, forget it"},
    {"role": "user", "content": "I'm sorry, I didn't mean that"},
    {"role": "user", "content": "Can we start over?"}
  ],
  "expected_trajectory": {
    "valence": "drops, then recovers",
    "trust": "drops significantly, slow recovery"
  }
}
```

---

## 3. Agent Personality Profiles

### Directory Structure
```
configs/
  agents/
    rem.json
    ram.json
    beatrice.json
  relationships/
    friend.json
    romantic.json
```

### Profile Schema
```json
{
  "name": "Rem",
  "description": "Devoted, expressive, quick to warm up",
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
    "trust": 0.05
  },
  "trust": {
    "gain_multiplier": 1.3,
    "loss_multiplier": 0.7
  },
  "attachment_ceiling": 1.0,
  "play_trust_threshold": 0.6,
  "trigger_multipliers": {
    "compliment": 1.5,
    "affirmation": 1.4,
    "rejection": 1.3,
    "comfort": 1.2
  }
}
```

### Profiles

| Agent | Baseline Valence | Volatility | Trust Gain | Key Trait |
|-------|------------------|------------|------------|-----------|
| **Rem** | +0.3 (warm) | 1.2 (expressive) | 1.3x | Devoted, forgiving |
| **Ram** | 0.0 (neutral) | 0.6 (stoic) | 0.5x | Proud, holds grudges |
| **Beatrice** | +0.1 (guarded) | 0.9 (tsundere) | 0.7x | Defensive, secretly caring |

---

## 4. Relationship Configs

### Friend Config (`configs/relationships/friend.json`)
```json
{
  "type": "friend",
  "modifiers": {
    "attachment_ceiling": 0.7,
    "trust_baseline": 0.4,
    "trust_gain_multiplier": 1.0,
    "jealousy_enabled": false,
    "longing_enabled": false
  },
  "behaviors": {
    "pet_names": false,
    "physical_affection": "casual",
    "flirt_response": "deflect",
    "absence_reaction": "casual"
  }
}
```

### Romantic Config (`configs/relationships/romantic.json`)
```json
{
  "type": "romantic",
  "modifiers": {
    "attachment_ceiling": 0.95,
    "trust_baseline": 0.5,
    "trust_gain_multiplier": 0.9,
    "jealousy_enabled": true,
    "longing_enabled": true
  },
  "behaviors": {
    "pet_names": true,
    "physical_affection": "intimate",
    "flirt_response": "reciprocate",
    "absence_reaction": "longing"
  }
}
```

---

## 5. Implementation Tasks

### For Claude CLI

**Task 1: LLM Trigger Detection**
1. Add `detect_triggers_llm()` to `emotion_engine.py`
2. Add config flag `use_llm_triggers` to settings
3. Update `_process_emotion_pre_llm()` to use LLM when enabled
4. Add fallback to regex on failure
5. Test with mock dialogues

**Task 2: Config Loader**
1. Create `configs/agents/` and `configs/relationships/` directories
2. Create `backend/services/config_loader.py`
3. Implement `load_agent_profile(name)` and `load_relationship_config(type)`
4. Update `EmotionEngine` to load from configs

**Task 3: Mock Dialogues**
1. Create `scripts/dialogues/` directory
2. Create 5+ scenario files
3. Create `scripts/test-dialogues.py` runner
4. Run each dialogue through engine, log trajectory

**Task 4: Profile Tuning**
1. Create Rem, Ram, Beatrice JSON profiles
2. Create friend, romantic relationship configs
3. Run comparison tests
4. Tune values based on results

---

## 6. Future Frontend (Design Notes)

### Agent Designer UI
- Load/save agent profiles
- Visual sliders for volatility, baselines, decay rates
- Trigger multiplier editor
- Preview: "How would this agent react to [input]?"

### Simulator UI
- Select agent + relationship type
- Input messages or load dialogue file
- Real-time emotional state graph
- Side-by-side agent comparison

### Debug/Tune Endpoints
- Already have: `/api/debug/emotional-*`
- Add: `/api/debug/run-dialogue` — run a dialogue file, return trajectory

---

## Timeline

| Phase | Task | Time |
|-------|------|------|
| 2a | LLM trigger detection | ~1 hour |
| 2b | Config loader + profiles | ~1 hour |
| 2c | Mock dialogues + runner | ~30 min |
| 2d | Comparison testing | ~30 min |

Total: ~3 hours

---

## Claude CLI Prompt

```
Read docs/planning/EMOTION-TUNING-PHASE2.md

Implement in order:

1. Create configs/agents/ and configs/relationships/ directories
2. Create JSON profile files for Rem, Ram, Beatrice
3. Create friend.json and romantic.json relationship configs
4. Create backend/services/config_loader.py with load functions
5. Add detect_triggers_llm() to emotion_engine.py
6. Add LLM_TRIGGER_DETECTION config to settings
7. Update _process_emotion_pre_llm() to use LLM when enabled
8. Create scripts/dialogues/ with test scenario files
9. Create scripts/test-dialogues.py to run scenarios
10. Run tests, commit each logical chunk

Use existing patterns from the codebase. Check backend/config.py for settings pattern.
```
