#!/usr/bin/env python3
"""
Emotional Engine Laboratory - Parameter Tuning & Simulation

Interactive experiments for tuning emotional baselines, volatility,
recovery rates, and trigger mappings.

Usage:
    python scripts/emotion-lab.py                    # Interactive mode
    python scripts/emotion-lab.py simulate rem 20    # Simulate 20 interactions with rem
    python scripts/emotion-lab.py drift rem 3600     # Test 1-hour drift for rem
    python scripts/emotion-lab.py compare            # Compare all agents side-by-side

Output: Logs to scripts/emotion-lab-runs/ with timestamps
"""

import json
import sys
import os
import random
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

# Direct import to avoid dependency chain
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

# Output directory for experiment logs
RUNS_DIR = Path(__file__).parent / "emotion-lab-runs"
RUNS_DIR.mkdir(exist_ok=True)


# =============================================================================
# AGENT PROFILES - TUNE THESE
# =============================================================================

AGENT_PROFILES = {
    "rem": AgentProfile(
        baseline_valence=0.3,        # Warm baseline - devoted personality
        baseline_arousal=0.1,        # Slightly eager
        baseline_dominance=-0.1,     # Deferential
        emotional_volatility=1.2,    # Expressive, emotions swing easily
        emotional_recovery=1.0,      # Standard recovery speed
        decay_rates={
            "valence": 0.4,          # 40% per hour toward baseline
            "arousal": 0.5,          # Arousal decays faster
            "trust": 0.05,           # Trust decays very slowly
        },
        trust_gain_multiplier=1.3,   # Quick to trust
        trust_loss_multiplier=0.7,   # Forgiving - trust loss reduced
        attachment_ceiling=1.0,      # Can fully attach
        trigger_multipliers={
            "compliment": 1.5,       # Loves praise
            "affirmation": 1.4,
            "rejection": 1.3,        # Sensitive to rejection
            "comfort": 1.2,
        },
        play_trust_threshold=0.6,    # Lower threshold - playful earlier
    ),
    
    "ram": AgentProfile(
        baseline_valence=0.0,        # Neutral - stoic
        baseline_arousal=-0.1,       # Calm, composed
        baseline_dominance=0.3,      # Confident
        emotional_volatility=0.6,    # Stoic - emotions don't swing much
        emotional_recovery=1.0,      # Standard recovery speed
        decay_rates={
            "valence": 0.15,         # Slow decay - remembers slights
            "arousal": 0.2,
            "trust": 0.02,           # Trust almost never decays naturally
        },
        trust_gain_multiplier=0.5,   # Hard to earn trust
        trust_loss_multiplier=1.5,   # Quick to lose trust - holds grudges
        attachment_ceiling=0.7,      # Maintains emotional distance
        trigger_multipliers={
            "compliment": 0.4,       # Unmoved by flattery
            "criticism": 0.5,        # Also unmoved by criticism
            "rejection": 1.5,        # But rejection cuts deep
            "disrespect": 2.0,       # Very sensitive to disrespect
        },
        play_trust_threshold=0.85,   # Very high bar for playfulness
    ),
    
    "beatrice": AgentProfile(
        baseline_valence=0.1,        # Slightly guarded default
        baseline_arousal=0.0,
        baseline_dominance=0.2,      # Proud
        emotional_volatility=0.9,    # Moderate - tsundere swings
        emotional_recovery=1.0,      # Standard recovery speed
        decay_rates={
            "valence": 0.3,          # 30% per hour
            "arousal": 0.35,
            "trust": 0.03,
        },
        trust_gain_multiplier=0.7,   # Slow to warm up
        trust_loss_multiplier=1.2,   # Moderate grudge holding
        attachment_ceiling=0.9,
        trigger_multipliers={
            "compliment": 0.8,       # Dismissive of praise (publicly)
            "teasing": 1.3,          # Reacts strongly to teasing
            "affirmation": 1.1,      # Secretly appreciates affirmation
            "abandonment": 1.8,      # Deep fear of abandonment
        },
        play_trust_threshold=0.75,   # Moderate threshold
    ),
    
    "emilia": AgentProfile(
        baseline_valence=0.25,       # Gentle warmth
        baseline_arousal=0.05,
        baseline_dominance=0.0,      # Neither dominant nor submissive
        emotional_volatility=0.8,    # Moderate expressiveness
        emotional_recovery=1.0,      # Standard recovery speed
        decay_rates={
            "valence": 0.35,         # 35% per hour
            "arousal": 0.4,
            "trust": 0.04,
        },
        trust_gain_multiplier=1.0,   # Standard trust building
        trust_loss_multiplier=1.0,   # Standard trust loss
        attachment_ceiling=1.0,
        trigger_multipliers={
            "comfort": 1.2,
            "gratitude": 1.1,
            "rejection": 1.0,
        },
        play_trust_threshold=0.7,
    ),
}


