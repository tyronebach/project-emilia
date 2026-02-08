# Claude CLI Task — Emotion Engine Phase 2

## Read First
1. `docs/planning/EMOTION-TUNING-PHASE2.md` — full spec
2. `backend/services/emotion_engine.py` — current implementation
3. `backend/config.py` — settings pattern
4. `configs/agents/*.json` — agent profiles (already created)
5. `configs/relationships/*.json` — relationship configs (already created)
6. `scripts/dialogues/*.json` — test scenarios (already created)

## Tasks

### Task 1: Config Loader Service

Create `backend/services/config_loader.py`:

```python
"""Load agent profiles and relationship configs from JSON files."""
import json
from pathlib import Path
from functools import lru_cache

CONFIGS_DIR = Path(__file__).parent.parent.parent / "configs"

@lru_cache(maxsize=10)
def load_agent_profile(name: str) -> dict:
    """Load agent profile from configs/agents/{name}.json"""
    path = CONFIGS_DIR / "agents" / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

@lru_cache(maxsize=5)  
def load_relationship_config(relationship_type: str) -> dict:
    """Load relationship config from configs/relationships/{type}.json"""
    path = CONFIGS_DIR / "relationships" / f"{relationship_type}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

def clear_config_cache():
    """Clear cached configs (useful for hot reload during dev)."""
    load_agent_profile.cache_clear()
    load_relationship_config.cache_clear()
```

### Task 2: LLM Trigger Detection

Add to `backend/services/emotion_engine.py`:

```python
import httpx
from config import settings

async def detect_triggers_llm(message: str, context: str = "") -> list[tuple[str, float]]:
    """
    Use LLM to detect emotional triggers with nuanced intensity.
    Falls back to regex on failure.
    """
    if not settings.llm_trigger_detection:
        return []  # Use regex fallback
    
    prompt = f'''Analyze this message for emotional triggers.

Message: "{message}"

Detect which triggers are present and their intensity (0.0-1.0):
compliment, criticism, gratitude, rejection, teasing, comfort, conflict, 
apology, repair, dismissal, affirmation, vulnerability, greeting, farewell

Return ONLY a JSON array: [{{"trigger": "name", "intensity": 0.0-1.0}}]
Only include triggers actually present. Be nuanced about intensity.
If no triggers detected, return: []'''

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.clawdbot_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.clawdbot_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",  # Fast, cheap model for trigger detection
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 200,
                }
            )
            
            if response.status_code != 200:
                return []
            
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            # Parse JSON from response
            import re
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                triggers = json.loads(json_match.group())
                return [(t["trigger"], t["intensity"]) for t in triggers]
            
            return []
            
    except Exception:
        return []  # Fallback to regex
```

### Task 3: Settings Update

Add to `backend/config.py` in Settings class:

```python
# Emotional Engine
self.llm_trigger_detection: bool = os.getenv("LLM_TRIGGER_DETECTION", "0") == "1"
```

### Task 4: Update Emotion Pre-LLM Processing

In `backend/routers/chat.py`, update `_process_emotion_pre_llm()`:

```python
# Replace the regex trigger detection with:
if settings.llm_trigger_detection:
    import asyncio
    from services.emotion_engine import detect_triggers_llm
    
    # Run async LLM detection
    triggers = asyncio.get_event_loop().run_until_complete(
        detect_triggers_llm(user_message)
    )
    
    # Fallback to regex if LLM returns nothing
    if not triggers:
        triggers = engine.detect_triggers(user_message)
else:
    triggers = engine.detect_triggers(user_message)
```

### Task 5: Dialogue Test Runner

Create `scripts/test-dialogues.py`:

