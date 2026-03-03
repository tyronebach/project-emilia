"""DEPRECATED — use dream system.

Default global drift archetype seed data.
"""
from __future__ import annotations

from typing import Any

from services.emotion_engine import ALL_TRIGGERS


def _normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    cleaned = {k: float(v) for k, v in weights.items() if float(v) > 0.0}
    total = sum(cleaned.values())
    if total <= 0:
        return {}
    return {k: v / total for k, v in cleaned.items()}


def _weighted_sequence(weights: dict[str, float], total_messages: int) -> list[str]:
    normalized = _normalize_weights(weights)
    if not normalized or total_messages <= 0:
        return []

    targets: list[tuple[str, float]] = [
        (trigger, prob * total_messages) for trigger, prob in normalized.items()
    ]
    counts = {trigger: int(target) for trigger, target in targets}
    remaining = total_messages - sum(counts.values())
    remainders = sorted(
        ((trigger, target - int(target)) for trigger, target in targets),
        key=lambda item: item[1],
        reverse=True,
    )
    for idx in range(remaining):
        trigger = remainders[idx % len(remainders)][0]
        counts[trigger] += 1

    buckets: list[list[str]] = [
        [trigger] * count for trigger, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
    ]
    sequence: list[str] = []
    while True:
        emitted = False
        for bucket in buckets:
            if not bucket:
                continue
            sequence.append(bucket.pop())
            emitted = True
        if not emitted:
            break

    return sequence[:total_messages]


def _calc_intensity(weight: float, idx: int) -> float:
    base = 0.36 + min(0.54, max(0.0, weight) * 0.9)
    wobble = ((idx % 7) - 3) * 0.018
    value = max(0.1, min(1.0, base + wobble))
    return float(f"{value:.4f}")


def _build_replay_from_weights(weights: dict[str, float], total_messages: int) -> list[list[list[str | float]]]:
    normalized = _normalize_weights(weights)
    sequence = _weighted_sequence(normalized, total_messages)
    if not sequence:
        return []

    replay: list[list[list[str | float]]] = []
    for idx, trigger in enumerate(sequence):
        primary_weight = normalized.get(trigger, 0.2)
        trigger_set: list[list[str | float]] = [[trigger, _calc_intensity(primary_weight, idx)]]

        # Every fourth message includes a secondary trigger to mirror live multi-trigger turns.
        if idx % 4 == 0 and len(sequence) > 1:
            secondary = sequence[(idx + 5) % len(sequence)]
            if secondary != trigger:
                secondary_weight = normalized.get(secondary, primary_weight * 0.8)
                trigger_set.append([secondary, _calc_intensity(secondary_weight, idx + 2)])

        replay.append(trigger_set)
    return replay


def _build_phase_replay(phases: list[dict[str, Any]], messages_per_day: int = 20) -> list[list[list[str | float]]]:
    replay: list[list[list[str | float]]] = []
    for phase in phases:
        span_days = max(1, int(phase.get("days", 1)))
        trigger_weights = phase.get("trigger_weights") or {}
        replay.extend(_build_replay_from_weights(trigger_weights, span_days * messages_per_day))
    return replay