# =============================================================================
# TRIGGER PATTERNS - TUNE THESE
# =============================================================================

SAMPLE_MESSAGES = {
    "positive": [
        ("You're amazing!", "compliment", 0.9),
        ("Thank you so much", "gratitude", 0.8),
        ("I really appreciate you", "affirmation", 0.7),
        ("That was helpful", "gratitude", 0.5),
        ("You look nice today", "compliment", 0.6),
        ("I'm glad you're here", "affirmation", 0.6),
    ],
    "negative": [
        ("You're useless", "insult", 0.9),
        ("I don't need you", "rejection", 0.8),
        ("Leave me alone", "dismissal", 0.7),
        ("That was stupid", "criticism", 0.6),
        ("Whatever, I don't care", "dismissal", 0.5),
        ("You always mess things up", "criticism", 0.8),
    ],
    "neutral": [
        ("What's the weather like?", None, 0),
        ("Tell me about yourself", None, 0),
        ("How does that work?", None, 0),
        ("Interesting", None, 0),
    ],
    "playful": [
        ("You're such a dork lol", "teasing", 0.5),
        ("Aww, you're cute when you're flustered", "teasing", 0.6),
        ("I'm just messing with you", "teasing", 0.3),
    ],
    "conflict": [
        ("This is your fault!", "conflict", 0.8),
        ("Why didn't you tell me?!", "conflict", 0.7),
        ("I trusted you and you let me down", "betrayal", 0.9),
    ],
    "repair": [
        ("I'm sorry, I didn't mean that", "apology", 0.8),
        ("Can we talk about what happened?", "repair", 0.6),
        ("I shouldn't have said that", "apology", 0.7),
        ("I forgive you", "forgiveness", 0.8),
    ],
}


# =============================================================================
# EXPERIMENT RUNNER
# =============================================================================

@dataclass
class ExperimentLog:
    agent: str
    started: str
    steps: list
    final_state: dict
    summary: dict


def run_simulation(
    agent_name: str,
    num_interactions: int,
    message_mix: str = "balanced",
    time_between: int = 300,  # 5 minutes between messages
) -> ExperimentLog:
    """
    Simulate a conversation with an agent.
    
    message_mix options:
        - "balanced": Mix of positive, negative, neutral
        - "positive": Mostly positive
        - "negative": Mostly negative
        - "chaotic": Random everything
        - "slow_burn": Gradual trust building
    """
    profile = AGENT_PROFILES.get(agent_name)
    if not profile:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    engine = EmotionEngine(profile)
    state = EmotionalState(
        valence=profile.baseline_valence,
        arousal=profile.baseline_arousal,
        dominance=profile.baseline_dominance,
        trust=0.5,
        attachment=0.3,
        familiarity=0.0,
    )
    
    steps = []
    
    def get_message(step: int) -> tuple:
        """Get a message based on mix strategy."""
        if message_mix == "positive":
            category = random.choices(["positive", "neutral", "playful"], [0.7, 0.2, 0.1])[0]
        elif message_mix == "negative":
            category = random.choices(["negative", "neutral", "conflict"], [0.6, 0.2, 0.2])[0]
        elif message_mix == "chaotic":
            category = random.choice(list(SAMPLE_MESSAGES.keys()))
        elif message_mix == "slow_burn":
            # Start neutral, gradually more positive
            progress = step / num_interactions
            if progress < 0.3:
                category = random.choices(["neutral", "positive"], [0.7, 0.3])[0]
            elif progress < 0.6:
                category = random.choices(["positive", "neutral", "playful"], [0.5, 0.3, 0.2])[0]
            else:
                category = random.choices(["positive", "playful", "affirmation"], [0.4, 0.3, 0.3])[0]
                if category == "affirmation":
                    category = "positive"  # fallback
        else:  # balanced
            category = random.choices(
                ["positive", "negative", "neutral", "playful"],
                [0.35, 0.2, 0.3, 0.15]
            )[0]
        
        messages = SAMPLE_MESSAGES.get(category, SAMPLE_MESSAGES["neutral"])
        return random.choice(messages)
    
    for i in range(num_interactions):
        step_data = {
            "step": i + 1,
            "state_before": state.to_dict(),
        }
        
        # Time decay
        if i > 0:
            state = engine.apply_decay(state, time_between)
            step_data["decay_applied"] = time_between
        
        # Get and apply message
        msg_text, trigger, intensity = get_message(i)
        step_data["message"] = msg_text
        
        if trigger:
            deltas = engine.apply_trigger(state, trigger, intensity)
            step_data["trigger"] = trigger
            step_data["intensity"] = intensity
            step_data["deltas"] = deltas
        
        step_data["state_after"] = state.to_dict()
        steps.append(step_data)
    
    # Summary statistics
    summary = {
        "starting_trust": 0.5,
        "final_trust": state.trust,
        "trust_delta": state.trust - 0.5,
        "valence_range": (
            min(s["state_after"]["valence"] for s in steps),
            max(s["state_after"]["valence"] for s in steps),
        ),
        "arousal_range": (
            min(s["state_after"]["arousal"] for s in steps),
            max(s["state_after"]["arousal"] for s in steps),
        ),
        "num_interactions": num_interactions,
        "message_mix": message_mix,
        "time_between": time_between,
    }
    
    return ExperimentLog(
        agent=agent_name,
        started=datetime.now().isoformat(),
        steps=steps,
        final_state=state.to_dict(),
        summary=summary,
    )


