# Emotion Engine V2 — Implementation Plan

**For:** Claude/Codex coding agents  
**Prereq:** Read `EMOTION-ENGINE-V2.md` for architecture context  
**Codebase:** `/home/tbach/Projects/emilia-project/emilia-webapp/`

---

## Overview

6 phases, ~20 discrete tasks. Each task is designed to be completable in a single coding session.

**Key files:**
- `backend/services/emotion_engine.py` — Core engine
- `backend/routers/chat.py` — Integration point  
- `backend/db/repositories/emotional_state.py` — Persistence
- `backend/db/schema.sql` or migrations — Schema updates

---

## Phase 1: Schema & Data Model (2-3 tasks)

### Task 1.1: Extend emotional_state table

**File:** `backend/db/migrations/` or direct SQL

**Changes:**
```sql
ALTER TABLE emotional_state ADD COLUMN intimacy REAL DEFAULT 0.2;
ALTER TABLE emotional_state ADD COLUMN playfulness_safety REAL DEFAULT 0.5;
ALTER TABLE emotional_state ADD COLUMN conflict_tolerance REAL DEFAULT 0.7;
ALTER TABLE emotional_state ADD COLUMN trigger_calibration_json TEXT DEFAULT '{}';
```

**Test:** 
```bash
sqlite3 data/emilia.db ".schema emotional_state" | grep intimacy
# Should show new columns
```

---

### Task 1.2: Create emotional_events_v2 table

**File:** `backend/db/migrations/` or direct SQL

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS emotional_events_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    timestamp REAL NOT NULL,
    
    -- What happened
    message_snippet TEXT,
    triggers_json TEXT,
    
    -- State changes
    valence_before REAL,
    valence_after REAL,
    arousal_before REAL,
    arousal_after REAL,
    dominant_mood_before TEXT,
    dominant_mood_after TEXT,
    
    -- Outcome (for learning)
    agent_mood_tag TEXT,
    agent_intent_tag TEXT,
    inferred_outcome TEXT CHECK(inferred_outcome IN ('positive', 'negative', 'neutral')),
    
    -- Relationship changes
    trust_delta REAL,
    intimacy_delta REAL,
    calibration_updates_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_v2_user_agent 
    ON emotional_events_v2(user_id, agent_id, timestamp DESC);
```

**Test:**
```bash
sqlite3 data/emilia.db ".tables" | grep emotional_events_v2
```

---

### Task 1.3: Update EmotionalState dataclass

**File:** `backend/services/emotion_engine.py`

**Add to EmotionalState class:**
```python
@dataclass
class EmotionalState:
    # Existing
    valence: float = 0.0
    arousal: float = 0.0
    dominance: float = 0.0
    trust: float = 0.5
    attachment: float = 0.3
    familiarity: float = 0.0
    mood_weights: dict = field(default_factory=dict)
    
    # NEW: Relationship dimensions
    intimacy: float = 0.2
    playfulness_safety: float = 0.5
    conflict_tolerance: float = 0.7
    
    # NEW: Trigger calibration
    trigger_calibration: dict = field(default_factory=dict)
    # Format: {"teasing": {"count": 10, "positive": 8, "negative": 2, "multiplier": 1.3}, ...}
```

**Update `to_dict()` and `from_dict()` methods accordingly.**

**Test:**
```python
state = EmotionalState()
assert hasattr(state, 'intimacy')
assert hasattr(state, 'trigger_calibration')
```

---

## Phase 2: Trigger Calibration Logic (5 tasks)

### Task 2.0: Define consolidated trigger taxonomy

**File:** `backend/services/emotion_engine.py`

**Why:** 15 triggers beats 80. Denser calibration data = faster learning.

**Add:**
```python
# Consolidated trigger taxonomy (15 triggers in 5 categories)
TRIGGER_TAXONOMY = {
    "play": ["teasing", "banter", "flirting"],
    "care": ["comfort", "praise", "affirmation"],
    "friction": ["criticism", "rejection", "boundary", "dismissal"],
    "repair": ["apology", "accountability", "reconnection"],
    "vulnerability": ["disclosure", "trust_signal"],
}

ALL_TRIGGERS = [t for triggers in TRIGGER_TAXONOMY.values() for t in triggers]