def get_default_drift_archetypes() -> list[dict[str, Any]]:
    random_weights = {trigger: 1.0 for trigger in ALL_TRIGGERS if trigger != "neutral"}

    configs: list[dict[str, Any]] = [
        {
            "id": "aggressive",
            "name": "Aggressive",
            "description": "Demanding, critical, impatient user",
            "trigger_weights": {
                "disapproval": 0.28,
                "fear": 0.22,
                "disappointment": 0.18,
                "disgust": 0.14,
                "annoyance": 0.08,
                "admiration": 0.05,
                "approval": 0.05,
            },
            "outcome_weights": {"negative": 0.60, "neutral": 0.30, "positive": 0.10},
            "sample_count": 140,
        },
        {
            "id": "supportive",
            "name": "Supportive",
            "description": "Encouraging, grateful, empathetic user",
            "trigger_weights": {
                "admiration": 0.30,
                "approval": 0.25,
                "caring": 0.20,
                "love": 0.10,
                "relief": 0.07,
                "amusement": 0.05,
                "nervousness": 0.03,
            },
            "outcome_weights": {"positive": 0.70, "neutral": 0.25, "negative": 0.05},
            "sample_count": 140,
        },
        {
            "id": "playful",
            "name": "Playful",
            "description": "Joking, teasing, game-oriented user",
            "trigger_weights": {
                "amusement": 0.60,
                "desire": 0.15,
                "approval": 0.10,
                "admiration": 0.07,
                "nervousness": 0.05,
                "love": 0.03,
            },
            "outcome_weights": {"positive": 0.50, "neutral": 0.40, "negative": 0.10},
            "sample_count": 140,
        },
        {
            "id": "flirty",
            "name": "Flirty",
            "description": "Romantic, intimate, affectionate user",
            "trigger_weights": {
                "desire": 0.30,
                "admiration": 0.22,
                "nervousness": 0.16,
                "love": 0.12,
                "amusement": 0.10,
                "approval": 0.10,
            },
            "outcome_weights": {"positive": 0.55, "neutral": 0.35, "negative": 0.10},
            "sample_count": 140,
        },
        {
            "id": "neutral",
            "name": "Neutral",
            "description": "Everyday conversation, tasks, small talk",
            "trigger_weights": {
                "approval": 0.22,
                "admiration": 0.18,
                "caring": 0.15,
                "nervousness": 0.12,
                "love": 0.10,
                "amusement": 0.16,
                "relief": 0.07,
            },
            "outcome_weights": {"neutral": 0.60, "positive": 0.30, "negative": 0.10},
            "sample_count": 140,
        },
        {
            "id": "random",
            "name": "Random",
            "description": "Unpredictable mix of all behaviors",
            "trigger_weights": random_weights,
            "outcome_weights": {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
            "sample_count": 180,
        },
        {
            "id": "rough_day_then_recover",
            "name": "Rough Day -> Recovery",
            "description": "Starts critical and tense, then settles into neutral recovery.",
            "phases": [
                {
                    "days": 2,
                    "trigger_weights": {
                        "disapproval": 0.30,
                        "fear": 0.25,
                        "disappointment": 0.20,
                        "disgust": 0.15,
                        "annoyance": 0.05,
                        "admiration": 0.05,
                    },
                },
                {
                    "days": 5,
                    "trigger_weights": {
                        "approval": 0.24,
                        "admiration": 0.18,
                        "caring": 0.16,
                        "amusement": 0.22,
                        "nervousness": 0.10,
                        "love": 0.10,
                    },
                },
            ],
            "outcome_weights": {"neutral": 0.45, "positive": 0.25, "negative": 0.30},
            "sample_count": 140,
        },
        {
            "id": "lonely_then_playful",
            "name": "Lonely -> Playful",
            "description": "Starts vulnerable/withdrawn, then becomes playful and warm.",
            "phases": [
                {
                    "days": 3,
                    "trigger_weights": {
                        "nervousness": 0.28,
                        "love": 0.18,
                        "caring": 0.18,
                        "relief": 0.14,
                        "admiration": 0.12,
                        "approval": 0.10,
                    },
                },
                {
                    "days": 5,
                    "trigger_weights": {
                        "amusement": 0.52,
                        "desire": 0.16,
                        "admiration": 0.12,
                        "approval": 0.10,
                        "love": 0.10,
                    },
                },
            ],
            "outcome_weights": {"positive": 0.45, "neutral": 0.40, "negative": 0.15},
            "sample_count": 160,
        },
        {
            "id": "moody_week",
            "name": "Moody Week",
            "description": "Swings between negative, neutral, and positive days.",
            "phases": [
                {
                    "days": 2,
                    "trigger_weights": {
                        "disapproval": 0.25,
                        "disappointment": 0.22,
                        "fear": 0.18,
                        "disgust": 0.15,
                        "amusement": 0.20,
                    },
                },
                {
                    "days": 2,
                    "trigger_weights": {
                        "approval": 0.22,
                        "admiration": 0.20,
                        "caring": 0.16,
                        "amusement": 0.28,
                        "relief": 0.14,
                    },
                },
                {
                    "days": 3,
                    "trigger_weights": {
                        "amusement": 0.48,
                        "desire": 0.16,
                        "admiration": 0.14,
                        "approval": 0.12,
                        "love": 0.10,
                    },
                },
            ],
            "outcome_weights": {"positive": 0.35, "neutral": 0.35, "negative": 0.30},
            "sample_count": 140,
        },
    ]

    seeded: list[dict[str, Any]] = []
    for item in configs:
        sample_count = int(item.get("sample_count", 140))
        phases = item.get("phases")
        if isinstance(phases, list) and phases:
            message_triggers = _build_phase_replay(phases)
        else:
            message_triggers = _build_replay_from_weights(item.get("trigger_weights", {}), sample_count)

        seeded.append(
            {
                "id": item["id"],
                "name": item["name"],
                "description": item["description"],
                "message_triggers": message_triggers,
                "outcome_weights": item["outcome_weights"],
                "sample_count": len(message_triggers),
                "source_filename": "seed/default",
            }
        )
    return seeded
