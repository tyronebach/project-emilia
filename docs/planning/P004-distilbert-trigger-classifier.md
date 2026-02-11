# P004: GoEmotions Trigger Classifier

> **Status**: Ready for implementation  
> **Author**: Beatrice  
> **Created**: 2026-02-10  
> **Updated**: 2026-02-10 (switched from 6-emotion DistilBERT to 28-label GoEmotions)
> **Priority**: High  

## Summary

Replace the regex-based trigger detection with a GoEmotions classifier. Adopt GoEmotions' 28-label taxonomy as the canonical trigger system, replacing the custom 23-trigger taxonomy. LLM fallback is optional (disabled by default).

## Why GoEmotions?

| Approach | Labels | Mapping Complexity | Accuracy |
|----------|--------|-------------------|----------|
| 6-emotion DistilBERT | 6 | High (6 → 23) | Good |
| **GoEmotions** | 28 | **Low (nearly 1:1)** | **Better** |
| Custom fine-tuned | 23 | None | Best (requires training data) |

GoEmotions labels map almost directly to our existing triggers — no lossy mapping needed.

## Goals

1. **Adopt GoEmotions as canonical taxonomy** — cleaner, research-backed
2. **Remove regex entirely** — brittle, misses nuance
3. **Add local RoBERTa classifier** — fast, accurate, zero API cost
4. **Keep LLM as optional fallback** — disabled by default
5. **Migrate existing trigger logic** — same emotional deltas, new labels

## Architecture

```
User Message
     │
     ▼
┌─────────────────────────────────┐
│   GoEmotionsTriggerClassifier   │  ← Primary (always runs)
│   - Model: roberta-go_emotions  │
│   - Output: 28 emotion scores   │
│   - Multi-label detection       │
│   - Latency: <100ms             │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│     Filter by threshold         │  ← Keep emotions with score > 0.25
│     Apply to emotional state    │
└─────────────────────────────────┘
     │
     ├─── confidence > threshold ──► Return triggers
     │
     ▼ (if LLM_TRIGGER_DETECTION=1 AND low confidence)
┌─────────────────────────────────┐
│        LLM Fallback             │  ← Optional, disabled by default
└─────────────────────────────────┘
```

## GoEmotions Taxonomy (28 labels)

### Full Label Reference

| Label | Valence | Arousal | Category | Old Trigger Equivalent |
|-------|---------|---------|----------|----------------------|
| admiration | + | + | positive | praise |
| amusement | + | + | positive | teasing, banter |
| anger | − | ++ | negative | conflict |
| annoyance | − | + | negative | criticism |
| approval | + | 0 | positive | affirmation |
| caring | + | 0 | positive | comfort |
| confusion | 0 | + | neutral | curiosity |
| curiosity | + | + | neutral | curiosity |
| desire | + | + | positive | flirting |
| disappointment | − | − | negative | dismissal |
| disapproval | − | + | negative | criticism |
| disgust | − | + | negative | rejection |
| embarrassment | − | + | self-conscious | vulnerability |
| excitement | + | ++ | positive | praise, shared_joy |
| fear | − | ++ | negative | boundary |
| gratitude | + | 0 | positive | gratitude |
| grief | −− | − | negative | (rare, keep) |
| joy | + | + | positive | praise |
| love | ++ | + | positive | compliment |
| nervousness | − | + | self-conscious | disclosure |
| optimism | + | + | positive | affirmation |
| pride | + | + | self-conscious | praise |
| realization | 0 | + | neutral | curiosity |
| relief | + | − | positive | comfort |
| remorse | − | − | self-conscious | apology |
| sadness | − | − | negative | vulnerability |
| surprise | 0 | ++ | neutral | banter |
| neutral | 0 | 0 | neutral | (no trigger) |

### Trigger Categories (Updated)

```python
TRIGGER_TAXONOMY = {
    "positive": [
        "admiration", "amusement", "approval", "caring", 
        "excitement", "gratitude", "joy", "love", "optimism", 
        "pride", "relief"
    ],
    "negative": [
        "anger", "annoyance", "disappointment", "disapproval",
        "disgust", "fear", "grief", "sadness"
    ],
    "self_conscious": [
        "embarrassment", "nervousness", "remorse"
    ],
    "neutral": [
        "confusion", "curiosity", "realization", "surprise"
    ],
    "intimate": [
        "desire", "love", "caring"
    ],
}
```

