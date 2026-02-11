"""
GoEmotions-based trigger classifier.

Uses RoBERTa fine-tuned on GoEmotions dataset for multi-label emotion detection.
"""
from __future__ import annotations

from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# Lazy-loaded HF pipeline (heavy dependency + model load).
_classifier = None
_instance: TriggerClassifier | None = None

FILTERED_LABELS = {"neutral"}
DEFAULT_CONFIDENCE_THRESHOLD = 0.25
LOW_CONFIDENCE_THRESHOLD = 0.15


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