# Map legacy triggers to consolidated
TRIGGER_ALIASES = {
    "compliment": "praise",
    "gratitude": "praise",
    "insult": "criticism", 
    "conflict": "boundary",
    "betrayal": "rejection",
    "abandonment": "rejection",
    "argument": "boundary",
    "accusation": "criticism",
    "explanation": "accountability",
    "repair": "reconnection",
    "vulnerability": "disclosure",
    "confession": "disclosure",
    "secret": "disclosure",
    "shared_joy": "affirmation",
    "greeting": None,  # No calibration impact
    "farewell": None,
    "question": None,
}


def normalize_trigger(trigger: str) -> str | None:
    """Convert legacy trigger to consolidated taxonomy."""
    if trigger in ALL_TRIGGERS:
        return trigger
    return TRIGGER_ALIASES.get(trigger, trigger)
```

**Update `detect_triggers()` to use taxonomy:**
```python
def detect_triggers(self, text: str) -> list[tuple[str, float]]:
    raw_triggers = self._detect_triggers_raw(text)  # Existing logic
    
    # Normalize to consolidated taxonomy
    normalized = []
    for trigger, intensity in raw_triggers:
        canonical = normalize_trigger(trigger)
        if canonical:  # Skip None (greeting, etc.)
            normalized.append((canonical, intensity))
    
    return normalized
```

**Test:**
```python
assert normalize_trigger("compliment") == "praise"
assert normalize_trigger("teasing") == "teasing"  # Already canonical
assert normalize_trigger("greeting") is None  # No calibration
```

---

### Task 2.1: Add TriggerCalibration with Bayesian smoothing

**File:** `backend/services/emotion_engine.py`

**Add:**
```python
@dataclass
class TriggerCalibration:
    """Per-trigger learned response profile with Bayesian smoothing."""
    
    trigger_type: str
    
    # Counts (weighted by confidence)
    positive_weight: float = 0.0
    negative_weight: float = 0.0
    neutral_weight: float = 0.0
    occurrence_count: int = 0
    
    # Priors (pseudo-counts for smoothing - prevents early overfit)
    PRIOR_POSITIVE: ClassVar[float] = 10.0
    PRIOR_NEGATIVE: ClassVar[float] = 10.0
    PRIOR_TOTAL: ClassVar[float] = 20.0
    
    # Minimum samples before calibration kicks in
    MIN_SAMPLES: ClassVar[int] = 30
    
    # Computed
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
    def from_dict(cls, d: dict) -> 'TriggerCalibration':
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        cal.positive_weight = d.get("positive_weight", 0.0)
        cal.negative_weight = d.get("negative_weight", 0.0)
        cal.neutral_weight = d.get("neutral_weight", 0.0)
        cal.occurrence_count = d.get("occurrence_count", 0)
        cal.learned_multiplier = d.get("learned_multiplier", 1.0)
        cal.last_occurrence = d.get("last_occurrence", 0.0)
        return cal
    
    def update(self, outcome: str, confidence: float) -> None:
        """Update calibration with new observation, weighted by confidence."""
        import time
        self.occurrence_count += 1
        self.last_occurrence = time.time()
        
        if outcome == "positive":
            self.positive_weight += confidence
        elif outcome == "negative":
            self.negative_weight += confidence
        else:
            self.neutral_weight += confidence * 0.5  # Neutral counts less
        
        self.recompute_multiplier()
    
    def recompute_multiplier(self) -> None:
        """Compute multiplier using Bayesian estimate with priors."""
        # Add priors (Laplace smoothing)
        pos = self.positive_weight + self.PRIOR_POSITIVE
        neg = self.negative_weight + self.PRIOR_NEGATIVE
        total = pos + neg
        
        # Rate: 0 (all negative) to 1 (all positive)
        rate = pos / total
        
        # Map to multiplier: 0.75 + 0.5 * rate
        # rate=0 → 0.75, rate=0.5 → 1.0, rate=1 → 1.25
        raw_multiplier = 0.75 + 0.5 * rate
        
        # Confidence scaling: blend toward 1.0 until enough samples
        if self.occurrence_count < self.MIN_SAMPLES:
            blend = self.occurrence_count / self.MIN_SAMPLES
            self.learned_multiplier = 1.0 + (raw_multiplier - 1.0) * blend
        else:
            self.learned_multiplier = raw_multiplier
        
        # Hard clamp
        self.learned_multiplier = max(0.5, min(1.5, self.learned_multiplier))
```

**Test:**
```python
cal = TriggerCalibration(trigger_type="teasing")
# First 10 positive outcomes - multiplier should stay near 1.0 (not enough data)
for _ in range(10):
    cal.update("positive", 0.8)
assert 0.95 < cal.learned_multiplier < 1.15  # Still near neutral