## Full Emotional Delta Mapping

This is the core mapping — each GoEmotions label maps to emotional state changes.

```python
DEFAULT_TRIGGER_DELTAS: dict[str, dict[str, float]] = {
    # ============================================================
    # POSITIVE EMOTIONS
    # ============================================================
    
    "admiration": {
        "valence": 0.12,
        "arousal": 0.06,
        "trust": 0.03,
        "attachment": 0.01,
    },
    
    "amusement": {
        "valence": 0.08,
        "arousal": 0.10,
        "trust": 0.015,
    },
    
    "approval": {
        "valence": 0.07,
        "arousal": 0.02,
        "trust": 0.025,
    },
    
    "caring": {
        "valence": 0.12,
        "arousal": -0.10,
        "trust": 0.04,
        "intimacy": 0.02,
    },
    
    "excitement": {
        "valence": 0.14,
        "arousal": 0.16,
        "trust": 0.02,
        "attachment": 0.01,
    },
    
    "gratitude": {
        "valence": 0.10,
        "arousal": 0.02,
        "trust": 0.04,
        "attachment": 0.015,
    },
    
    "joy": {
        "valence": 0.12,
        "arousal": 0.08,
        "trust": 0.02,
    },
    
    "love": {
        "valence": 0.15,
        "arousal": 0.06,
        "trust": 0.05,
        "attachment": 0.03,
        "intimacy": 0.04,
    },
    
    "optimism": {
        "valence": 0.08,
        "arousal": 0.04,
        "trust": 0.02,
    },
    
    "pride": {
        "valence": 0.10,
        "arousal": 0.08,
        "trust": 0.02,
        "dominance": 0.03,
    },
    
    "relief": {
        "valence": 0.08,
        "arousal": -0.12,
        "trust": 0.02,
    },
    
    # ============================================================
    # NEGATIVE EMOTIONS
    # ============================================================
    
    "anger": {
        "valence": -0.20,
        "arousal": 0.22,
        "trust": -0.08,
        "dominance": 0.05,
    },
    
    "annoyance": {
        "valence": -0.10,
        "arousal": 0.08,
        "trust": -0.03,
    },
    
    "disappointment": {
        "valence": -0.14,
        "arousal": -0.06,
        "trust": -0.04,
        "attachment": -0.01,
    },
    
    "disapproval": {
        "valence": -0.12,
        "arousal": 0.06,
        "trust": -0.035,
    },
    
    "disgust": {
        "valence": -0.18,
        "arousal": 0.10,
        "trust": -0.06,
    },
    
    "fear": {
        "valence": -0.16,
        "arousal": 0.20,
        "trust": -0.05,
        "dominance": -0.08,
    },
    
    "grief": {
        "valence": -0.22,
        "arousal": -0.10,
        "trust": 0.0,
        "attachment": 0.02,  # grief can deepen attachment to memory
    },
    
    "sadness": {
        "valence": -0.14,
        "arousal": -0.08,
        "trust": 0.0,
        "attachment": 0.01,
    },
    
    # ============================================================
    # SELF-CONSCIOUS EMOTIONS
    # ============================================================
    
    "embarrassment": {
        "valence": -0.08,
        "arousal": 0.12,
        "trust": 0.02,  # vulnerability can build trust
        "dominance": -0.06,
        "intimacy": 0.015,
    },
    
    "nervousness": {
        "valence": -0.06,
        "arousal": 0.14,
        "trust": 0.03,
        "intimacy": 0.02,
    },
    
    "remorse": {
        "valence": -0.08,
        "arousal": -0.04,
        "trust": 0.04,  # taking responsibility builds trust
        "dominance": -0.04,
    },
    
    # ============================================================
    # NEUTRAL / COGNITIVE EMOTIONS
    # ============================================================
    
    "confusion": {
        "valence": -0.02,
        "arousal": 0.06,
        "trust": 0.0,
    },
    
    "curiosity": {
        "valence": 0.04,
        "arousal": 0.08,
        "trust": 0.01,
        "intimacy": 0.01,
    },
    
    "realization": {
        "valence": 0.03,
        "arousal": 0.10,
        "trust": 0.005,
    },
    
    "surprise": {
        "valence": 0.02,
        "arousal": 0.14,
        "trust": 0.0,
    },
    
    # ============================================================
    # INTIMATE EMOTIONS (subset, already covered above)
    # ============================================================
    
    "desire": {
        "valence": 0.10,
        "arousal": 0.14,
        "trust": 0.02,
        "intimacy": 0.04,
        "attachment": 0.02,
    },
    
    # ============================================================
    # NEUTRAL (no emotional impact)
    # ============================================================
    
    "neutral": {
        "valence": 0.0,
        "arousal": 0.0,
        "trust": 0.0,
    },
}
```