def run_drift_test(agent_name: str, duration_seconds: int, check_interval: int = 300) -> ExperimentLog:
    """
    Test how an agent's state drifts back to baseline over time.
    Start from an extreme state and watch it decay.
    """
    profile = AGENT_PROFILES.get(agent_name)
    if not profile:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    engine = EmotionEngine(profile)
    
    # Start from extreme positive state
    state = EmotionalState(
        valence=0.9,
        arousal=0.7,
        dominance=0.3,
        trust=0.8,
        attachment=0.6,
        familiarity=0.5,
    )
    
    steps = []
    elapsed = 0
    
    while elapsed < duration_seconds:
        step_data = {
            "elapsed_seconds": elapsed,
            "elapsed_human": f"{elapsed // 3600}h {(elapsed % 3600) // 60}m",
            "state": state.to_dict(),
            "distance_from_baseline": {
                "valence": abs(state.valence - profile.baseline_valence),
                "arousal": abs(state.arousal - profile.baseline_arousal),
            },
        }
        steps.append(step_data)
        
        # Advance time
        state = engine.apply_decay(state, check_interval)
        elapsed += check_interval
    
    summary = {
        "duration_seconds": duration_seconds,
        "check_interval": check_interval,
        "starting_valence": 0.9,
        "final_valence": state.valence,
        "baseline_valence": profile.baseline_valence,
        "valence_recovered_pct": (0.9 - state.valence) / (0.9 - profile.baseline_valence) * 100,
    }
    
    return ExperimentLog(
        agent=agent_name,
        started=datetime.now().isoformat(),
        steps=steps,
        final_state=state.to_dict(),
        summary=summary,
    )


def run_comparison() -> dict:
    """Compare all agents receiving the same sequence of messages."""
    # Fixed sequence for fair comparison
    sequence = [
        ("You're really helpful, thank you!", "compliment", 0.8),
        ("That's not what I asked for", "criticism", 0.6),
        ("Sorry, I'm just stressed", "apology", 0.5),
        ("You always know what to say", "compliment", 0.7),
        ("I don't need your help right now", "dismissal", 0.6),
        ("Actually, wait, come back", "repair", 0.5),
        ("You're the best", "compliment", 0.9),
    ]
    
    results = {}
    
    for agent_name, profile in AGENT_PROFILES.items():
        engine = EmotionEngine(profile)
        state = EmotionalState(
            valence=profile.baseline_valence,
            arousal=profile.baseline_arousal,
            trust=0.5,
        )
        
        trajectory = []
        for msg, trigger, intensity in sequence:
            if trigger:
                engine.apply_trigger(state, trigger, intensity)
            trajectory.append({
                "message": msg[:30],
                "valence": round(state.valence, 3),
                "trust": round(state.trust, 3),
            })
        
        results[agent_name] = {
            "trajectory": trajectory,
            "final_valence": state.valence,
            "final_trust": state.trust,
            "volatility": profile.emotional_volatility,
        }
    
    return results


