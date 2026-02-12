"""Tests for the GoEmotions trigger classifier."""
from __future__ import annotations

import pytest

from services import trigger_classifier as trigger_classifier_module
from services.trigger_classifier import (
    TriggerClassifier,
    clear_classifier_cache,
    get_trigger_classifier,
)


def _fake_pipeline(text: str):
    lowered = text.lower()

    if "great job" in lowered and "proud" in lowered:
        emotions = [
            {"label": "admiration", "score": 0.91},
            {"label": "approval", "score": 0.62},
        ]
    elif "great job" in lowered:
        emotions = [
            {"label": "admiration", "score": 0.89},
            {"label": "approval", "score": 0.57},
        ]
    elif "real helpful" in lowered:
        emotions = [
            {"label": "approval", "score": 0.85},
            {"label": "gratitude", "score": 0.44},
        ]
    elif "thanks a lot" in lowered:
        emotions = [
            {"label": "gratitude", "score": 0.88},
            {"label": "joy", "score": 0.41},
            {"label": "neutral", "score": 0.02},
        ]
    elif "perfect" in lowered:
        emotions = [
            {"label": "joy", "score": 0.78},
            {"label": "admiration", "score": 0.42},
        ]
    elif "incredible" in lowered or "amazing" in lowered:
        emotions = [
            {"label": "admiration", "score": 0.92},
            {"label": "joy", "score": 0.64},
            {"label": "neutral", "score": 0.03},
        ]
    elif "thank you" in lowered or "thanks" in lowered:
        emotions = [
            {"label": "gratitude", "score": 0.88},
            {"label": "joy", "score": 0.41},
            {"label": "neutral", "score": 0.02},
        ]
    elif "love you" in lowered and "scared" in lowered:
        emotions = [
            {"label": "love", "score": 0.79},
            {"label": "fear", "score": 0.66},
            {"label": "neutral", "score": 0.02},
        ]
    elif "furious" in lowered or "angry" in lowered:
        emotions = [
            {"label": "anger", "score": 0.93},
            {"label": "annoyance", "score": 0.56},
        ]
    elif "sorry" in lowered:
        emotions = [
            {"label": "remorse", "score": 0.84},
            {"label": "sadness", "score": 0.35},
        ]
    elif "curious" in lowered:
        emotions = [
            {"label": "curiosity", "score": 0.81},
            {"label": "realization", "score": 0.26},
        ]
    elif "wow" in lowered:
        emotions = [
            {"label": "surprise", "score": 0.86},
            {"label": "excitement", "score": 0.22},
        ]
    elif "weather" in lowered:
        emotions = [
            {"label": "neutral", "score": 0.96},
            {"label": "curiosity", "score": 0.08},
        ]
    elif lowered.strip() in {"ok", "sure", "k"}:
        emotions = [
            {"label": "neutral", "score": 0.90},
            {"label": "curiosity", "score": 0.07},
        ]
    else:
        emotions = [{"label": "neutral", "score": 0.92}]

    # HF pipeline usually returns List[List[dict]] for one input when top_k=None.
    return [emotions]


@pytest.fixture(autouse=True)
def _reset_classifier_cache():
    clear_classifier_cache()
    yield
    clear_classifier_cache()


@pytest.fixture(autouse=True)
def _mock_pipeline(monkeypatch):
    monkeypatch.setattr(trigger_classifier_module, "_get_classifier", lambda: _fake_pipeline)


@pytest.fixture(autouse=True)
def _enable_sarcasm(monkeypatch):
    monkeypatch.setenv("SARCASM_MITIGATION_ENABLED", "1")


class TestTriggerClassifier:
    @pytest.fixture
    def classifier(self):
        return TriggerClassifier()

    def test_positive_emotion_detection(self, classifier):
        labels = [label for label, _score in classifier.classify("You're incredible!")]
        assert "admiration" in labels

    def test_negative_emotion_detection(self, classifier):
        labels = [label for label, _score in classifier.classify("I'm furious right now")]
        assert "anger" in labels

    def test_self_conscious_emotion_detection(self, classifier):
        labels = [label for label, _score in classifier.classify("I'm so sorry about that")]
        assert "remorse" in labels

    def test_neutral_category_detection(self, classifier):
        labels = [label for label, _score in classifier.classify("I'm curious about this")]
        assert "curiosity" in labels

    def test_neutral_label_filtered_out(self, classifier):
        labels = [label for label, _score in classifier.classify("The weather is nice today")]
        assert "neutral" not in labels

    def test_multi_label_detection(self, classifier):
        labels = [
            label for label, _score in classifier.classify(
                "I love you but I'm scared of losing you"
            )
        ]
        assert "love" in labels
        assert "fear" in labels

    def test_confidence_thresholds(self):
        high_threshold_classifier = TriggerClassifier(confidence_threshold=0.90)
        low_threshold_classifier = TriggerClassifier(confidence_threshold=0.30)

        high = high_threshold_classifier.classify("Thank you so much")
        low = low_threshold_classifier.classify("Thank you so much")

        assert len(low) >= len(high)
        assert all(score >= 0.90 for _label, score in high)

    def test_edge_cases(self, classifier):
        assert classifier.classify("") == []
        assert classifier.classify("   ") == []
        assert classifier.is_low_confidence("ok")
        assert classifier.is_low_confidence("sure")

    def test_sarcasm_exact_override(self, classifier):
        labels = [label for label, _score in classifier.classify("thanks a lot")]
        assert labels
        assert labels[0] in {"annoyance", "disapproval", "disappointment"}

    def test_sarcasm_contains_override(self, classifier):
        labels = [label for label, _score in classifier.classify("Great job genius")]
        assert labels
        assert labels[0] in {"annoyance", "disapproval", "disappointment"}

    def test_genuine_positive_not_flipped(self, classifier):
        labels = [label for label, _score in classifier.classify("great job, I'm proud of you")]
        assert labels[0] in {"admiration", "approval"}
        assert "disapproval" not in labels[:2]


class TestTriggerClassifierSingleton:
    def test_get_trigger_classifier_returns_same_instance(self):
        c1 = get_trigger_classifier()
        c2 = get_trigger_classifier()
        assert c1 is c2