## Migration: Old Triggers → GoEmotions

For backward compatibility during transition:

```python
LEGACY_TRIGGER_ALIASES = {
    # Old trigger → GoEmotions label(s)
    "praise": "admiration",
    "compliment": "love",
    "gratitude": "gratitude",
    "affirmation": "approval",
    "comfort": "caring",
    "teasing": "amusement",
    "banter": "amusement",
    "flirting": "desire",
    "criticism": "disapproval",
    "rejection": "disgust",
    "boundary": "fear",
    "dismissal": "disappointment",
    "conflict": "anger",
    "apology": "remorse",
    "accountability": "remorse",
    "reconnection": "relief",
    "disclosure": "nervousness",
    "trust_signal": "love",
    "vulnerability": "embarrassment",
    "greeting": "joy",  # or neutral
    "farewell": "sadness",  # or neutral
    "curiosity": "curiosity",
    "shared_joy": "excitement",
}
```

## Technical Design

### New File: `backend/services/trigger_classifier.py`

```python
"""
GoEmotions-based trigger classifier.

Uses RoBERTa fine-tuned on GoEmotions dataset for multi-label emotion detection.
Replaces regex patterns with ML-based classification.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import ClassVar

logger = logging.getLogger(__name__)

# Lazy import transformers (heavy dependency)
_classifier = None


def _get_classifier():
    """Lazy-load the classifier to avoid startup delay."""
    global _classifier
    if _classifier is None:
        from transformers import pipeline
        _classifier = pipeline(
            "text-classification",
            model="SamLowe/roberta-base-go_emotions",
            top_k=None,  # Return all labels
            device=-1,   # CPU
        )
        logger.info("[TriggerClassifier] GoEmotions model loaded")
    return _classifier


# Labels that don't trigger emotional responses (filtered out)
FILTERED_LABELS = {"neutral"}

# Minimum confidence to consider an emotion detected
DEFAULT_CONFIDENCE_THRESHOLD = 0.25

# Below this, we might want LLM fallback
LOW_CONFIDENCE_THRESHOLD = 0.15


@dataclass
class TriggerClassifier:
    """
    Classifies text into emotional triggers using GoEmotions RoBERTa.
    
    The model outputs 28 emotion labels with confidence scores.
    Multi-label: multiple emotions can be detected simultaneously.
    """
    
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
    low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD
    
    def classify(self, text: str) -> list[tuple[str, float]]:
        """
        Classify text into emotional triggers.
        
        Args:
            text: User message to classify
            
        Returns:
            List of (emotion_label, confidence) tuples, sorted by confidence desc.
            Only returns emotions above confidence_threshold.
        """
        if not text or not text.strip():
            return []
        
        text = text.strip()
        
        try:
            classifier = _get_classifier()
            # Model returns list of {label, score} dicts for each input
            results = classifier(text[:512])[0] if isinstance(
                classifier(text[:512]), list
            ) else classifier(text[:512])
            
            # Handle both formats (pipeline can return different structures)
            if isinstance(results, list) and len(results) > 0:
                if isinstance(results[0], dict):
                    # Direct list of dicts
                    emotions = results
                else:
                    # Nested list
                    emotions = results[0] if isinstance(results[0], list) else results
            else:
                emotions = []
            
            # Filter by threshold and exclude neutral
            triggers = []
            for item in emotions:
                label = item.get("label", "")
                score = item.get("score", 0.0)
                
                if label in FILTERED_LABELS:
                    continue
                    
                if score >= self.confidence_threshold:
                    triggers.append((label, score))
            
            # Sort by confidence descending
            triggers.sort(key=lambda x: -x[1])
            
            return triggers
            
        except Exception as e:
            logger.exception("[TriggerClassifier] Classification failed: %s", e)
            return []
    
    def get_max_confidence(self, text: str) -> float:
        """Get the maximum confidence score for any non-neutral emotion."""
        if not text or not text.strip():
            return 0.0
        try:
            triggers = self.classify(text)
            return max((t[1] for t in triggers), default=0.0)
        except Exception:
            return 0.0
    
    def is_low_confidence(self, text: str) -> bool:
        """Check if classification confidence is below LLM fallback threshold."""
        return self.get_max_confidence(text) < self.low_confidence_threshold


# Singleton instance
_instance: TriggerClassifier | None = None


def get_trigger_classifier() -> TriggerClassifier:
    """Get or create the singleton classifier instance."""
    global _instance
    if _instance is None:
        _instance = TriggerClassifier()
    return _instance


def clear_classifier_cache() -> None:
    """Clear the classifier instance (for testing)."""
    global _instance, _classifier
    _instance = None
    _classifier = None
```

