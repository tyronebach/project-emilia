#!/usr/bin/env python3
"""
Emotional Engine Scenario Tests

Runs scenario JSON files to validate emotional state behavior over
sequences of triggers and time passages.

Usage:
    python scripts/test-emotion-scenarios.py [scenario_name]
    
Examples:
    python scripts/test-emotion-scenarios.py           # Run all scenarios
    python scripts/test-emotion-scenarios.py drift     # Run drift_test.json only
"""

import json
import sys
from pathlib import Path

# Add backend to path for imports
# When running in Docker, backend is at /app
# When running locally, it's relative to this script
backend_paths = [
    Path("/app"),  # Docker
    Path(__file__).parent.parent / "backend",  # Local
]
for p in backend_paths:
    if p.exists():
        sys.path.insert(0, str(p))
        break

# Direct import path to avoid pulling in all services dependencies (httpx, etc.)
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


def run_scenario(scenario_path: Path) -> dict:
    """Run a scenario and return results."""
    with open(scenario_path) as f:
        scenario = json.load(f)
    
    # Initialize engine with agent profile
    profile_data = scenario.get('agent_profile', {})
    profile = AgentProfile(
        baseline_valence=profile_data.get('baseline_valence', 0.2),
        baseline_arousal=profile_data.get('baseline_arousal', 0.0),
        baseline_dominance=profile_data.get('baseline_dominance', 0.0),
        emotional_volatility=profile_data.get('emotional_volatility', 0.5),
        emotional_recovery=profile_data.get('emotional_recovery', 0.1),
        decay_rates=profile_data.get('decay_rates', {}),
        trust_gain_multiplier=profile_data.get('trust_gain_multiplier', 1.0),
        trust_loss_multiplier=profile_data.get('trust_loss_multiplier', 1.0),
        attachment_ceiling=profile_data.get('attachment_ceiling', 1.0),
        trigger_multipliers=profile_data.get('trigger_multipliers', {}),
        play_trust_threshold=profile_data.get('play_trust_threshold', 0.7),
    )
    engine = EmotionEngine(profile)
    
    # Initialize state
    initial = scenario.get('initial_state', {})
    state = EmotionalState(
        valence=initial.get('valence', profile.baseline_valence),
        arousal=initial.get('arousal', profile.baseline_arousal),
        dominance=initial.get('dominance', profile.baseline_dominance),
        trust=initial.get('trust', 0.5),
        attachment=initial.get('attachment', 0.3),
        familiarity=initial.get('familiarity', 0.0),
    )
    
    results = {
        'scenario': scenario['name'],
        'steps': [],
        'passed': True,
        'failures': []
    }
    
    for i, step in enumerate(scenario['steps']):
        step_result = {
            'index': i,
            'description': step.get('description', f'Step {i+1}'),
            'state_before': state.to_dict(),
        }
        
        # Simulate time passage
        if 'wait_seconds' in step:
            state = engine.apply_decay(state, step['wait_seconds'])
            step_result['waited'] = step['wait_seconds']
        
        # Apply triggers
        if 'triggers' in step:
            for trigger_item in step['triggers']:
                if isinstance(trigger_item, list):
                    trigger, intensity = trigger_item
                else:
                    trigger, intensity = trigger_item, 0.7
                engine.apply_trigger(state, trigger, intensity)
            step_result['triggers_applied'] = step['triggers']
        
        # Detect triggers from text
        if 'message' in step:
            detected = engine.detect_triggers(step['message'])
            for trigger, intensity in detected:
                engine.apply_trigger(state, trigger, intensity)
            step_result['message'] = step['message']
            step_result['detected_triggers'] = detected
        
        step_result['state_after'] = state.to_dict()
        
        # Check assertions
        if 'assert' in step:
            for assertion in step['assert']:
                field = assertion['field']
                actual = getattr(state, field)
                
                passed = True
                reason = None
                
                if 'min' in assertion and actual < assertion['min']:
                    passed = False
                    reason = f"{field} = {actual:.3f} < min {assertion['min']}"
                
                if 'max' in assertion and actual > assertion['max']:
                    passed = False
                    reason = f"{field} = {actual:.3f} > max {assertion['max']}"
                
                if 'equals' in assertion and abs(actual - assertion['equals']) > 0.01:
                    passed = False
                    reason = f"{field} = {actual:.3f} != {assertion['equals']}"
                
                if not passed:
                    results['passed'] = False
                    results['failures'].append({
                        'step': i,
                        'description': step.get('description', ''),
                        'assertion': assertion,
                        'actual': actual,
                        'reason': reason,
                    })
        
        results['steps'].append(step_result)
    
    return results


def print_results(result: dict, verbose: bool = False) -> None:
    """Print scenario results."""
    status = '✓' if result['passed'] else '✗'
    print(f"{status} {result['scenario']}")
    
    if not result['passed']:
        for failure in result['failures']:
            print(f"  Step {failure['step']}: {failure['description']}")
            print(f"    - {failure['reason']}")
    
    if verbose:
        print(f"  Steps: {len(result['steps'])}")
        for step in result['steps']:
            print(f"    {step['index']}: {step['description']}")
            if 'triggers_applied' in step:
                print(f"       Triggers: {step['triggers_applied']}")
            state = step['state_after']
            print(f"       State: v={state['valence']:.2f} a={state['arousal']:.2f} t={state['trust']:.2f}")


def main():
    # Try multiple paths for scenarios (Docker vs local)
    possible_dirs = [
        Path("/scripts/scenarios"),  # Docker mount
        Path(__file__).parent / "scenarios",  # Local
    ]
    
    scenarios_dir = None
    for d in possible_dirs:
        if d.exists():
            scenarios_dir = d
            break
    
    if not scenarios_dir:
        print(f"Error: Scenarios directory not found")
        sys.exit(1)
    
    verbose = '-v' in sys.argv or '--verbose' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    
    if args:
        # Run specific scenario
        scenarios = [scenarios_dir / f"{args[0]}.json"]
        if not scenarios[0].exists():
            # Try without .json
            scenarios = list(scenarios_dir.glob(f"*{args[0]}*.json"))
    else:
        # Run all scenarios
        scenarios = sorted(scenarios_dir.glob("*.json"))
    
    if not scenarios:
        print("No scenarios found.")
        sys.exit(1)
    
    print(f"Running {len(scenarios)} scenario(s)...\n")
    
    all_passed = True
    for scenario_path in scenarios:
        try:
            result = run_scenario(scenario_path)
            print_results(result, verbose)
            if not result['passed']:
                all_passed = False
        except Exception as e:
            print(f"✗ {scenario_path.stem}: Error - {e}")
            all_passed = False
    
    print()
    if all_passed:
        print("All scenarios passed!")
    else:
        print("Some scenarios failed.")
    
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
