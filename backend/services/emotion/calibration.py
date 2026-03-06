"""Calibration models and recovery utilities for emotional learning."""
from __future__ import annotations

from dataclasses import dataclass
import time as _time
from typing import ClassVar, TYPE_CHECKING

if TYPE_CHECKING:
    from services.emotion_engine import EmotionalState


@dataclass
class TriggerCalibration:
    """Per-trigger learned response profile with Bayesian smoothing."""

    trigger_type: str

    positive_weight: float = 0.0
    negative_weight: float = 0.0
    neutral_weight: float = 0.0
    occurrence_count: int = 0

    PRIOR_POSITIVE: ClassVar[float] = 10.0
    PRIOR_NEGATIVE: ClassVar[float] = 10.0
    PRIOR_TOTAL: ClassVar[float] = 20.0
    MIN_SAMPLES: ClassVar[int] = 30

    learned_multiplier: float = 1.0
    last_occurrence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "trigger_type": self.trigger_type,
            "positive_weight": self.positive_weight,
            "negative_weight": self.negative_weight,
            "neutral_weight": self.neutral_weight,
            "occurrence_count": self.occurrence_count,
            "learned_multiplier": self.learned_multiplier,
            "last_occurrence": self.last_occurrence,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TriggerCalibration":
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        cal.positive_weight = d.get("positive_weight", 0.0)
        cal.negative_weight = d.get("negative_weight", 0.0)
        cal.neutral_weight = d.get("neutral_weight", 0.0)
        cal.occurrence_count = d.get("occurrence_count", 0)
        cal.learned_multiplier = d.get("learned_multiplier", 1.0)
        cal.last_occurrence = d.get("last_occurrence", 0.0)
        return cal

    def update(self, outcome: str, confidence: float) -> None:
        self.occurrence_count += 1
        self.last_occurrence = _time.time()

        if outcome == "positive":
            self.positive_weight += confidence
        elif outcome == "negative":
            self.negative_weight += confidence
        else:
            self.neutral_weight += confidence * 0.5

        self.recompute_multiplier()

    def recompute_multiplier(self) -> None:
        pos = self.positive_weight + self.PRIOR_POSITIVE
        neg = self.negative_weight + self.PRIOR_NEGATIVE
        total = pos + neg

        rate = pos / total
        raw_multiplier = 0.75 + 0.5 * rate

        if self.occurrence_count < self.MIN_SAMPLES:
            blend = self.occurrence_count / self.MIN_SAMPLES
            self.learned_multiplier = 1.0 + (raw_multiplier - 1.0) * blend
        else:
            self.learned_multiplier = raw_multiplier

        self.learned_multiplier = max(0.5, min(1.5, self.learned_multiplier))


@dataclass
class ContextBucket:
    """Context state for bucketed calibration."""

    trust_level: str
    arousal_level: str
    recent_conflict: bool

    @classmethod
    def from_state(cls, state: "EmotionalState") -> "ContextBucket":
        return cls(
            trust_level="low" if state.trust < 0.4 else "high" if state.trust > 0.7 else "mid",
            arousal_level="calm" if state.arousal < 0.3 else "activated",
            recent_conflict=getattr(state, "conflict_tolerance", 0.7) < 0.5,
        )

    def key(self) -> str:
        return f"{self.trust_level}_{self.arousal_level}_{'conflict' if self.recent_conflict else 'ok'}"


class ContextualTriggerCalibration:
    """Calibration that varies by relationship context."""

    def __init__(self, trigger_type: str):
        self.trigger_type = trigger_type
        self.buckets: dict[str, TriggerCalibration] = {}
        self.global_cal = TriggerCalibration(trigger_type=trigger_type)

    def get_multiplier(self, context: ContextBucket) -> float:
        key = context.key()
        if key in self.buckets and self.buckets[key].occurrence_count >= 10:
            return self.buckets[key].learned_multiplier
        return self.global_cal.learned_multiplier

    def update(self, context: ContextBucket, outcome: str, confidence: float) -> None:
        key = context.key()
        self.global_cal.update(outcome, confidence)
        if key not in self.buckets:
            self.buckets[key] = TriggerCalibration(trigger_type=self.trigger_type)
        self.buckets[key].update(outcome, confidence)

    def to_dict(self) -> dict:
        return {
            "trigger_type": self.trigger_type,
            "global": self.global_cal.to_dict(),
            "buckets": {k: v.to_dict() for k, v in self.buckets.items()},
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ContextualTriggerCalibration":
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        if "global" in d:
            cal.global_cal = TriggerCalibration.from_dict(d["global"])
        if "buckets" in d:
            cal.buckets = {k: TriggerCalibration.from_dict(v) for k, v in d["buckets"].items()}
        return cal


class CalibrationRecovery:
    """Mechanisms to prevent irreversible calibration drift."""

    REPAIR_WINDOW_HOURS: float = 24.0
    REPAIR_BOOST: float = 1.5
    DECAY_RATE_PER_WEEK: float = 0.05

    @staticmethod
    def apply_repair_boost(confidence: float, state: "EmotionalState", outcome: str) -> float:
        if outcome != "positive":
            return confidence
        if getattr(state, "conflict_tolerance", 0.7) < 0.5:
            return confidence * CalibrationRecovery.REPAIR_BOOST
        return confidence

    @staticmethod
    def apply_decay_to_neutral(calibration: TriggerCalibration, hours_since_last: float) -> None:
        if hours_since_last < 24 * 7:
            return
        weeks_inactive = hours_since_last / (24 * 7)
        decay = min(0.3, CalibrationRecovery.DECAY_RATE_PER_WEEK * weeks_inactive)
        calibration.learned_multiplier = (
            calibration.learned_multiplier * (1 - decay) + 1.0 * decay
        )