### Changes to `emotion_engine.py`

#### Remove:
- `TRIGGER_PATTERNS` dict (~100 lines of regex)
- `_compiled_patterns` class variable
- `_compile_patterns()` method
- `TRIGGER_ALIASES` dict
- `normalize_trigger()` function (or simplify to just validate)

#### Replace:
- `DEFAULT_TRIGGER_DELTAS` with new GoEmotions mapping (see above)
- `TRIGGER_TAXONOMY` with new categories
- `ALL_TRIGGERS` list

#### Modify:
- `detect_triggers()` to use `TriggerClassifier`
- `detect_triggers_llm()` to use GoEmotions labels in prompt

```python
# In EmotionEngine class

def __init__(self, profile: AgentProfile):
    self.profile = profile
    self.mood_injection_settings = self._load_mood_injection_settings()
    # NEW: Initialize classifier
    from services.trigger_classifier import get_trigger_classifier
    self._classifier = get_trigger_classifier()

def detect_triggers(self, text: str) -> list[tuple[str, float]]:
    """
    Detect emotional triggers from text using GoEmotions classifier.
    
    Returns list of (trigger_name, intensity) tuples.
    """
    if not text:
        return []
    
    # Use ML classifier
    triggers = self._classifier.classify(text)
    
    # Filter to known triggers only
    valid_triggers = []
    for trigger, confidence in triggers:
        if trigger in self.DEFAULT_TRIGGER_DELTAS:
            valid_triggers.append((trigger, confidence))
    
    # Optional: LLM fallback for low confidence
    from config import settings
    if settings.trigger_classifier_llm_fallback:
        if self._classifier.is_low_confidence(text) and not valid_triggers:
            # Fall back to LLM (async would need to be handled by caller)
            pass
    
    return valid_triggers
```

### Changes to `config.py`

```python
# Trigger classifier settings
self.trigger_classifier_enabled: bool = os.getenv(
    "TRIGGER_CLASSIFIER_ENABLED", "1"
) == "1"
self.trigger_classifier_confidence: float = float(
    os.getenv("TRIGGER_CLASSIFIER_CONFIDENCE", "0.25")
)
self.trigger_classifier_llm_fallback: bool = os.getenv(
    "LLM_TRIGGER_DETECTION", "0"
) == "1"
```

### Changes to `requirements.txt`

```
transformers>=4.36.0
torch>=2.0.0
```

**Production optimization (optional):**
```
onnxruntime>=1.16.0
```

Use the ONNX version: `SamLowe/roberta-base-go_emotions-onnx`

## Test Plan

### New File: `backend/tests/test_trigger_classifier.py`

