# Emotion Engine Bugs

**Documented:** 2026-02-08
**Investigator:** Beatrice 💗
**Status:** Identified, pending fix

---

## Bug 1: Mood Weights Never Initialized

### Symptom
`mood_weights_json` in `emotional_state` table remains `NULL` even after many interactions.

### Root Cause
Mood weights are only initialized inside `apply_mood_deltas()`:

```python
# backend/services/emotion_engine.py line ~280
def apply_mood_deltas(self, state: EmotionalState, mood_deltas: dict) -> None:
    if not state.mood_weights:
        state.mood_weights = {mood: self.profile.mood_baseline.get(mood, 0) for mood in MOODS}
```

But `apply_mood_deltas()` is only called when triggers are detected:

```python
# backend/routers/chat.py ~_process_emotion_pre_llm()
if triggers:
    relationship_type = state_row.get('relationship_type') or 'friend'
    trigger_mood_map = get_trigger_mood_map(relationship_type)
    if trigger_mood_map:
        mood_deltas = engine.calculate_mood_deltas(triggers, trigger_mood_map)
        engine.apply_mood_deltas(state, mood_deltas)
```

**Result:** If a user's first N messages have no detectable triggers, mood_weights is never initialized.

### Fix
Initialize mood_weights in `_process_emotion_pre_llm()` after loading state:

```python
# After loading state from DB, before any processing:
if not state.mood_weights:
    state.mood_weights = {mood: profile.mood_baseline.get(mood, 0) for mood in MOODS}
```

---

## Bug 2: Empty Dict Treated as Falsy

### Symptom
Even when mood_weights is set to `{}`, it doesn't persist.

### Root Cause
```python
# backend/routers/chat.py
EmotionalStateRepository.update(
    user_id, agent_id,
    mood_weights=state.mood_weights or None,  # BUG HERE
    ...
)
```

In Python, `{} or None` evaluates to `None` because empty dict is falsy.

### Fix
Change to:
```python
mood_weights=state.mood_weights if state.mood_weights is not None else None
# Or simply always pass it:
mood_weights=state.mood_weights
```

---

## Bug 3: Mood Decay Not Applied When No Triggers

### Symptom
Mood weights don't decay toward baseline when user sends messages with no triggers.

### Root Cause
`apply_mood_decay()` is called, but if `mood_weights` is empty/None, it returns early:

```python
def apply_mood_decay(self, state: EmotionalState, elapsed_seconds: float) -> None:
    if not state.mood_weights:
        return  # Never decays if not initialized
```

### Fix
Same as Bug 1 — initialize mood_weights before decay is called.

---

## Impact

| Component | Impact |
|-----------|--------|
| LLM context injection | Falls back to "neutral" instead of mood-based description |
| Designer mood_baseline config | Never applied — all configuration is wasted |
| Relationship trigger_mood_map | Never used if first messages have no triggers |
| Behavior levers | Only derived from direct VAD, not mood system |

---

## Affected Files

- `backend/services/emotion_engine.py`
- `backend/routers/chat.py`
- `backend/db/repositories/emotional_state.py`

---

## Test Case

1. Create new user-agent pair
2. Send message with no detectable triggers (e.g., "hello")
3. Check `emotional_state.mood_weights_json` — will be NULL
4. Send message with trigger (e.g., "you're amazing")
5. Check again — should now have mood_weights

**Expected:** mood_weights should be initialized on first interaction regardless of triggers.
