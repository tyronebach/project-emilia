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
MOODS = _module.MOODS

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
        mood_baseline=data.get("mood_baseline", {}),
        mood_decay_rate=data.get("mood_decay_rate", 0.3),
    )


def load_trigger_mood_map(relationship_type: str) -> dict:
    """Load trigger→mood map from relationship config."""
    path = CONFIGS_DIR / "relationships" / f"{relationship_type}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        data = json.load(f)
    return data.get("trigger_mood_map", {})


def run_dialogue(dialogue_path: Path, agent_name: str = "rem", relationship: str = "romantic") -> dict:
    """Run a dialogue through the emotion engine."""
    with open(dialogue_path) as f:
        dialogue = json.load(f)

    profile = load_agent_profile(agent_name)
    engine = EmotionEngine(profile)
    trigger_mood_map = load_trigger_mood_map(relationship)

    # Initialize state with mood baseline
    state = EmotionalState(
        valence=profile.baseline_valence,
        arousal=profile.baseline_arousal,
        trust=0.5,
        attachment=0.3,
        mood_weights={mood: profile.mood_baseline.get(mood, 0) for mood in MOODS},
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
            engine.apply_mood_decay(state, msg["wait_seconds"])
            step["waited"] = msg["wait_seconds"]

        # Detect triggers (regex)
        triggers = engine.detect_triggers(msg["content"])

        # Apply traditional trigger deltas
        for trigger, intensity in triggers:
            engine.apply_trigger(state, trigger, intensity)

        # Apply mood deltas from trigger_mood_map
        if triggers and trigger_mood_map:
            mood_deltas = engine.calculate_mood_deltas(triggers, trigger_mood_map)
            engine.apply_mood_deltas(state, mood_deltas)

        # Get dominant moods
        dominant = engine.get_dominant_moods(state, top_n=2)

        step["detected_triggers"] = triggers
        step["dominant_moods"] = dominant
        step["state_after"] = state.to_dict()
        trajectory.append(step)

    return {
        "dialogue": dialogue["name"],
        "agent": agent_name,
        "relationship": relationship,
        "trajectory": trajectory,
        "final_state": state.to_dict(),
    }


def main():
    agent = sys.argv[1] if len(sys.argv) > 1 else "rem"
    dialogue_filter = sys.argv[2] if len(sys.argv) > 2 else None
    relationship = sys.argv[3] if len(sys.argv) > 3 else "romantic"

    dialogues = list(DIALOGUES_DIR.glob("*.json"))
    if dialogue_filter:
        dialogues = [d for d in dialogues if dialogue_filter in d.name]

    print(f"Running {len(dialogues)} dialogue(s) with agent: {agent} ({relationship})\n")

    for path in dialogues:
        result = run_dialogue(path, agent, relationship)

        print(f"=== {result['dialogue']} ===")
        final = result['final_state']
        
        # Show final dominant moods
        final_moods = sorted(
            [(m, w) for m, w in final.get('mood_weights', {}).items() if w > 0],
            key=lambda x: -x[1]
        )[:3]
        mood_str = ", ".join([f"{m}:{w:.1f}" for m, w in final_moods])
        print(f"Final: v={final['valence']:.2f} t={final['trust']:.2f} | moods: {mood_str}")

        # Show trajectory
        for step in result['trajectory']:
            v = step['state_after']['valence']
            t = step['state_after']['trust']
            triggers = [f"{tr[0]}:{tr[1]:.1f}" for tr in step.get('detected_triggers', [])]
            dominant = step.get('dominant_moods', [])
            mood_str = "+".join([m[0][:3] for m in dominant[:2]]) if dominant else "-"
            trigger_str = ' '.join(triggers) if triggers else '-'
            print(f"  {step['index']}: v={v:+.2f} t={t:.2f} [{mood_str}] | {trigger_str}")
        print()


if __name__ == "__main__":
    main()