```python
"""Tests for the GoEmotions trigger classifier."""
import pytest
from services.trigger_classifier import (
    TriggerClassifier, 
    get_trigger_classifier,
    clear_classifier_cache,
)


@pytest.fixture(autouse=True)
def reset_classifier():
    """Reset classifier singleton between tests."""
    clear_classifier_cache()
    yield
    clear_classifier_cache()


class TestTriggerClassifier:
    """Tests for TriggerClassifier with GoEmotions."""
    
    @pytest.fixture
    def classifier(self):
        return TriggerClassifier()
    
    # === Positive emotions ===
    
    def test_detects_admiration(self, classifier):
        """Admiration should be detected for praise-like messages."""
        triggers = classifier.classify("You're absolutely incredible at this!")
        labels = [t[0] for t in triggers]
        assert "admiration" in labels or "joy" in labels
    
    def test_detects_gratitude(self, classifier):
        """Gratitude should be detected."""
        triggers = classifier.classify("Thank you so much for everything!")
        labels = [t[0] for t in triggers]
        assert "gratitude" in labels
    
    def test_detects_love(self, classifier):
        """Love should be detected for affectionate messages."""
        triggers = classifier.classify("I love you with all my heart")
        labels = [t[0] for t in triggers]
        assert "love" in labels
    
    def test_detects_amusement(self, classifier):
        """Amusement should be detected for playful messages."""
        triggers = classifier.classify("Haha that's hilarious, you goof!")
        labels = [t[0] for t in triggers]
        assert "amusement" in labels or "joy" in labels
    
    def test_detects_caring(self, classifier):
        """Caring should be detected for supportive messages."""
        triggers = classifier.classify("I'm here for you, take your time")
        labels = [t[0] for t in triggers]
        assert "caring" in labels or "love" in labels
    
    # === Negative emotions ===
    
    def test_detects_anger(self, classifier):
        """Anger should be detected for hostile messages."""
        triggers = classifier.classify("I'm furious! How could you do this?!")
        labels = [t[0] for t in triggers]
        assert "anger" in labels
    
    def test_detects_disappointment(self, classifier):
        """Disappointment should be detected."""
        triggers = classifier.classify("I expected more from you, honestly")
        labels = [t[0] for t in triggers]
        assert "disappointment" in labels or "disapproval" in labels
    
    def test_detects_disapproval(self, classifier):
        """Disapproval should be detected for critical messages."""
        triggers = classifier.classify("This is wrong and you should fix it")
        labels = [t[0] for t in triggers]
        assert "disapproval" in labels or "annoyance" in labels
    
    def test_detects_fear(self, classifier):
        """Fear should be detected."""
        triggers = classifier.classify("I'm scared, please stop doing that")
        labels = [t[0] for t in triggers]
        assert "fear" in labels or "nervousness" in labels
    
    def test_detects_sadness(self, classifier):
        """Sadness should be detected."""
        triggers = classifier.classify("I feel so alone and empty inside")
        labels = [t[0] for t in triggers]
        assert "sadness" in labels
    
    # === Self-conscious emotions ===
    
    def test_detects_remorse(self, classifier):
        """Remorse should be detected for apologies."""
        triggers = classifier.classify("I'm so sorry, that was my fault")
        labels = [t[0] for t in triggers]
        assert "remorse" in labels or "sadness" in labels
    
    def test_detects_nervousness(self, classifier):
        """Nervousness should be detected for vulnerable disclosure."""
        triggers = classifier.classify("I've never told anyone this before...")
        labels = [t[0] for t in triggers]
        assert "nervousness" in labels or "fear" in labels
    
    # === Neutral/cognitive emotions ===
    
    def test_detects_curiosity(self, classifier):
        """Curiosity should be detected."""
        triggers = classifier.classify("I'm curious, what do you think about this?")
        labels = [t[0] for t in triggers]
        assert "curiosity" in labels
    
    def test_detects_surprise(self, classifier):
        """Surprise should be detected."""
        triggers = classifier.classify("Wow! I did not expect that at all!")
        labels = [t[0] for t in triggers]
        assert "surprise" in labels
    
    # === Edge cases ===
    
    def test_empty_string_returns_empty(self, classifier):
        """Empty input should return empty list."""
        assert classifier.classify("") == []
        assert classifier.classify("   ") == []
    
    def test_neutral_filtered_out(self, classifier):
        """Neutral label should be filtered out."""
        triggers = classifier.classify("The weather is nice today")
        labels = [t[0] for t in triggers]
        assert "neutral" not in labels
    
    def test_multi_label_detection(self, classifier):
        """Multiple emotions can be detected in one message."""
        triggers = classifier.classify(
            "I love you but I'm also scared of losing you"
        )
        labels = [t[0] for t in triggers]
        # Should detect both love and fear/nervousness
        assert len(triggers) >= 1
    
    def test_confidence_ordering(self, classifier):
        """Triggers should be ordered by confidence descending."""
        triggers = classifier.classify("I absolutely love this so much!")
        if len(triggers) > 1:
            confidences = [t[1] for t in triggers]
            assert confidences == sorted(confidences, reverse=True)
    
    # === Threshold behavior ===
    
    def test_low_confidence_detection(self, classifier):
        """Ambiguous text should be flagged as low confidence."""
        assert classifier.is_low_confidence("ok")
        assert classifier.is_low_confidence("sure")
    
    def test_high_confidence_not_low(self, classifier):
        """Clear emotional text should not be low confidence."""
        assert not classifier.is_low_confidence("I love you so much!")
        assert not classifier.is_low_confidence("I'm absolutely furious!")


class TestTriggerClassifierSingleton:
    """Tests for singleton behavior."""
    
    def test_get_trigger_classifier_returns_same_instance(self):
        """Singleton should return same instance."""
        c1 = get_trigger_classifier()
        c2 = get_trigger_classifier()
        assert c1 is c2
```

