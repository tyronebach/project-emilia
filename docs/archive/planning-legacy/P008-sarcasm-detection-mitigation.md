# P008: Sarcasm Detection & Classifier Mitigation

**Status:** Backlog  
**Created:** 2026-02-11  
**Author:** Beatrice (via Thai)

## Problem

GoEmotions classifier interprets sarcastic phrases literally:
- "great job" → admiration (should be: disappointment/disapproval)
- "thanks a lot" → gratitude (should be: annoyance)
- "real helpful" → approval (should be: sarcasm/annoyance)
- "nice work" → admiration (should be: disapproval)

This causes aggressive/hostile user archetypes to register false positives on admiration/gratitude, skewing persona simulations toward positive when they should be negative.

## Current Workaround

**Outcome weights** on archetypes compensate at the simulation level:
```json
{"positive": 0.15, "neutral": 0.25, "negative": 0.60}
```

This forces negative outcomes regardless of trigger classification. Works for simulation, but doesn't fix the underlying classifier issue for live chat.

## Proposed Mitigations

### 1. Sarcasm Phrase Lookup (Quick Win)

Maintain a list of common sarcastic patterns and override their classification:

```python
SARCASM_OVERRIDES = {
    "thanks a lot": "annoyance",
    "great job": "disappointment", 
    "real helpful": "annoyance",
    "nice work": "disappointment",
    "appreciate it": "annoyance",  # context-dependent
    "oh wonderful": "annoyance",
    "oh perfect": "annoyance",
    "just great": "annoyance",
    "thanks for nothing": "disapproval",
    "very helpful": "annoyance",  # when standalone
}

def classify_with_sarcasm_check(text: str) -> list[tuple[str, float]]:
    normalized = text.strip().lower()
    
    # Check for exact sarcasm matches
    if normalized in SARCASM_OVERRIDES:
        return [(SARCASM_OVERRIDES[normalized], 0.8)]
    
    # Partial match for phrases containing sarcasm markers
    for phrase, override in SARCASM_OVERRIDES.items():
        if phrase in normalized:
            # Boost the override trigger, dampen positive triggers
            ...
    
    return normal_classify(text)
```

**Pros:** Simple, deterministic, fast  
**Cons:** Doesn't scale, misses novel sarcasm

### 2. Co-occurrence Dampening (Medium Effort)

If a single message or recent context contains conflicting signals, dampen the positive ones:

```python
def apply_trigger_with_cooccurrence(
    triggers: list[tuple[str, float]],
    recent_context: list[str]  # last N triggers
) -> list[tuple[str, float]]:
    
    POSITIVE = {"admiration", "approval", "gratitude", "joy", "love"}
    NEGATIVE = {"annoyance", "anger", "disapproval", "disgust", "disappointment"}
    
    has_negative = any(t in NEGATIVE for t, _ in triggers)
    has_recent_negative = any(t in NEGATIVE for t in recent_context[-5:])
    
    adjusted = []
    for trigger, intensity in triggers:
        if trigger in POSITIVE and (has_negative or has_recent_negative):
            # Sarcasm suspected — dampen positive
            adjusted.append((trigger, intensity * 0.3))
        else:
            adjusted.append((trigger, intensity))
    
    return adjusted
```

**Pros:** Context-aware, handles novel sarcasm patterns  
**Cons:** May over-dampen genuine positive moments in mixed conversations

### 3. Session Momentum (Medium Effort)

Track emotional momentum over the session. Sudden positive spikes after sustained negativity are suspicious:

```python
class SessionMomentum:
    def __init__(self, window_size: int = 10):
        self.history: deque[float] = deque(maxlen=window_size)
    
    def add(self, valence_delta: float):
        self.history.append(valence_delta)
    
    def get_momentum(self) -> float:
        if not self.history:
            return 0.0
        return sum(self.history) / len(self.history)
    
    def is_suspicious_positive(self, trigger: str, intensity: float) -> bool:
        """Detect potential sarcasm via momentum analysis."""
        if trigger not in POSITIVE_TRIGGERS:
            return False
        
        momentum = self.get_momentum()
        # If recent momentum is negative and we get a strong positive, suspect sarcasm
        if momentum < -0.1 and intensity > 0.5:
            return True
        return False
```

**Pros:** Adapts to conversation flow, catches sarcasm in context  
**Cons:** Requires session state, may miss standalone sarcasm

### 4. Dedicated Sarcasm Classifier (High Effort)

Run a secondary model trained specifically for sarcasm detection:

```python
from transformers import pipeline

sarcasm_detector = pipeline("text-classification", model="cardiffnlp/twitter-roberta-base-irony")

def classify_with_sarcasm_model(text: str) -> list[tuple[str, float]]:
    # First check for sarcasm
    sarcasm_result = sarcasm_detector(text)[0]
    is_sarcastic = sarcasm_result["label"] == "irony" and sarcasm_result["score"] > 0.7
    
    # Get emotion classification
    emotions = emotion_classifier(text)
    
    if is_sarcastic:
        # Flip or dampen positive emotions
        return flip_sarcastic_emotions(emotions)
    
    return emotions
```

**Pros:** Most accurate, handles novel patterns  
**Cons:** Added latency, model maintenance, potential false positives

### 5. Training Data Augmentation (Long-term)

Fine-tune the emotion classifier with sarcasm-labeled examples:

1. Collect sarcastic phrases with their intended emotions
2. Create training pairs: `("great job", "disappointment")` instead of `("great job", "admiration")`
3. Fine-tune GoEmotions model with sarcasm-aware labels

**Pros:** Fixes root cause  
**Cons:** Requires labeled data, model retraining, may degrade other classifications

## Recommended Approach

**Phase 1 (Now):** Use outcome_weights for archetype-level compensation ✓ DONE

**Phase 2 (Next sprint):** Implement sarcasm phrase lookup + co-occurrence dampening
- Low effort, high impact for common cases
- Can be toggled per-archetype or globally

**Phase 3 (Future):** Evaluate dedicated sarcasm classifier
- Only if Phase 2 insufficient
- Benchmark latency impact

## Files to Modify

- `backend/services/emotion_engine.py` — add sarcasm detection hooks
- `backend/services/emotion_classifier.py` — phrase lookup layer
- `backend/db/repositories/archetype_repository.py` — sarcasm sensitivity flag per archetype

## Test Cases

```python
def test_sarcasm_detection():
    assert classify("thanks a lot")[0][0] in ["annoyance", "disapproval"]
    assert classify("great job genius")[0][0] in ["disapproval", "annoyance"]
    assert classify("oh perfect, just perfect")[0][0] == "annoyance"
    
def test_genuine_positive():
    # Should NOT be flagged as sarcasm
    assert classify("thank you so much!")[0][0] == "gratitude"
    assert classify("great job, I'm proud of you")[0][0] == "admiration"
```

## References

- GoEmotions paper: https://arxiv.org/abs/2005.00547
- Sarcasm detection survey: https://arxiv.org/abs/1908.04706
- cardiffnlp/twitter-roberta-base-irony model