```python
#!/usr/bin/env python3
"""Run dialogue scenarios through emotion engine and log trajectories."""

import json
import sys
from pathlib import Path

# Import emotion engine (same pattern as emotion-lab.py)
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "emotion_engine",
    Path(__file__).parent.parent / "backend" / "services" / "emotion_engine.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
EmotionEngine = _module.EmotionEngine
EmotionalState = _module.EmotionalState
AgentProfile = _module.AgentProfile

DIALOGUES_DIR = Path(__file__).parent / "dialogues"
CONFIGS_DIR = Path(__file__).parent.parent / "configs"

def load_agent_profile(name: str) -> AgentProfile:
    """Load profile from config file."""
    path = CONFIGS_DIR / "agents" / f"{name}.json"
    if not path.exists():
        return AgentProfile()
    
    with open(path) as f:
        data = json.load(f)
    
    return AgentProfile(
        baseline_valence=data.get("baseline", {}).get("valence", 0.2),
        baseline_arousal=data.get("baseline", {}).get("arousal", 0.0),
        baseline_dominance=data.get("baseline", {}).get("dominance", 0.0),
        emotional_volatility=data.get("volatility", 0.5),
        emotional_recovery=data.get("recovery", 0.1),
        decay_rates=data.get("decay_rates", {}),
        trust_gain_multiplier=data.get("trust", {}).get("gain_multiplier", 1.0),
        trust_loss_multiplier=data.get("trust", {}).get("loss_multiplier", 1.0),
        attachment_ceiling=data.get("attachment_ceiling", 1.0),
        trigger_multipliers=data.get("trigger_multipliers", {}),
        play_trust_threshold=data.get("play_trust_threshold", 0.7),
    )

def run_dialogue(dialogue_path: Path, agent_name: str = "rem") -> dict:
    """Run a dialogue through the emotion engine."""
    with open(dialogue_path) as f:
        dialogue = json.load(f)
    
    profile = load_agent_profile(agent_name)
    engine = EmotionEngine(profile)
    
    state = EmotionalState(
        valence=profile.baseline_valence,
        arousal=profile.baseline_arousal,
        trust=0.5,
        attachment=0.3,
    )
    
    trajectory = []
    
    for i, msg in enumerate(dialogue["messages"]):
        step = {
            "index": i,
            "content": msg["content"][:50],
            "state_before": state.to_dict(),
        }
        
        # Apply wait time if specified
        if "wait_seconds" in msg:
            state = engine.apply_decay(state, msg["wait_seconds"])
            step["waited"] = msg["wait_seconds"]
        
        # Detect and apply triggers (regex for now)
        triggers = engine.detect_triggers(msg["content"])
        
        for trigger, intensity in triggers:
            engine.apply_trigger(state, trigger, intensity)
        
        step["detected_triggers"] = triggers
        step["state_after"] = state.to_dict()
        trajectory.append(step)
    
    return {
        "dialogue": dialogue["name"],
        "agent": agent_name,
        "trajectory": trajectory,
        "final_state": state.to_dict(),
    }

def main():
    agent = sys.argv[1] if len(sys.argv) > 1 else "rem"
    dialogue_filter = sys.argv[2] if len(sys.argv) > 2 else None
    
    dialogues = list(DIALOGUES_DIR.glob("*.json"))
    if dialogue_filter:
        dialogues = [d for d in dialogues if dialogue_filter in d.name]
    
    print(f"Running {len(dialogues)} dialogue(s) with agent: {agent}\n")
    
    for path in dialogues:
        result = run_dialogue(path, agent)
        
        print(f"=== {result['dialogue']} ===")
        final = result['final_state']
        print(f"Final: valence={final['valence']:.2f} trust={final['trust']:.2f}")
        
        # Show trajectory summary
        for step in result['trajectory']:
            v = step['state_after']['valence']
            t = step['state_after']['trust']
            triggers = [f"{tr[0]}:{tr[1]:.1f}" for tr in step.get('detected_triggers', [])]
            print(f"  {step['index']}: v={v:+.2f} t={t:.2f} | {' '.join(triggers) if triggers else '-'}")
        print()

if __name__ == "__main__":
    main()
```

### Task 6: Tests

Run all tests after implementation:
```bash
./scripts/check-backend.sh
python scripts/test-emotion-scenarios.py
python scripts/test-dialogues.py rem
python scripts/test-dialogues.py ram
python scripts/test-dialogues.py beatrice
```

### Task 7: Commit

Commit in logical chunks:
1. "feat: add config loader for agent profiles and relationships"
2. "feat: add LLM trigger detection (optional)"
3. "feat: add dialogue test runner"
4. Final: "test: verify all agents with dialogue scenarios"

## Notes

- LLM trigger detection is OPTIONAL (env flag) - defaults to regex
- Profile configs are already created in `configs/`
- Dialogue scenarios already created in `scripts/dialogues/`
- Keep changes backwards compatible
- Don't break existing tests