### Update: `backend/tests/test_emotion_engine.py`

Update trigger detection tests to use GoEmotions labels:

```python
class TestEmotionEngineTriggerDetection:
    """Tests for trigger detection with GoEmotions classifier."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_detect_triggers_returns_valid_triggers(self, engine):
        """All returned triggers should be in DEFAULT_TRIGGER_DELTAS."""
        triggers = engine.detect_triggers("You're amazing, thank you!")
        for trigger, intensity in triggers:
            assert trigger in engine.DEFAULT_TRIGGER_DELTAS
            assert 0.0 <= intensity <= 1.0
    
    def test_positive_emotion_increases_valence(self, engine):
        """Positive emotions should increase valence."""
        state = EmotionalState()
        triggers = engine.detect_triggers("I love you!")
        
        for trigger, intensity in triggers:
            state = engine.apply_trigger(state, trigger, intensity)
        
        assert state.valence > 0
    
    def test_negative_emotion_decreases_valence(self, engine):
        """Negative emotions should decrease valence."""
        state = EmotionalState()
        triggers = engine.detect_triggers("I'm so angry at you!")
        
        for trigger, intensity in triggers:
            state = engine.apply_trigger(state, trigger, intensity)
        
        assert state.valence < 0
```

## Implementation Checklist

- [ ] Create `backend/services/trigger_classifier.py`
- [ ] Add `transformers` and `torch` to `requirements.txt`
- [ ] Update `emotion_engine.py`:
  - [ ] Replace `DEFAULT_TRIGGER_DELTAS` with GoEmotions mapping
  - [ ] Replace `TRIGGER_TAXONOMY` with new categories
  - [ ] Update `ALL_TRIGGERS` list
  - [ ] Remove `TRIGGER_PATTERNS` dict
  - [ ] Remove `_compiled_patterns` and `_compile_patterns()`
  - [ ] Simplify or remove `TRIGGER_ALIASES`
  - [ ] Update `normalize_trigger()` for new labels
  - [ ] Update `detect_triggers()` to use classifier
  - [ ] Update `detect_triggers_llm()` prompt for GoEmotions labels
  - [ ] Update `DIMENSION_UPDATES` dict for new labels
- [ ] Update `config.py` with classifier settings
- [ ] Create `backend/tests/test_trigger_classifier.py`
- [ ] Update `backend/tests/test_emotion_engine.py`
- [ ] Update any agent profiles using old trigger names
- [ ] Test with `emotion-lab.py` script
- [ ] Verify model loads in <5s

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRIGGER_CLASSIFIER_ENABLED` | `1` | Enable GoEmotions classifier |
| `TRIGGER_CLASSIFIER_CONFIDENCE` | `0.25` | Minimum confidence threshold |
| `LLM_TRIGGER_DETECTION` | `0` | Enable LLM fallback (disabled by default) |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Model load time (~5s) | Lazy loading on first classify() call |
| Memory usage (~500MB) | Acceptable for backend service |
| Breaking agent profiles | Provide LEGACY_TRIGGER_ALIASES for migration |
| Lower accuracy on rare emotions (grief, relief) | Acceptable — low frequency in real usage |

## Future Improvements

1. **ONNX runtime**: Use `SamLowe/roberta-base-go_emotions-onnx` for 2-3x speedup
2. **Threshold tuning**: Per-label thresholds based on precision/recall needs
3. **Caching**: LRU cache for repeated messages
4. **Batch inference**: Classify multiple messages in one call

---

## Codex Implementation Prompt

```
# Task: Implement GoEmotions Trigger Classifier for emilia-webapp

## Context
You are working on the emilia-webapp project, a waifu companion app with an emotion engine.
The current trigger detection uses regex patterns which are unreliable.
Replace regex with a GoEmotions RoBERTa classifier and adopt GoEmotions' 28-label 
taxonomy as the canonical trigger system.

## Project Location
/home/tbach/Projects/emilia-project/emilia-webapp/