def save_experiment(log: ExperimentLog, name: str = None) -> Path:
    """Save experiment results to JSON file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = name or f"{log.agent}_{timestamp}"
    path = RUNS_DIR / f"{name}.json"
    
    with open(path, "w") as f:
        json.dump(asdict(log), f, indent=2, default=str)
    
    return path


def print_state(state: dict, label: str = "State"):
    """Pretty print emotional state."""
    print(f"\n{label}:")
    print(f"  Valence:    {state['valence']:+.3f}")
    print(f"  Arousal:    {state['arousal']:+.3f}")
    print(f"  Dominance:  {state['dominance']:+.3f}")
    print(f"  Trust:      {state['trust']:.3f}")
    print(f"  Attachment: {state['attachment']:.3f}")
    print(f"  Familiarity:{state['familiarity']:.3f}")


def print_comparison(results: dict):
    """Pretty print comparison results."""
    print("\n" + "=" * 70)
    print("AGENT COMPARISON - Same message sequence")
    print("=" * 70)
    
    # Header
    agents = list(results.keys())
    print(f"\n{'Message':<32}", end="")
    for a in agents:
        print(f"{a:>10}", end="")
    print()
    print("-" * (32 + 10 * len(agents)))
    
    # Trajectory (valence)
    num_steps = len(results[agents[0]]["trajectory"])
    for i in range(num_steps):
        msg = results[agents[0]]["trajectory"][i]["message"]
        print(f"{msg:<32}", end="")
        for a in agents:
            v = results[a]["trajectory"][i]["valence"]
            print(f"{v:>+10.3f}", end="")
        print()
    
    # Final summary
    print("-" * (32 + 10 * len(agents)))
    print(f"{'Final Trust':<32}", end="")
    for a in agents:
        t = results[a]["final_trust"]
        print(f"{t:>10.3f}", end="")
    print()
    
    print(f"{'Volatility (config)':<32}", end="")
    for a in agents:
        v = results[a]["volatility"]
        print(f"{v:>10.2f}", end="")
    print("\n")


# =============================================================================
# MAIN
# =============================================================================

def main():
    if len(sys.argv) < 2:
        # Interactive mode
        print("Emotional Engine Laboratory")
        print("=" * 40)
        print("\nAvailable agents:", ", ".join(AGENT_PROFILES.keys()))
        print("\nCommands:")
        print("  simulate <agent> [n] [mix]  - Run n interactions")
        print("  drift <agent> [seconds]    - Test drift to baseline")
        print("  compare                    - Compare all agents")
        print("  profile <agent>            - Show agent profile")
        print("  quit                       - Exit")
        print()
        
        while True:
            try:
                cmd = input("> ").strip().split()
                if not cmd:
                    continue
                
                if cmd[0] == "quit":
                    break
                elif cmd[0] == "simulate":
                    agent = cmd[1] if len(cmd) > 1 else "rem"
                    n = int(cmd[2]) if len(cmd) > 2 else 10
                    mix = cmd[3] if len(cmd) > 3 else "balanced"
                    
                    print(f"\nSimulating {n} interactions with {agent} ({mix} mix)...")
                    log = run_simulation(agent, n, mix)
                    path = save_experiment(log)
                    
                    print_state(log.final_state, "Final State")
                    print(f"\nTrust: {log.summary['starting_trust']:.2f} → {log.summary['final_trust']:.2f} ({log.summary['trust_delta']:+.2f})")
                    print(f"Saved to: {path}")
                    
                elif cmd[0] == "drift":
                    agent = cmd[1] if len(cmd) > 1 else "rem"
                    duration = int(cmd[2]) if len(cmd) > 2 else 3600
                    
                    print(f"\nTesting {duration}s drift for {agent}...")
                    log = run_drift_test(agent, duration)
                    path = save_experiment(log, f"{agent}_drift_{duration}s")
                    
                    print(f"\nValence: 0.900 → {log.final_state['valence']:.3f}")
                    print(f"Recovery: {log.summary['valence_recovered_pct']:.1f}% toward baseline")
                    print(f"Saved to: {path}")
                    
                elif cmd[0] == "compare":
                    results = run_comparison()
                    print_comparison(results)
                    
                elif cmd[0] == "profile":
                    agent = cmd[1] if len(cmd) > 1 else "rem"
                    p = AGENT_PROFILES.get(agent)
                    if p:
                        print(f"\n{agent} profile:")
                        for k, v in asdict(p).items():
                            print(f"  {k}: {v}")
                    else:
                        print(f"Unknown agent: {agent}")
                        
                else:
                    print(f"Unknown command: {cmd[0]}")
                    
            except KeyboardInterrupt:
                print("\nExiting.")
                break
            except Exception as e:
                print(f"Error: {e}")
    
    elif sys.argv[1] == "simulate":
        agent = sys.argv[2] if len(sys.argv) > 2 else "rem"
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        mix = sys.argv[4] if len(sys.argv) > 4 else "balanced"
        
        log = run_simulation(agent, n, mix)
        path = save_experiment(log)
        print_state(log.final_state, f"{agent} after {n} interactions")
        print(f"\nSaved: {path}")
        
    elif sys.argv[1] == "drift":
        agent = sys.argv[2] if len(sys.argv) > 2 else "rem"
        duration = int(sys.argv[3]) if len(sys.argv) > 3 else 3600
        
        log = run_drift_test(agent, duration)
        path = save_experiment(log)
        print(f"\n{agent} drift test: {log.summary['valence_recovered_pct']:.1f}% recovery in {duration}s")
        print(f"Saved: {path}")
        
    elif sys.argv[1] == "compare":
        results = run_comparison()
        print_comparison(results)
        
    else:
        print(f"Unknown command: {sys.argv[1]}")
        sys.exit(1)


if __name__ == "__main__":
    main()
