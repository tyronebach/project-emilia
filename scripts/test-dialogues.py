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
