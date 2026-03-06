"""Outcome inference helpers for emotional learning."""
from __future__ import annotations

from dataclasses import dataclass

from services.emotion.taxonomy import MOOD_GROUPS


@dataclass
class OutcomeSignal:
    """A single signal contributing to outcome inference."""

    source: str
    direction: str  # "positive", "negative", "neutral"
    weight: float
    confidence: float


POSITIVE_EXPLICIT = {
    "lol", "😂", "haha", "hehe", "love that", "perfect", "yes!",
    "❤️", "🥰", "😍", "amazing", "thank you", "thanks",
}
NEGATIVE_EXPLICIT = {
    "stop", "don't", "that hurt", "not funny", "rude", "wtf",
    "😢", "😠", "ugh", "annoying", "shut up", "go away",
}

CONFIDENCE_THRESHOLD = 0.5


def infer_outcome_multisignal(
    next_user_message: str | None,
    agent_behavior: dict,
    response_latency_ms: int | None = None,
) -> tuple[str, float]:
    """Infer outcome from explicit, behavioral, and mood-tag signals."""
    signals: list[OutcomeSignal] = []

    if next_user_message:
        msg_lower = next_user_message.lower()
        for phrase in POSITIVE_EXPLICIT:
            if phrase in msg_lower:
                signals.append(OutcomeSignal("user_explicit", "positive", 0.9, 0.85))
                break
        for phrase in NEGATIVE_EXPLICIT:
            if phrase in msg_lower:
                signals.append(OutcomeSignal("user_explicit", "negative", 0.9, 0.85))
                break

    if response_latency_ms is not None:
        if response_latency_ms < 5000:
            signals.append(OutcomeSignal("user_behavior", "positive", 0.3, 0.6))
        elif response_latency_ms > 120000:
            signals.append(OutcomeSignal("user_behavior", "negative", 0.3, 0.5))

    mood = agent_behavior.get("mood", "").lower()
    _positive_groups = {"warm", "playful"}
    _negative_groups = {"sharp", "dark"}
    positive_moods = {m for g, info in MOOD_GROUPS.items() if g in _positive_groups for m in info["moods"]}
    negative_moods = {m for g, info in MOOD_GROUPS.items() if g in _negative_groups for m in info["moods"]}

    if mood in positive_moods:
        signals.append(OutcomeSignal("agent_tag", "positive", 0.4, 0.5))
    elif mood in negative_moods:
        signals.append(OutcomeSignal("agent_tag", "negative", 0.4, 0.5))

    if not signals:
        return ("neutral", 0.3)

    pos_score = sum(s.weight * s.confidence for s in signals if s.direction == "positive")
    neg_score = sum(s.weight * s.confidence for s in signals if s.direction == "negative")

    if pos_score > neg_score * 1.2:
        confidence = min(0.95, pos_score / (pos_score + neg_score + 0.1))
        return ("positive", confidence)
    if neg_score > pos_score * 1.2:
        confidence = min(0.95, neg_score / (pos_score + neg_score + 0.1))
        return ("negative", confidence)

    return ("neutral", 0.4)
