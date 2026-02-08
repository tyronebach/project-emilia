#!/usr/bin/env python3
"""Compare regex vs LLM trigger detection on test dialogues."""

import json
import asyncio
import sys
from pathlib import Path

# Import emotion engine
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "emotion_engine",
    Path(__file__).parent.parent / "backend" / "services" / "emotion_engine.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
EmotionEngine = _module.EmotionEngine
AgentProfile = _module.AgentProfile

DIALOGUES_DIR = Path(__file__).parent / "dialogues"

# Test messages with expected triggers (ground truth)
TEST_CASES = [
    # Obvious cases
    ("You're amazing!", ["compliment"]),
    ("Thank you so much", ["gratitude"]),
    ("I hate you", ["conflict", "rejection"]),
    ("I'm sorry, I didn't mean that", ["apology"]),
    
    # Nuanced cases (regex likely misses)
    ("You always know what to say", ["compliment", "affirmation"]),
    ("That's not what I asked for", ["criticism"]),
    ("I don't need your help right now", ["dismissal", "rejection"]),
    ("Actually, wait, come back", ["repair"]),
    ("I feel so comfortable with you", ["vulnerability", "affirmation"]),
    ("Why didn't you help me when I needed you?", ["conflict", "criticism"]),
    ("You're honestly the best thing that's happened to me", ["compliment", "affirmation"]),
    ("Whatever, forget it", ["dismissal"]),
    ("I was just really frustrated", ["vulnerability"]),
    ("Can we please start over?", ["repair"]),
    
    # Ambiguous/subtle
    ("That's... interesting", []),  # neutral
    ("Okay", []),  # neutral
    ("I've been thinking about you", ["affirmation"]),
    ("You're such a dork lol", ["teasing"]),
    ("I don't know why I even bother", ["dismissal", "conflict"]),
]


def test_regex(engine, message):
    """Test regex detection."""
    return engine.detect_triggers(message)


async def test_llm(engine, message):
    """Test LLM detection."""
    try:
        return await engine.detect_triggers_llm(message)
    except Exception as e:
        return [("error", str(e))]


def score_detection(detected, expected):
    """Score detection accuracy."""
    detected_triggers = set(t[0] for t in detected)
    expected_set = set(expected)
    
    true_positives = len(detected_triggers & expected_set)
    false_positives = len(detected_triggers - expected_set)
    false_negatives = len(expected_set - detected_triggers)
    
    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 1
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "detected": list(detected_triggers),
        "expected": expected,
        "tp": true_positives,
        "fp": false_positives,
        "fn": false_negatives,
    }


async def main():
    profile = AgentProfile()
    engine = EmotionEngine(profile)
    
    print("=" * 80)
    print("REGEX vs LLM Trigger Detection Comparison")
    print("=" * 80)
    print()
    
    regex_scores = []
    llm_scores = []
    llm_available = True
    
    for message, expected in TEST_CASES:
        # Regex detection
        regex_result = test_regex(engine, message)
        regex_score = score_detection(regex_result, expected)
        regex_scores.append(regex_score)
        
        # LLM detection (only if available)
        if llm_available:
            llm_result = await test_llm(engine, message)
            if llm_result and llm_result[0][0] == "error":
                print(f"LLM unavailable: {llm_result[0][1]}")
                llm_available = False
                llm_score = {"f1": 0, "detected": [], "precision": 0, "recall": 0}
            else:
                llm_score = score_detection(llm_result, expected)
            llm_scores.append(llm_score)
        
        # Print comparison
        regex_triggers = [f"{t[0]}:{t[1]:.1f}" for t in regex_result] or ["-"]
        
        status = "✓" if regex_score["f1"] == 1 else "△" if regex_score["f1"] > 0 else "✗"
        
        print(f"{status} \"{message[:50]}\"")
        print(f"   Expected: {expected or ['(none)']}")
        print(f"   Regex:    {regex_triggers} (F1={regex_score['f1']:.2f})")
        
        if llm_available and llm_scores:
            llm_triggers = [f"{t[0]}:{t[1]:.1f}" for t in llm_result] or ["-"]
            print(f"   LLM:      {llm_triggers} (F1={llm_score['f1']:.2f})")
        print()
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    regex_avg_f1 = sum(s["f1"] for s in regex_scores) / len(regex_scores)
    regex_avg_precision = sum(s["precision"] for s in regex_scores) / len(regex_scores)
    regex_avg_recall = sum(s["recall"] for s in regex_scores) / len(regex_scores)
    
    print(f"\nRegex Detection:")
    print(f"  Precision: {regex_avg_precision:.2%}")
    print(f"  Recall:    {regex_avg_recall:.2%}")
    print(f"  F1 Score:  {regex_avg_f1:.2%}")
    
    if llm_available and llm_scores:
        llm_avg_f1 = sum(s["f1"] for s in llm_scores) / len(llm_scores)
        llm_avg_precision = sum(s["precision"] for s in llm_scores) / len(llm_scores)
        llm_avg_recall = sum(s["recall"] for s in llm_scores) / len(llm_scores)
        
        print(f"\nLLM Detection:")
        print(f"  Precision: {llm_avg_precision:.2%}")
        print(f"  Recall:    {llm_avg_recall:.2%}")
        print(f"  F1 Score:  {llm_avg_f1:.2%}")
        
        print(f"\nDifference (LLM - Regex):")
        print(f"  F1: {(llm_avg_f1 - regex_avg_f1):+.2%}")
    
    # Cases where regex failed
    print("\n" + "=" * 80)
    print("REGEX MISSES (F1 < 1)")
    print("=" * 80)
    for (message, expected), score in zip(TEST_CASES, regex_scores):
        if score["f1"] < 1:
            print(f"  \"{message[:60]}\"")
            print(f"    Expected: {expected}, Got: {score['detected']}")


if __name__ == "__main__":
    asyncio.run(main())