# After 30+ samples, should move toward positive
for _ in range(25):
    cal.update("positive", 0.8)
assert cal.learned_multiplier > 1.15  # Now calibration kicks in
```

---

### Task 2.2: Add ContextBucket and context-aware calibration

**File:** `backend/services/emotion_engine.py`

**Add:**
```python
@dataclass
class ContextBucket:
    """Context state for bucketed calibration."""
    trust_level: str      # "low" | "mid" | "high"
    arousal_level: str    # "calm" | "activated"
    recent_conflict: bool
    
    @classmethod
    def from_state(cls, state: 'EmotionalState') -> 'ContextBucket':
        return cls(
            trust_level="low" if state.trust < 0.4 else "high" if state.trust > 0.7 else "mid",
            arousal_level="calm" if state.arousal < 0.3 else "activated",
            recent_conflict=getattr(state, 'conflict_tolerance', 0.7) < 0.5,
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
        """Get multiplier for current context, with fallback to global."""
        key = context.key()
        
        # Use context-specific if enough data (10+ samples in bucket)
        if key in self.buckets and self.buckets[key].occurrence_count >= 10:
            return self.buckets[key].learned_multiplier
        
        return self.global_cal.learned_multiplier
    
    def update(self, context: ContextBucket, outcome: str, confidence: float) -> None:
        """Update both global and context-specific calibration."""
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
    def from_dict(cls, d: dict) -> 'ContextualTriggerCalibration':
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        if "global" in d:
            cal.global_cal = TriggerCalibration.from_dict(d["global"])
        if "buckets" in d:
            cal.buckets = {k: TriggerCalibration.from_dict(v) for k, v in d["buckets"].items()}
        return cal
```

**Test:**
```python
cal = ContextualTriggerCalibration("teasing")
high_trust_ctx = ContextBucket("high", "calm", False)
low_trust_ctx = ContextBucket("low", "calm", False)

# Train on high trust (positive)
for _ in range(15):
    cal.update(high_trust_ctx, "positive", 0.8)

# Train on low trust (negative)
for _ in range(15):
    cal.update(low_trust_ctx, "negative", 0.8)

# Should give different multipliers per context
assert cal.get_multiplier(high_trust_ctx) > 1.1
assert cal.get_multiplier(low_trust_ctx) < 0.9
```

---

### Task 2.3: Add three-layer delta computation

**File:** `backend/services/emotion_engine.py`

**Add method to EmotionEngine:**
```python
def compute_effective_delta(
    self,
    trigger: str,
    raw_intensity: float,
    state: EmotionalState,
    calibration: ContextualTriggerCalibration | None,
) -> float:
    """
    Compute final intensity with all three layers.
    
    delta = raw × DNA_sensitivity × bond_mod × user_multiplier
    """
    # Layer 1: DNA sensitivity (personality)
    dna_sensitivity = self.profile.trigger_sensitivities.get(trigger, 1.0)
    
    # Layer 2: Bond modifier (relationship state)
    base_deltas = self.DEFAULT_TRIGGER_DELTAS.get(trigger, {})
    is_positive_trigger = base_deltas.get("valence", 0) > 0
    
    if is_positive_trigger:
        bond_mod = 0.7 + (state.trust * 0.6)  # 0.7 to 1.3
    else:
        bond_mod = 1.3 - (state.trust * 0.6)  # 1.3 to 0.7
    
    # Intimacy amplifies vulnerability triggers
    if trigger in ("vulnerability", "comfort", "shared_joy"):
        intimacy = getattr(state, 'intimacy', 0.2)
        bond_mod *= 0.8 + (intimacy * 0.4)
    
    # Layer 3: User calibration (context-aware)
    if calibration:
        context = ContextBucket.from_state(state)
        user_multiplier = calibration.get_multiplier(context)
    else:
        user_multiplier = 1.0
    
    # Combine
    effective = raw_intensity * dna_sensitivity * bond_mod * user_multiplier
    
    return max(0.1, min(3.0, effective))


def apply_trigger_calibrated(
    self,
    state: EmotionalState,
    trigger: str,
    raw_intensity: float,
    calibration: ContextualTriggerCalibration | None = None,
) -> dict[str, float]:
    """Apply trigger with full three-layer scaling."""
    effective_intensity = self.compute_effective_delta(
        trigger, raw_intensity, state, calibration
    )
    return self.apply_trigger(state, trigger, effective_intensity)
```

**Test:**
```python
# Rem (high flirt sensitivity 1.5) vs Ram (low 0.3)
# Same high trust (bond_mod ~1.3) and same calibration (1.2)
# Rem: 0.7 × 1.5 × 1.3 × 1.2 = 1.64
# Ram: 0.7 × 0.3 × 1.3 × 1.2 = 0.33
# Rem ~5x stronger response - personality preserved!
```

---

### Task 2.3: Update repository for new fields

**File:** `backend/db/repositories/emotional_state.py`

**Update `get_or_create()`:**
- Load `intimacy`, `playfulness_safety`, `conflict_tolerance`
- Load and parse `trigger_calibration_json`

**Update `update()`:**
- Accept new fields
- Serialize `trigger_calibration` to JSON

**Add method:**
```python
@staticmethod
def update_calibration(
    user_id: str, 
    agent_id: str, 
    trigger: str, 
    outcome: str,  # "positive" | "negative" | "neutral"
    intensity: float
) -> TriggerCalibration:
    """Update trigger calibration after an interaction."""
    # Load current calibration
    # Update counts
    # Recompute multiplier
    # Save back
    pass
```

**Test:** Round-trip save/load of trigger_calibration.

---

### Task 2.4: Integrate calibration into chat flow

**File:** `backend/routers/chat.py`

**In `_process_emotion_pre_llm()`:**

Replace:
```python
deltas = engine.apply_trigger(state, trigger, intensity)
```

With:
```python
deltas = engine.apply_trigger_calibrated(state, trigger, intensity)
```

**Test:** Send message, verify calibration is loaded and applied.

---

## Phase 3: Outcome Inference & Learning Loop (4 tasks)

### Task 3.1: Implement multi-signal outcome inference

**File:** `backend/services/emotion_engine.py`

**Key principle:** Don't rely solely on LLM self-report tags (they can hallucinate). Use multiple signals with confidence weighting.

**Add:**
```python
@dataclass
class OutcomeSignal:
    """A single signal contributing to outcome inference."""
    source: str        # "user_explicit", "user_behavior", "agent_tag"
    direction: str     # "positive", "negative", "neutral"
    weight: float      # Signal strength (0.0 to 1.0)
    confidence: float  # How sure are we (0.0 to 1.0)


# Strong signals (high weight)
POSITIVE_EXPLICIT = {"lol", "😂", "haha", "hehe", "love that", "perfect", "yes!", 
                     "❤️", "🥰", "😍", "amazing", "thank you", "thanks"}
NEGATIVE_EXPLICIT = {"stop", "don't", "that hurt", "not funny", "rude", "wtf",
                     "😢", "😠", "ugh", "annoying", "shut up", "go away"}


def infer_outcome_multisignal(
    next_user_message: str | None,
    agent_behavior: dict,
    response_latency_ms: int | None = None,
) -> tuple[str, float]:
    """
    Infer outcome from multiple signals.
    
    Returns: (outcome, confidence)
    - Only update calibration if confidence >= 0.5
    """
    signals = []
    
    # === STRONG SIGNALS ===
    
    # User's NEXT message contains explicit reaction
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
    
    # Quick re-engagement = positive
    if response_latency_ms is not None:
        if response_latency_ms < 5000:
            signals.append(OutcomeSignal("user_behavior", "positive", 0.3, 0.6))
        elif response_latency_ms > 120000:  # 2 min silence
            signals.append(OutcomeSignal("user_behavior", "negative", 0.3, 0.5))
    
    # === WEAK SIGNALS ===
    
    # Agent self-report (can hallucinate - low weight)
    mood = agent_behavior.get("mood", "").lower()
    positive_moods = {"happy", "playful", "loving", "excited", "grateful", "bashful", "flirty"}
    negative_moods = {"sad", "hurt", "angry", "frustrated", "disappointed", "defensive"}
    
    if mood in positive_moods:
        signals.append(OutcomeSignal("agent_tag", "positive", 0.4, 0.5))
    elif mood in negative_moods:
        signals.append(OutcomeSignal("agent_tag", "negative", 0.4, 0.5))
    
    # === AGGREGATE ===
    
    if not signals:
        return ("neutral", 0.3)
    
    pos_score = sum(s.weight * s.confidence for s in signals if s.direction == "positive")
    neg_score = sum(s.weight * s.confidence for s in signals if s.direction == "negative")
    
    if pos_score > neg_score * 1.2:  # Need clear winner
        confidence = min(0.95, pos_score / (pos_score + neg_score + 0.1))
        return ("positive", confidence)
    elif neg_score > pos_score * 1.2:
        confidence = min(0.95, neg_score / (pos_score + neg_score + 0.1))
        return ("negative", confidence)
    
    return ("neutral", 0.4)
```

**Test:**
```python
# Explicit positive
outcome, conf = infer_outcome_multisignal("haha that's great 😂", {})
assert outcome == "positive" and conf > 0.7

# Explicit negative  
outcome, conf = infer_outcome_multisignal("stop that's not funny", {})
assert outcome == "negative" and conf > 0.7

# Only agent tag (low confidence)
outcome, conf = infer_outcome_multisignal(None, {"mood": "happy"})
assert outcome == "positive" and conf < 0.6
```

---

### Task 3.2: Implement confidence-gated learning

**File:** `backend/services/emotion_engine.py`

**Key principle:** Only update calibration when confidence is high enough. Log but don't learn from uncertain outcomes.

**Add method to EmotionEngine:**
```python
CONFIDENCE_THRESHOLD = 0.5  # Minimum confidence to update calibration


def learn_from_outcome(
    self,
    state: EmotionalState,
    triggers: list[tuple[str, float]],
    outcome: str,
    confidence: float,
) -> dict[str, ContextualTriggerCalibration]:
    """
    Update trigger calibrations based on interaction outcome.
    
    Only updates if confidence >= CONFIDENCE_THRESHOLD.
    Returns updated calibrations for persistence.
    """
    updated = {}
    
    # Skip learning if not confident enough
    if confidence < CONFIDENCE_THRESHOLD:
        logger.debug("[Learn] Skipping update, confidence %.2f < %.2f", 
                     confidence, CONFIDENCE_THRESHOLD)
        return updated
    
    context = ContextBucket.from_state(state)
    
    for trigger_type, intensity in triggers:
        # Get or create calibration
        if trigger_type not in state.trigger_calibration:
            state.trigger_calibration[trigger_type] = ContextualTriggerCalibration(trigger_type)
        
        cal = state.trigger_calibration[trigger_type]
        if isinstance(cal, dict):
            cal = ContextualTriggerCalibration.from_dict(cal)
            state.trigger_calibration[trigger_type] = cal
        
        # Update with confidence-weighted outcome
        cal.update(context, outcome, confidence)
        updated[trigger_type] = cal
        
        logger.info("[Learn] %s: %s (conf=%.2f) → multiplier=%.2f", 
                    trigger_type, outcome, confidence, cal.global_cal.learned_multiplier)
    
    return updated
```

**Test:**
```python
state = EmotionalState(trust=0.6)
engine = EmotionEngine(profile)
triggers = [("teasing", 0.7)]

# Low confidence - should NOT update
engine.learn_from_outcome(state, triggers, "positive", 0.3)
assert "teasing" not in state.trigger_calibration  # Not created

# High confidence - should update
engine.learn_from_outcome(state, triggers, "positive", 0.8)
assert "teasing" in state.trigger_calibration
```

---

### Task 3.3: Add reversibility hooks

**File:** `backend/services/emotion_engine.py`

**Add:**
```python
class CalibrationRecovery:
    """Mechanisms to prevent irreversible calibration drift."""
    
    REPAIR_WINDOW_HOURS: float = 24.0
    REPAIR_BOOST: float = 1.5
    DECAY_RATE_PER_WEEK: float = 0.05
    
    @staticmethod
    def apply_repair_boost(confidence: float, state: EmotionalState, outcome: str) -> float:
        """Boost positive outcomes during repair window (after conflict)."""
        if outcome != "positive":
            return confidence
        
        # If conflict_tolerance is low, we're in repair mode
        if getattr(state, 'conflict_tolerance', 0.7) < 0.5:
            return confidence * CalibrationRecovery.REPAIR_BOOST
        
        return confidence
    
    @staticmethod
    def apply_decay_to_neutral(calibration: TriggerCalibration, hours_since_last: float) -> None:
        """Decay calibration toward 1.0 if unused for weeks."""
        if hours_since_last < 24 * 7:
            return
        
        weeks_inactive = hours_since_last / (24 * 7)
        decay = min(0.3, CalibrationRecovery.DECAY_RATE_PER_WEEK * weeks_inactive)
        
        # Blend toward 1.0
        calibration.learned_multiplier = (
            calibration.learned_multiplier * (1 - decay) + 1.0 * decay
        )
```

**Integration:** Call `apply_repair_boost()` before learning. Call `apply_decay_to_neutral()` on load.

**Test:**
```python
# Repair boost
state = EmotionalState(conflict_tolerance=0.3)  # Recently damaged
boosted = CalibrationRecovery.apply_repair_boost(0.6, state, "positive")
assert boosted == 0.9  # 0.6 × 1.5

# Decay to neutral
cal = TriggerCalibration("teasing", learned_multiplier=0.6)
CalibrationRecovery.apply_decay_to_neutral(cal, hours_since_last=24*14)  # 2 weeks
assert cal.learned_multiplier > 0.6  # Moved toward 1.0
```

---

### Task 3.4: Integrate learning into post-LLM flow
for _ in range(10):
    engine.learn_from_outcome(state, triggers, "positive")
assert state.trigger_calibration["teasing"].learned_multiplier > 1.2
```

---

### Task 3.3: Integrate learning into post-LLM flow

**File:** `backend/routers/chat.py`

**In `_process_emotion_post_llm()`:**

Add after existing logic:
```python
# Learn from interaction
if triggers and behavior:
    outcome = infer_outcome(behavior)
    
    if outcome != "neutral":
        # Load current state
        state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
        calibration = json.loads(state_row.get('trigger_calibration_json') or '{}')
        
        # Build state with calibration
        state = EmotionalState(
            trigger_calibration={k: TriggerCalibration.from_dict(v) for k, v in calibration.items()}
        )
        
        # Learn
        updated = engine.learn_from_outcome(state, triggers, outcome)
        
        # Persist
        EmotionalStateRepository.update_calibration_json(
            user_id, agent_id,
            {k: v.to_dict() for k, v in state.trigger_calibration.items()}
        )
        
        logger.info("[Emotion] Learned from %s outcome: %s", outcome, list(updated.keys()))
```

**Note:** Need to pass `triggers` from pre-LLM to post-LLM (store in request context or return).

**Test:** Send messages, check that `trigger_calibration_json` is populated in DB.

---

## Phase 4: Relationship Dimensions (2 tasks)

### Task 4.1: Add crisp dimension update rules

**File:** `backend/services/emotion_engine.py`

**Principle:** Each dimension has explicit trigger mappings. No vibes.

**Add:**
```python
# Dimension update rules: (trigger, outcome) → delta
# Using consolidated trigger taxonomy (15 triggers)
DIMENSION_UPDATES = {
    "trust": {
        # Increases: reliability + respect
        ("praise", "positive"):       +0.02,
        ("affirmation", "positive"):  +0.02,
        ("accountability", "positive"): +0.04,
        ("disclosure", "positive"):   +0.03,
        # Decreases: violations, deception, dismissal
        ("rejection", "any"):         -0.08,
        ("dismissal", "any"):         -0.05,
        ("boundary", "negative"):     -0.06,
    },
    "intimacy": {
        # Increases: mutual vulnerability + warmth
        ("disclosure", "positive"):   +0.05,
        ("comfort", "positive"):      +0.02,
        ("trust_signal", "positive"): +0.03,
        # Decreases: coldness after disclosure
        ("disclosure", "negative"):   -0.04,
        ("rejection", "any"):         -0.03,
    },
    "playfulness_safety": {
        # Increases: teasing reciprocated/enjoyed
        ("teasing", "positive"):      +0.04,
        ("banter", "positive"):       +0.03,
        ("flirting", "positive"):     +0.02,
        # Decreases: "stop", withdrawal, defensiveness
        ("teasing", "negative"):      -0.06,  # Asymmetric: hurt > help
        ("banter", "negative"):       -0.04,
        ("flirting", "negative"):     -0.03,
    },
    "conflict_tolerance": {
        # Increases: conflict resolves without rupture
        ("apology", "positive"):      +0.03,
        ("accountability", "positive"): +0.04,
        ("reconnection", "positive"): +0.05,
        # Decreases: conflict → shutdown/stonewalling
        ("criticism", "any"):         -0.03,
        ("boundary", "any"):          -0.04,
        ("rejection", "any"):         -0.05,
    },
}


def update_relationship_dimensions(
    self,
    state: EmotionalState,
    triggers: list[tuple[str, float]],
    outcome: str,
) -> dict[str, float]:
    """
    Update relationship dimensions with crisp trigger-based rules.
    """
    deltas = {}
    
    for trigger, intensity in triggers:
        for dimension, rules in DIMENSION_UPDATES.items():
            # Check exact match first
            key = (trigger, outcome)
            if key in rules:
                delta = rules[key] * intensity
            elif (trigger, "any") in rules:
                delta = rules[(trigger, "any")] * intensity
            else:
                continue
            
            # Apply personality modifiers for trust
            if dimension == "trust":
                if delta > 0:
                    delta *= self.profile.trust_gain_rate
                else:
                    delta *= self.profile.trust_loss_rate
            
            # Update dimension
            current = getattr(state, dimension, 0.5)
            new_value = max(0.0, min(1.0, current + delta))
            setattr(state, dimension, new_value)
            
            deltas[dimension] = deltas.get(dimension, 0) + delta
    
    return deltas
```

**Test:**
```python
state = EmotionalState(trust=0.5, playfulness_safety=0.5, conflict_tolerance=0.7)
engine = EmotionEngine(profile)

# Teasing goes well
deltas = engine.update_relationship_dimensions(state, [("teasing", 0.8)], "positive")
assert state.playfulness_safety > 0.53  # +0.04 * 0.8

# Rejection hurts trust
deltas = engine.update_relationship_dimensions(state, [("rejection", 0.9)], "negative")
assert state.trust < 0.43  # -0.08 * 0.9 * trust_loss_rate

# Apology after conflict
deltas = engine.update_relationship_dimensions(state, [("apology", 0.8)], "positive")
assert state.conflict_tolerance > 0.65  # Recovering
```

---

### Task 4.2: Integrate dimension updates into flow

**File:** `backend/routers/chat.py`

**In post-LLM processing:**
```python
# Update relationship dimensions
if triggers:
    dimension_deltas = engine.update_relationship_dimensions(state, triggers, outcome)
    
    # Persist updated dimensions
    EmotionalStateRepository.update(
        user_id, agent_id,
        intimacy=state.intimacy,
        playfulness_safety=state.playfulness_safety,
        conflict_tolerance=state.conflict_tolerance,
    )
    
    if dimension_deltas:
        logger.info("[Emotion] Dimension updates: %s", dimension_deltas)
```

**Test:** Verify dimensions change over multiple interactions.

---

## Phase 5: Enhanced Context Generation (2 tasks)

### Task 5.1: Rich context block generator

**File:** `backend/services/emotion_engine.py`

**Replace/enhance `generate_context_block()`:**
```python
def generate_context_block(self, state: EmotionalState) -> str:
    """Generate rich emotional context for LLM prompt."""
    
    # Dominant moods
    dominant = self.get_dominant_moods(state, top_n=2)
    if dominant:
        primary, weight = dominant[0]
        intensity = "strongly" if weight > 10 else "somewhat" if weight > 5 else "slightly"
        mood_desc = f"{intensity} {primary}"
        if len(dominant) > 1:
            mood_desc += f", with hints of {dominant[1][0]}"
    else:
        mood_desc = "emotionally neutral"
    
    # Trust description
    if state.trust > 0.8:
        trust_desc = "deeply bonded, would share anything"
    elif state.trust > 0.6:
        trust_desc = "comfortable and safe"
    elif state.trust > 0.4:
        trust_desc = "warming up, cautiously open"
    elif state.trust > 0.2:
        trust_desc = "guarded, testing the waters"
    else:
        trust_desc = "wary, walls up"
    
    # Intimacy description
    if state.intimacy > 0.7:
        intimacy_desc = "emotionally close"
    elif state.intimacy > 0.4:
        intimacy_desc = "growing closer"
    else:
        intimacy_desc = "still surface-level"
    
    # Playfulness
    if state.playfulness_safety > 0.7:
        play_desc = "teasing is safe and bonding"
    elif state.playfulness_safety > 0.4:
        play_desc = "light teasing is okay"
    else:
        play_desc = "be careful with teasing"
    
    return f"""[EMOTIONAL_STATE]
You're feeling {mood_desc}.

Valence: {state.valence:+.0%} | Energy: {abs(state.arousal):.0%} {"high" if state.arousal > 0.3 else "calm"}
Trust: {state.trust:.0%} — {trust_desc}
Intimacy: {state.intimacy:.0%} — {intimacy_desc}
Dynamic: {play_desc}

Let this color your tone naturally — don't mention these explicitly.
[/EMOTIONAL_STATE]"""
```

**Test:** Generate context block, verify it reads naturally.

---

### Task 5.2: Add context to streaming flow

**File:** `backend/routers/chat.py`

**Ensure `_stream_chat_sse()` uses the same enhanced context generation as non-streaming.**

(Should already work if `_process_emotion_pre_llm` is called in both paths.)

**Test:** Streaming chat includes emotional context.

---

## Phase 6: Event Logging & Debugging (2 tasks)

### Task 6.1: Enhanced event logging

**File:** `backend/db/repositories/emotional_state.py`

**Add method:**
```python
@staticmethod
def log_event_v2(
    user_id: str,
    agent_id: str,
    session_id: str | None,
    message_snippet: str,
    triggers: list[tuple[str, float]],
    state_before: EmotionalState,
    state_after: EmotionalState,
    agent_behavior: dict,
    outcome: str,
    calibration_updates: dict | None = None,
) -> str:
    """Log a complete emotional event for debugging and analysis."""
    import json
    import uuid
    import time
    
    event_id = str(uuid.uuid4())
    now = time.time()
    
    dominant_before = max(state_before.mood_weights.items(), key=lambda x: x[1], default=("neutral", 0))[0]
    dominant_after = max(state_after.mood_weights.items(), key=lambda x: x[1], default=("neutral", 0))[0]
    
    with get_db() as conn:
        conn.execute("""
            INSERT INTO emotional_events_v2 (
                id, user_id, agent_id, session_id, timestamp,
                message_snippet, triggers_json,
                valence_before, valence_after,
                arousal_before, arousal_after,
                dominant_mood_before, dominant_mood_after,
                agent_mood_tag, agent_intent_tag, inferred_outcome,
                trust_delta, intimacy_delta, calibration_updates_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event_id, user_id, agent_id, session_id, now,
            message_snippet[:100] if message_snippet else None,
            json.dumps(triggers),
            state_before.valence, state_after.valence,
            state_before.arousal, state_after.arousal,
            dominant_before, dominant_after,
            agent_behavior.get("mood"), agent_behavior.get("intent"), outcome,
            state_after.trust - state_before.trust,
            state_after.intimacy - state_before.intimacy,
            json.dumps(calibration_updates) if calibration_updates else None,
        ))
    
    return event_id
```

**Test:** Log an event, query it back.

---

### Task 6.2: Debug endpoint for calibration

**File:** `backend/routers/emotional.py`

**Add endpoint:**
```python
@router.get("/debug/calibration/{user_id}/{agent_id}")
async def get_calibration(
    user_id: str,
    agent_id: str,
    token: str = Depends(verify_token)
):
    """Get user's trigger calibration profile for debugging."""
    state_row = EmotionalStateRepository.get_or_create(user_id, agent_id)
    calibration = json.loads(state_row.get('trigger_calibration_json') or '{}')
    
    return {
        "user_id": user_id,
        "agent_id": agent_id,
        "relationship_dimensions": {
            "trust": state_row.get("trust"),
            "intimacy": state_row.get("intimacy"),
            "playfulness_safety": state_row.get("playfulness_safety"),
            "conflict_tolerance": state_row.get("conflict_tolerance"),
        },
        "trigger_calibration": calibration,
        "interaction_count": state_row.get("interaction_count"),
    }
```

**Test:** Call endpoint, verify calibration data is returned.

---

## Testing Checklist

After all phases:

- [ ] **Divergence test:** Two users with same agent have different calibrations after 20 interactions
- [ ] **Essence test:** Ram never becomes as flirt-receptive as Rem regardless of user
- [ ] **Persistence test:** Calibrations survive server restart
- [ ] **Context test:** LLM receives relationship-aware context
- [ ] **Outcome test:** Positive/negative interactions correctly update calibrations

---

## File Summary

| File | Changes |
|------|---------|
| `backend/db/migrations/*.sql` | New columns, new table |
| `backend/services/emotion_engine.py` | TriggerCalibration, calibrated apply, learning, dimensions |
| `backend/db/repositories/emotional_state.py` | Load/save calibration, log_event_v2 |
| `backend/routers/chat.py` | Integrate calibration into pre/post LLM |
| `backend/routers/emotional.py` | Debug endpoints |

---

## Spawn Strategy

For parallel work with sub-agents:

1. **Agent A:** Phase 1 (schema) + Task 2.1-2.2 (dataclasses)
2. **Agent B:** Task 2.3-2.4 (repository + integration)  
3. **Agent C:** Phase 3 (outcome + learning)
4. **Agent D:** Phase 4-5 (dimensions + context)
5. **Final:** Phase 6 (logging) + integration testing

Dependencies: Phase 1 must complete before others. Phase 3 needs Phase 2.

---

*"Clear specifications yield clean implementations."*
— Beatrice 💗
