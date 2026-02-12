"""
GoEmotions-based trigger classifier.

Uses RoBERTa fine-tuned on GoEmotions dataset for multi-label emotion detection.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import logging
import os
import re

logger = logging.getLogger(__name__)

# Lazy-loaded HF pipeline (heavy dependency + model load).
_classifier = None
_instance: TriggerClassifier | None = None

FILTERED_LABELS = {"neutral"}
DEFAULT_CONFIDENCE_THRESHOLD = 0.25
LOW_CONFIDENCE_THRESHOLD = 0.15

SARCASM_EXACT_OVERRIDES: dict[str, str] = {
    "thanks a lot": "annoyance",
    "real helpful": "annoyance",
    "just great": "annoyance",
    "oh perfect": "annoyance",
    "great job": "disappointment",
    "nice work": "disapproval",
}

SARCASM_CONTAINS_OVERRIDES: dict[str, str] = {
    "thanks for nothing": "disapproval",
    "great job genius": "disapproval",
    "oh perfect just perfect": "annoyance",
}

SARCASM_POSITIVE_LABELS = {
    "admiration",
    "approval",
    "gratitude",
    "joy",
    "love",
    "optimism",
    "pride",
    "relief",
}
SARCASM_NEGATIVE_LABELS = {
    "anger",
    "annoyance",
    "disappointment",
    "disapproval",
    "disgust",
}
_NON_WORD_RE = re.compile(r"[^a-z0-9\s']+")


def _normalize_text(text: str) -> str:
    lowered = text.strip().lower()
    without_punct = _NON_WORD_RE.sub(" ", lowered)
    return " ".join(without_punct.split())


def _contains_phrase(text: str, phrase: str) -> bool:
    padded_text = f" {text} "
    padded_phrase = f" {phrase} "
    return padded_phrase in padded_text


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _env_float(name: str, default: float, low: float, high: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = float(raw)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


def _get_classifier():
    """Lazy-load the HF pipeline to avoid backend startup delay."""
    global _classifier
    if _classifier is None:
        from transformers import pipeline

        _classifier = pipeline(
            "text-classification",
            model="SamLowe/roberta-base-go_emotions",
            top_k=None,
            device=-1,
        )
        logger.info("[TriggerClassifier] Loaded SamLowe/roberta-base-go_emotions")
    return _classifier


def _normalize_pipeline_output(raw: object) -> list[dict]:
    """Normalize pipeline output into a flat list of {label, score} dicts."""
    if isinstance(raw, dict):
        return [raw]
    if not isinstance(raw, list) or not raw:
        return []

    first = raw[0]
    if isinstance(first, dict):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(first, list):
        nested = first
        return [item for item in nested if isinstance(item, dict)]
    return []


@dataclass
class TriggerClassifier:
    """Classifies text into GoEmotions labels with confidence scores."""

    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
    low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD
    sarcasm_mitigation_enabled: bool = field(
        default_factory=lambda: _env_bool("SARCASM_MITIGATION_ENABLED", True)
    )
    sarcasm_exact_boost: float = field(
        default_factory=lambda: _env_float("SARCASM_EXACT_BOOST", 0.82, 0.0, 1.0)
    )
    sarcasm_contains_boost: float = field(
        default_factory=lambda: _env_float("SARCASM_CONTAINS_BOOST", 0.74, 0.0, 1.0)
    )
    sarcasm_positive_cap: float = field(
        default_factory=lambda: _env_float("SARCASM_POSITIVE_CAP", 0.34, 0.0, 1.0)
    )

    def _classify_scores(self, text: str) -> list[tuple[str, float]]:
        if not text or not text.strip():
            return []

        try:
            classifier = _get_classifier()
            # Truncate to a practical max sequence budget.
            raw = classifier(text.strip()[:512])
            emotions = _normalize_pipeline_output(raw)
        except Exception as exc:
            logger.exception("[TriggerClassifier] Classification failed: %s", exc)
            return []

        scores: list[tuple[str, float]] = []
        for item in emotions:
            label = str(item.get("label", "")).strip().lower()
            score = float(item.get("score", 0.0))
            if not label or label in FILTERED_LABELS:
                continue
            scores.append((label, score))

        if self.sarcasm_mitigation_enabled:
            scores = self._apply_sarcasm_phrase_overrides(text, scores)

        scores.sort(key=lambda x: -x[1])
        return scores

    def classify(self, text: str) -> list[tuple[str, float]]:
        """
        Return (label, confidence) tuples above confidence_threshold.
        """
        scores = self._classify_scores(text)
        return [item for item in scores if item[1] >= self.confidence_threshold]

    def get_max_confidence(self, text: str) -> float:
        """Get max non-neutral confidence, regardless of classification threshold."""
        scores = self._classify_scores(text)
        return max((score for _label, score in scores), default=0.0)

    def is_low_confidence(self, text: str) -> bool:
        """True when max non-neutral confidence is below low-confidence threshold."""
        return self.get_max_confidence(text) < self.low_confidence_threshold

    def _apply_sarcasm_phrase_overrides(
        self, text: str, scores: list[tuple[str, float]]
    ) -> list[tuple[str, float]]:
        """Boost negative labels for known sarcastic phrases and cap positives."""
        normalized = _normalize_text(text)
        if not normalized:
            return scores

        score_map: dict[str, float] = {}
        for label, score in scores:
            if label not in score_map or score > score_map[label]:
                score_map[label] = score

        applied_overrides: list[tuple[str, str]] = []

        exact_override = SARCASM_EXACT_OVERRIDES.get(normalized)
        if exact_override:
            score_map[exact_override] = max(score_map.get(exact_override, 0.0), self.sarcasm_exact_boost)
            applied_overrides.append((normalized, exact_override))

        for phrase, override_label in SARCASM_CONTAINS_OVERRIDES.items():
            if not _contains_phrase(normalized, phrase):
                continue
            score_map[override_label] = max(score_map.get(override_label, 0.0), self.sarcasm_contains_boost)
            applied_overrides.append((phrase, override_label))

        if not applied_overrides:
            return scores

        if any(label in SARCASM_NEGATIVE_LABELS for _phrase, label in applied_overrides):
            for label, value in list(score_map.items()):
                if label not in SARCASM_POSITIVE_LABELS:
                    continue
                score_map[label] = min(value, self.sarcasm_positive_cap)

        logger.debug(
            "[TriggerClassifier] Applied sarcasm overrides: text=%r overrides=%s",
            text[:120],
            applied_overrides,
        )
        return sorted(score_map.items(), key=lambda x: -x[1])


def get_trigger_classifier() -> TriggerClassifier:
    """Get/create singleton classifier instance."""
    global _instance
    if _instance is None:
        _instance = TriggerClassifier()
    return _instance


def clear_classifier_cache() -> None:
    """Reset singleton and lazy-loaded pipeline (used by tests)."""
    global _instance, _classifier
    _instance = None
    _classifier = None