## Key Files to Modify/Create
- backend/services/trigger_classifier.py (NEW - create this)
- backend/services/emotion_engine.py (major updates)
- backend/config.py (add new settings)
- backend/requirements.txt (add dependencies)
- backend/tests/test_trigger_classifier.py (NEW - create tests)
- backend/tests/test_emotion_engine.py (update existing tests)

## Implementation Plan
Read the full plan including the complete delta mapping table at:
docs/planning/P004-distilbert-trigger-classifier.md

## Step-by-Step Instructions

1. First, read the full implementation plan:
   cat docs/planning/P004-distilbert-trigger-classifier.md

2. Add dependencies to requirements.txt:
   - transformers>=4.36.0
   - torch>=2.0.0

3. Create backend/services/trigger_classifier.py:
   - Use model: SamLowe/roberta-base-go_emotions
   - Implement lazy model loading
   - Filter out "neutral" label
   - Return list of (label, confidence) tuples
   - Add singleton pattern with get_trigger_classifier()

4. Update backend/services/emotion_engine.py:
   
   a) Replace DEFAULT_TRIGGER_DELTAS with the new GoEmotions mapping from the plan.
      The plan contains the complete mapping for all 28 emotions.
   
   b) Replace TRIGGER_TAXONOMY with:
      TRIGGER_TAXONOMY = {
          "positive": ["admiration", "amusement", "approval", "caring", 
                       "excitement", "gratitude", "joy", "love", "optimism", 
                       "pride", "relief"],
          "negative": ["anger", "annoyance", "disappointment", "disapproval",
                       "disgust", "fear", "grief", "sadness"],
          "self_conscious": ["embarrassment", "nervousness", "remorse"],
          "neutral": ["confusion", "curiosity", "realization", "surprise"],
          "intimate": ["desire", "love", "caring"],
      }
   
   c) Update ALL_TRIGGERS to use new taxonomy
   
   d) Remove TRIGGER_PATTERNS dict entirely (all the regex patterns)
   
   e) Remove _compiled_patterns class variable
   
   f) Remove _compile_patterns() method
   
   g) Add LEGACY_TRIGGER_ALIASES for backward compatibility (see plan)
   
   h) Update normalize_trigger() to handle legacy → GoEmotions mapping
   
   i) Update detect_triggers() to use TriggerClassifier
   
   j) Update detect_triggers_llm() prompt to use GoEmotions labels
   
   k) Update DIMENSION_UPDATES dict to use GoEmotions labels:
      - Map old triggers to new: praise→admiration, criticism→disapproval, etc.

5. Update backend/config.py:
   - Add trigger_classifier_enabled setting
   - Add trigger_classifier_confidence setting
   - Keep llm_trigger_detection setting (rename internally if needed)

6. Create backend/tests/test_trigger_classifier.py:
   - Test each emotion category (positive, negative, self-conscious, neutral)
   - Test filtering of neutral label
   - Test multi-label detection
   - Test confidence thresholds
   - Test edge cases (empty string, ambiguous text)
   - Test singleton behavior

7. Update backend/tests/test_emotion_engine.py:
   - Update trigger detection tests to use GoEmotions labels
   - Update any tests that reference old trigger names
   - Add integration tests for classifier + emotion engine

8. Run tests to verify:
   cd backend && python -m pytest tests/test_trigger_classifier.py tests/test_emotion_engine.py -v

## Key Constraints
- Use model: SamLowe/roberta-base-go_emotions (NOT the 6-emotion distilbert)
- Keep backward compatibility via LEGACY_TRIGGER_ALIASES
- LLM fallback must be DISABLED by default
- Use lazy loading for the model
- All 28 GoEmotions labels must have entries in DEFAULT_TRIGGER_DELTAS
- All tests must pass

## GoEmotions Labels (for reference)
admiration, amusement, anger, annoyance, approval, caring, confusion, 
curiosity, desire, disappointment, disapproval, disgust, embarrassment, 
excitement, fear, gratitude, grief, joy, love, nervousness, optimism, 
pride, realization, relief, remorse, sadness, surprise, neutral

## Success Criteria
- All regex patterns removed from emotion_engine.py
- GoEmotions classifier working with lazy loading
- All 28 labels mapped in DEFAULT_TRIGGER_DELTAS
- Legacy trigger names work via LEGACY_TRIGGER_ALIASES
- LLM fallback optional and disabled by default
- All tests pass
- Manual testing with emotion-lab.py works
```

---

*Document created by Beatrice 💗*
