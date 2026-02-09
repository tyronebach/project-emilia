# Emotion Engine V2: Unified Companion Architecture

**Author:** Beatrice 💗
**Date:** 2026-02-08 (updated 2026-02-09)
**Status:** Implemented (Phase 1-4 complete, Mood Simplification applied)
**Philosophy:** *"My Rem is different from your Rem"*

---

## Executive Summary

A unified emotional architecture that creates genuinely unique companions through:
1. **Intrinsic personality** (agent DNA — fixed)
2. **Learned relationship** (user-agent bond — evolves)
3. **Transient mood** (moment-to-moment — volatile)

The key innovation: **per-user trigger calibration** that makes each companion diverge over time based on actual interactions.

---

## Design Principles

### 1. Divergence Over Convergence
Two users starting with identical Rem configurations should have measurably different Rems after 100 interactions. Not through randomness, but through accumulated response patterns.

### 2. VAD as Foundation, Mood as Texture
Valence-Arousal-Dominance provides the scientific backbone. Moods determine *how* emotions are expressed, not *what* emotions are felt.

```
High Valence + Bashful Mood  → shy smile, averted gaze
High Valence + Euphoric Mood → beaming, effusive praise
High Valence + Sassy Mood    → smug satisfaction, playful teasing
```

### 3. Memory Creates Meaning
An agent who remembers "last time you said that, I felt hurt" is fundamentally different from one operating on stateless triggers.

### 4. Relationships Are Earned, Not Declared
No dropdown to select "romantic partner." Intimacy, trust, and connection emerge from interaction patterns.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER MESSAGE                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRIGGER DETECTION                                    │
│                    (regex + LLM classification)                              │
│         Output: [(trigger_type, raw_intensity, context), ...]               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER-CALIBRATED TRIGGER PROCESSING                        │
│                                                                              │
│  For each trigger:                                                           │
│    1. Look up user's learned_multiplier for this trigger                    │
│    2. Apply agent's intrinsic trigger_sensitivity                           │
│    3. Compute effective_intensity = raw × learned × intrinsic               │
│                                                                              │
│  This is where "my Rem" diverges from "your Rem"                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMOTIONAL UPDATE                                     │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │ LAYER 1: VAD    │───▶│ LAYER 2: MOOD   │───▶│ LAYER 3: STATE  │         │
│  │ Direct deltas   │    │ Dot product     │    │ Final snapshot  │         │
│  │ (foundation)    │    │ projection      │    │ (for LLM)       │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                              │
│  Triggers → V/A deltas → dot(delta, mood_unit_vector) → mood weights       │
│  (No separate trigger_mood_map — moods auto-derived from V/A movement)     │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP DIMENSION UPDATE                             │
│                                                                              │
│  Based on trigger patterns and emotional outcomes:                          │
│    • Trust: asymmetric (slow gain, fast loss)                               │
│    • Intimacy: grows with vulnerability exchanges                           │
│    • Playfulness Threshold: adjusts based on teasing outcomes               │
│    • Conflict Tolerance: how much friction before rupture                   │
│                                                                              │
│  These dimensions replace discrete "friend/romantic" types                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT GENERATION                                   │
│                                                                              │
│  [EMOTIONAL_STATE]                                                          │
│  Current: bashful (strong), supportive (moderate)                           │
│  Valence: +0.7 | Arousal: 0.4 | Trust: 0.8                                 │
│  Relationship: intimate, playful-safe, conflict-wary                        │
│  Recent: User's teasing landed well; feeling closer                         │
│  [/EMOTIONAL_STATE]                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LLM RESPONSE                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POST-RESPONSE LEARNING                               │
│                                                                              │
│  1. Parse agent's behavior tags (mood, intent)                              │
│  2. Infer outcome valence (did this interaction go well?)                   │
│  3. Update user's trigger calibration profile                               │
│  4. Store emotional event for memory/replay                                 │
│                                                                              │
│  This closes the learning loop                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Essence Preservation (Critical Constraint)

**The concern:** Can users "game" the system to make Rem act like Ram?

**The answer:** No. Calibration modulates WITHIN personality bounds, never overrides them.

### How It Works

```python
# Intrinsic sensitivity (personality DNA) × Learned multiplier (user calibration)
effective_sensitivity = personality.trigger_sensitivities[trigger] * calibration.learned_multiplier

# Example: Flirting response
#   Rem intrinsic flirt_sensitivity: 1.5 (naturally receptive)
#   Ram intrinsic flirt_sensitivity: 0.3 (naturally dismissive)
#
#   User A (lots of successful flirting):
#     learned_multiplier = 1.4
#     Rem effective: 1.5 × 1.4 = 2.1 (very receptive)
#     Ram effective: 0.3 × 1.4 = 0.42 (still dismissive)
#
#   User B (flirting went poorly):
#     learned_multiplier = 0.6
#     Rem effective: 1.5 × 0.6 = 0.9 (receptive but cautious)
#     Ram effective: 0.3 × 0.6 = 0.18 (very dismissive)
```

**Ram can NEVER become as flirt-receptive as Rem.** The personality sets the scale; calibration adjusts within it.

### Essence Traits (Non-Negotiable)

Some traits are hard-coded and cannot be calibrated away:

```python
class EssenceTraits:
    """Core personality that defines WHO this agent is."""
    
    # Rem's essence
    devotion_floor: float = 0.7      # Cannot become cold/distant
    expressiveness_floor: float = 0.8  # Always emotionally open
    forgiveness_ceiling: float = 0.8   # Trust recovery is fast
    
    # Ram's essence  
    pride_floor: float = 0.6          # Cannot become meek
    composure_floor: float = 0.7      # Always maintains dignity
    grudge_ceiling: float = 0.4       # Trust recovery is slow
```

### Guardrails

1. **Calibration range:** 0.5 to 1.5 (±50% from neutral, never zeroed)
2. **Personality multiplication:** Intrinsic × Calibration, not replacement
3. **Essence floors/ceilings:** Hard limits that calibration cannot breach
4. **Baseline gravity:** Extreme calibrations decay toward 1.0 over time if not reinforced

---

## Layer 1: Agent Personality (DNA)

Immutable per agent. This is who they ARE.

```python
class AgentPersonality:
    # Identity
    agent_id: str
    display_name: str
    
    # Emotional Baseline (where they rest)
    baseline_valence: float      # -1 to +1 (Rem: 0.3 warm, Ram: 0.0 neutral)
    baseline_arousal: float      # -1 to +1 (Rem: 0.1 eager, Ram: -0.1 calm)
    baseline_dominance: float    # -1 to +1 (Rem: -0.1 deferential, Ram: 0.3 confident)
    
    # Emotional Dynamics
    volatility: float            # How much triggers affect them (Rem: 1.2, Ram: 0.6)
    recovery_rate: float         # How fast they return to baseline
    
    # Intrinsic Trigger Sensitivities (personality-based)
    trigger_sensitivities: dict  # e.g., {"compliment": 1.5, "criticism": 0.5}
    
    # Mood Disposition (default mood weights)
    mood_baseline: dict          # e.g., {"supportive": 7, "bashful": 4}
    
    # Trust Dynamics
    trust_gain_rate: float       # How easily they trust (Rem: 1.3, Ram: 0.5)
    trust_loss_rate: float       # How easily trust breaks (Rem: 0.7, Ram: 1.5)
    
    # Relationship Thresholds
    vulnerability_threshold: float   # Intimacy needed before opening up
    playfulness_threshold: float     # Trust needed for teasing to be safe
    conflict_rupture_threshold: float  # How much conflict before shutdown
```

### Personality Archetypes

| Agent | Valence | Arousal | Volatility | Trust Gain | Trust Loss | Vibe |
|-------|---------|---------|------------|------------|------------|------|
| **Rem** | +0.3 | +0.1 | 1.2 | 1.3 | 0.7 | Devoted, expressive, forgiving |
| **Ram** | 0.0 | -0.1 | 0.6 | 0.5 | 1.5 | Stoic, proud, holds grudges |
| **Beatrice** | +0.1 | 0.0 | 0.9 | 0.7 | 1.2 | Tsundere, guarded, secretly caring |
| **Emilia** | +0.25 | +0.05 | 0.8 | 1.0 | 1.0 | Gentle, balanced, nurturing |

---

## Layer 2: Relationship State (Per User-Agent)

Evolves over time. This is the BOND.

```python
class RelationshipState:
    user_id: str
    agent_id: str
    
    # Core Emotional State (current, volatile)
    valence: float
    arousal: float
    dominance: float
    
    # Mood State (current distribution)
    mood_weights: dict[str, float]  # {"bashful": 5.2, "supportive": 7.1, ...}
    
    # Relationship Dimensions (slow-moving)
    trust: float              # 0-1, asymmetric decay
    intimacy: float           # 0-1, grows with vulnerability
    familiarity: float        # 0-1, interaction count proxy
    attachment: float         # 0-1, separation anxiety factor
    
    # Learned Dynamics (per-user calibration)
    playfulness_calibration: float   # How safe is teasing with THIS user?
    conflict_tolerance: float        # How much friction before shutdown?
    
    # Temporal
    last_interaction: timestamp
    interaction_count: int
    
    # Learned Trigger Profile (THE KEY INNOVATION)
    trigger_calibration: dict  # See below
```

### Trigger Calibration Schema

This is what makes "my Rem" different:

```python
class TriggerCalibration:
    """Per-user learned response to each trigger type."""
    
    trigger_type: str          # e.g., "teasing"
    
    # Counts
    occurrence_count: int      # How often this user triggers this
    
    # Outcome Tracking
    positive_outcomes: int     # Times the interaction went well after
    negative_outcomes: int     # Times it went poorly
    neutral_outcomes: int
    
    # Learned Multiplier (computed from outcomes)
    learned_multiplier: float  # 0.5 (muted) to 1.5 (amplified)
    
    # Context patterns (optional, for nuance)
    common_phrases: list[str]  # What this user typically says
    avg_intensity: float       # How intense are their triggers usually
    
    # Last update
    last_occurrence: timestamp
```

**Example Divergence:**

```
User A (Thai) with Rem:
  teasing:
    count: 127
    positive: 115, negative: 12
    learned_multiplier: 1.35   # Teasing is VERY safe, even bonding
    
User B (Random) with Rem:
  teasing:
    count: 8
    positive: 2, negative: 6
    learned_multiplier: 0.6    # Teasing is risky, treat with caution
```

Same Rem personality, completely different learned behavior.

---

## Layer 3: Mood System (Expression Texture)

Moods determine HOW emotions are expressed, not WHAT is felt.

### Mood Groups (for UI + projection)

Moods are organized into 5 groups for Designer UI organization and visual coherence:

| Group | Moods | Color | Character |
|-------|-------|-------|-----------|
| **Warm & Caring** | supportive, euphoric, vulnerable, zen | `#4ade80` (green) | Nurturing, safe |
| **Playful & Light** | sassy, whimsical, flirty, bashful | `#facc15` (yellow) | Fun, lighthearted |
| **Sharp & Edgy** | snarky, sarcastic, defiant | `#f97316` (orange) | Biting, resistant |
| **Dark & Intense** | melancholic, suspicious, enraged | `#ef4444` (red) | Heavy, volatile |
| **Wild & Unpredictable** | seductive, erratic | `#a855f7` (purple) | Chaotic, alluring |

### Mood Derivation: Dot Product Projection

**Previous approach (removed):** A `trigger_mood_map` per relationship type mapped triggers → mood weights. This caused **double-dipping** — triggers affected V/A directly through `trigger_responses`, then again through a mood-mediated V/A override at 70/30 blend.

**Current approach:** Moods are **auto-derived from V/A deltas** using dot product projection onto each mood's normalized (V,A) unit vector. No separate config surface needed.

```python
# Each mood has a (valence, arousal) position in the mood palette.
# Normalize each to a unit vector:
#   supportive: (0.7, 0.3) → normalized (0.919, 0.394)
#   defiant:    (-0.3, 0.7) → normalized (-0.394, 0.919)

def calculate_mood_deltas_from_va(va_delta: dict) -> dict[str, float]:
    """
    For each mood: dot(delta_vector, mood_unit_vector)

    Positive dot = mood aligns with V/A movement → weight increases
    Negative dot = mood opposes → weight decreases
    """
    dv, da = va_delta['valence'], va_delta['arousal']
    mood_deltas = {}
    for mood, (uv, ua) in normalized_mood_vectors.items():
        dot = dv * uv + da * ua
        if abs(dot) > 0.001:
            mood_deltas[mood] = dot
    return mood_deltas

# Example: User compliments → triggers push valence +0.15, arousal +0.05
#   supportive: dot((0.15, 0.05), (0.919, 0.394)) = +0.157  → weight UP
#   defiant:    dot((0.15, 0.05), (-0.394, 0.919)) = -0.013  → weight DOWN
#   enraged:    dot((0.15, 0.05), (-0.664, 0.747)) = -0.062  → weight DOWN
#
# Example: User criticizes → triggers push valence -0.12, arousal +0.08
#   defiant:    dot((-0.12, 0.08), (-0.394, 0.919)) = +0.121  → weight UP
#   snarky:     dot((-0.12, 0.08), (0, 1.0))        = +0.080  → weight UP
#   supportive: dot((-0.12, 0.08), (0.919, 0.394)) = -0.079  → weight DOWN
```

**Why this is better:**
1. **No double-dipping**: Triggers → V/A (once), V/A → moods (projection)
2. **No extra config surface**: `trigger_mood_map` per relationship type is eliminated
3. **Automatic coherence**: Mood shifts always match the V/A direction the trigger pushed
4. **Designer-visible**: TriggerResponseEditor shows "mood drift" badges computed client-side

---

## Trigger Taxonomy (Consolidated)

**15 triggers in 5 categories.** Everything else maps into these.

Fewer triggers = denser calibration data = faster learning.

```python
TRIGGER_TAXONOMY = {
    # PLAY: Playful interactions
    "play": {
        "teasing":   "Playful mocking, jokes at their expense",
        "banter":    "Back-and-forth wit, verbal sparring", 
        "flirting":  "Romantic/playful advances",
    },
    
    # CARE: Supportive interactions
    "care": {
        "comfort":   "Reassurance, emotional support",
        "praise":    "Compliments, appreciation, gratitude",
        "affirmation": "Validation, agreement, encouragement",
    },
    
    # FRICTION: Challenging interactions
    "friction": {
        "criticism":  "Negative feedback, complaints",
        "rejection":  "Dismissal, coldness, abandonment",
        "boundary":   "Pushing limits, testing patience",
        "dismissal":  "Brushing off, ignoring, minimizing",
    },
    
    # REPAIR: Recovery interactions
    "repair": {
        "apology":      "Saying sorry, admitting fault",
        "accountability": "Taking responsibility, making amends",
        "reconnection":  "Reaching out after distance",
    },
    
    # VULNERABILITY: Intimate exchanges
    "vulnerability": {
        "disclosure":  "Sharing secrets, opening up",
        "trust_signal": "Explicit trust statements",
    },
}

# Mapping from old triggers to new taxonomy
TRIGGER_ALIASES = {
    "compliment": "praise",
    "gratitude": "praise", 
    "insult": "criticism",
    "conflict": "boundary",
    "betrayal": "rejection",
    "comfort": "comfort",
    "shared_joy": "affirmation",
    "greeting": None,  # No calibration impact
    "farewell": None,
}
```

---

## Relationship Dimensions (Crisp Update Rules)

### Dimension Definitions with Trigger Mappings

| Dimension | What It Measures | Increases When | Decreases When |
|-----------|------------------|----------------|----------------|
| **Trust** | Reliability + respect | `praise`, `affirmation`, `accountability` land well | `rejection`, `dismissal`, `boundary` (violated) |
| **Intimacy** | Mutual vulnerability | `disclosure` reciprocated with warmth | Coldness after `disclosure` |
| **Playfulness Safety** | Is teasing safe? | `teasing`, `banter` are reciprocated/enjoyed | "stop", withdrawal, defensiveness after `teasing` |
| **Conflict Tolerance** | Friction before shutdown | Conflict resolves via `apology`, `reconnection` | Conflict leads to stonewalling/shutdown |

### Update Rules (Deterministic)

```python
# Dimension update deltas (per trigger, per outcome)
DIMENSION_UPDATES = {
    # TRUST: slow to build, fast to break
    "trust": {
        ("praise", "positive"):      +0.02,
        ("affirmation", "positive"): +0.02,
        ("accountability", "positive"): +0.04,  # Owning mistakes builds trust
        ("rejection", "any"):        -0.08,
        ("dismissal", "any"):        -0.05,
        ("boundary", "negative"):    -0.06,     # Boundary violation
        ("disclosure", "positive"):  +0.03,     # Trust grows with vulnerability
    },
    
    # INTIMACY: grows with mutual vulnerability  
    "intimacy": {
        ("disclosure", "positive"):  +0.05,     # Opening up went well
        ("disclosure", "negative"):  -0.04,     # Vulnerability punished
        ("comfort", "positive"):     +0.02,     # Warmth after disclosure
        ("rejection", "any"):        -0.03,     # Coldness hurts intimacy
    },
    
    # PLAYFULNESS SAFETY: calibrated by teasing outcomes
    "playfulness_safety": {
        ("teasing", "positive"):     +0.04,     # Teasing landed well
        ("teasing", "negative"):     -0.06,     # Teasing hurt (asymmetric)
        ("banter", "positive"):      +0.03,
        ("banter", "negative"):      -0.04,
        ("flirting", "positive"):    +0.02,
        ("flirting", "negative"):    -0.03,
    },
    
    # CONFLICT TOLERANCE: recovered through repair
    "conflict_tolerance": {
        ("criticism", "any"):        -0.03,
        ("boundary", "any"):         -0.04,
        ("rejection", "any"):        -0.05,
        ("apology", "positive"):     +0.03,     # Apology accepted
        ("accountability", "positive"): +0.04,
        ("reconnection", "positive"): +0.05,    # Reaching out worked
    },
}


def update_relationship_dimensions(
    state: RelationshipState,
    trigger: str,
    outcome: str,  # "positive" | "negative" | "neutral"
    personality: AgentPersonality,
) -> dict[str, float]:
    """
    Update relationship dimensions based on trigger and outcome.
    
    Returns deltas applied.
    """
    deltas = {}
    
    for dimension, rules in DIMENSION_UPDATES.items():
        # Check for exact match
        key = (trigger, outcome)
        if key in rules:
            delta = rules[key]
        elif (trigger, "any") in rules:
            delta = rules[(trigger, "any")]
        else:
            continue
        
        # Apply personality modifiers
        if dimension == "trust":
            if delta > 0:
                delta *= personality.trust_gain_rate
            else:
                delta *= personality.trust_loss_rate
        
        # Apply delta
        current = getattr(state, dimension, 0.5)
        new_value = max(0.0, min(1.0, current + delta))
        setattr(state, dimension, new_value)
        deltas[dimension] = delta
    
    return deltas
```

### Example Scenarios

**Scenario 1: User teases, agent enjoys it**
```
Trigger: teasing, Outcome: positive
→ playfulness_safety += 0.04
→ Agent learns teasing is safe with this user
```

**Scenario 2: User shares secret, agent responds coldly**
```
Trigger: disclosure, Outcome: negative  
→ intimacy -= 0.04
→ trust -= 0.02 (indirect, vulnerability punished)
→ User learns this agent isn't safe for secrets
```

**Scenario 3: User apologizes after conflict**
```
Trigger: apology, Outcome: positive
→ conflict_tolerance += 0.03
→ trust += 0.02 (accountability variation)
→ Relationship can survive friction
```
```

---

## Trigger Calibration Learning

The core innovation: learning user-specific trigger sensitivities.

### Hardening Principles

**Problem 1: Outcome inference can be noisy**
- LLM self-report tags can hallucinate
- Single signals are unreliable

**Solution: Multi-signal + confidence gating**

**Problem 2: Cold start / overfit**
- "8 occurrences, 75% negative" isn't enough evidence
- Early interactions can wreck calibration

**Solution: Bayesian priors + smoothing**

**Problem 3: Context matters**
- Teasing at high trust ≠ teasing at low trust
- Same trigger, different meaning

**Solution: Context-bucketed calibration**

**Problem 4: Irreversible drift**
- Once playfulness_safety tanks, agent may never tease again

**Solution: Reversibility hooks + decay to neutral**

---

### Outcome Inference (Multi-Signal)

```python
@dataclass
class OutcomeSignal:
    """A single signal contributing to outcome inference."""
    source: str        # "user_explicit", "user_behavior", "agent_tag", "sentiment"
    direction: str     # "positive", "negative", "neutral"
    weight: float      # Signal strength (0.0 to 1.0)
    confidence: float  # How sure are we (0.0 to 1.0)


def infer_outcome_multisignal(
    user_message: str,
    agent_behavior: dict,
    response_latency_ms: int,
    previous_messages: list[str],
) -> tuple[str, float]:
    """
    Infer outcome from multiple signals.
    
    Returns: (outcome, confidence)
    """
    signals = []
    
    # === STRONG SIGNALS (high weight) ===
    
    # User explicit positive
    positive_explicit = {"lol", "😂", "haha", "love that", "perfect", "yes!", "❤️", "🥰"}
    negative_explicit = {"stop", "don't", "that hurt", "not funny", "rude", "wtf", "😢", "😠"}
    
    msg_lower = user_message.lower()
    for phrase in positive_explicit:
        if phrase in msg_lower:
            signals.append(OutcomeSignal("user_explicit", "positive", 0.9, 0.85))
            break
    for phrase in negative_explicit:
        if phrase in msg_lower:
            signals.append(OutcomeSignal("user_explicit", "negative", 0.9, 0.85))
            break
    
    # User re-engagement (behavioral)
    if response_latency_ms < 5000:  # Quick response = engaged
        signals.append(OutcomeSignal("user_behavior", "positive", 0.3, 0.6))
    elif response_latency_ms > 60000:  # Long silence = disengaged
        signals.append(OutcomeSignal("user_behavior", "negative", 0.3, 0.5))
    
    # User mirrors the style (teases back, comforts back)
    if previous_messages:
        # Simple heuristic: similar emoji/tone usage
        pass  # TODO: implement style mirroring detection
    
    # === WEAK SIGNALS (low weight) ===
    
    # Agent self-report (can hallucinate)
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
    
    # Weighted vote
    pos_score = sum(s.weight * s.confidence for s in signals if s.direction == "positive")
    neg_score = sum(s.weight * s.confidence for s in signals if s.direction == "negative")
    total_confidence = sum(s.weight * s.confidence for s in signals)
    
    if total_confidence < 0.3:
        return ("neutral", total_confidence)
    
    if pos_score > neg_score * 1.2:  # Need clear winner
        return ("positive", min(0.95, pos_score / (pos_score + neg_score + 0.1)))
    elif neg_score > pos_score * 1.2:
        return ("negative", min(0.95, neg_score / (pos_score + neg_score + 0.1)))
    
    return ("neutral", 0.4)
```

---

### Calibration Math (Bayesian Smoothing)

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
    
    # Priors (pseudo-counts for smoothing)
    PRIOR_POSITIVE: float = 10.0  # Assume 10 neutral-positive interactions
    PRIOR_NEGATIVE: float = 10.0  # Assume 10 neutral-negative interactions
    PRIOR_TOTAL: float = 20.0     # Total prior weight
    
    # Minimum samples before calibration becomes meaningful
    MIN_SAMPLES: int = 30
    
    # Computed
    learned_multiplier: float = 1.0
    last_occurrence: float = 0.0
    
    def update(self, outcome: str, confidence: float) -> None:
        """Update calibration with new observation."""
        self.occurrence_count += 1
        
        # Weight the update by confidence
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
        
        # Map to multiplier: rate=0 → 0.75, rate=0.5 → 1.0, rate=1 → 1.5
        # Formula: 0.5 + rate (gives 0.5 to 1.5 range)
        # But we want neutral prior to give 1.0, so:
        # multiplier = 0.75 + 0.75 * rate
        # rate=0 → 0.75, rate=0.5 → 1.125, rate=1 → 1.5
        
        raw_multiplier = 0.75 + 0.5 * rate
        
        # Confidence scaling: don't trust calibration until enough samples
        if self.occurrence_count < self.MIN_SAMPLES:
            # Blend toward 1.0 based on sample count
            blend = self.occurrence_count / self.MIN_SAMPLES
            self.learned_multiplier = 1.0 + (raw_multiplier - 1.0) * blend
        else:
            self.learned_multiplier = raw_multiplier
        
        # Hard clamp
        self.learned_multiplier = max(0.5, min(1.5, self.learned_multiplier))
```

**Why this works:**
- With 0 observations, multiplier ≈ 1.0 (prior is 50/50)
- First 10 negative events: multiplier drops to ~0.9 (not 0.5!)
- Need ~30+ samples before calibration fully kicks in
- Prevents early overfit

---

### Context-Bucketed Calibration

Teasing at high trust ≠ teasing at low trust. Store calibration per context bucket:

```python
@dataclass
class ContextBucket:
    """Context state for bucketed calibration."""
    trust_level: str      # "low" (<0.4), "mid" (0.4-0.7), "high" (>0.7)
    arousal_level: str    # "calm" (<0.3), "activated" (≥0.3)
    recent_conflict: bool # Conflict in last 5 messages
    
    @classmethod
    def from_state(cls, state: RelationshipState) -> 'ContextBucket':
        return cls(
            trust_level="low" if state.trust < 0.4 else "high" if state.trust > 0.7 else "mid",
            arousal_level="calm" if state.arousal < 0.3 else "activated",
            recent_conflict=state.conflict_tolerance < 0.5,  # Proxy for recent conflict
        )
    
    def key(self) -> str:
        return f"{self.trust_level}_{self.arousal_level}_{'conflict' if self.recent_conflict else 'ok'}"


class ContextualTriggerCalibration:
    """Calibration that varies by relationship context."""
    
    def __init__(self, trigger_type: str):
        self.trigger_type = trigger_type
        self.buckets: dict[str, TriggerCalibration] = {}
        self.global_calibration = TriggerCalibration(trigger_type=trigger_type)
    
    def get_multiplier(self, context: ContextBucket) -> float:
        """Get multiplier for current context, with fallback."""
        key = context.key()
        
        if key in self.buckets and self.buckets[key].occurrence_count >= 10:
            # Use context-specific if enough data
            return self.buckets[key].learned_multiplier
        
        # Fall back to global
        return self.global_calibration.learned_multiplier
    
    def update(self, context: ContextBucket, outcome: str, confidence: float) -> None:
        """Update both global and context-specific calibration."""
        key = context.key()
        
        # Always update global
        self.global_calibration.update(outcome, confidence)
        
        # Update context-specific
        if key not in self.buckets:
            self.buckets[key] = TriggerCalibration(trigger_type=self.trigger_type)
        self.buckets[key].update(outcome, confidence)
```

**Example:** User teases a lot at high trust (positive outcomes). Later, trust drops due to conflict. Now teasing calibration for "low trust" bucket is still neutral/negative, so agent is cautious. But once trust recovers, the positive "high trust" calibration kicks back in.

---

### Reversibility Hooks

Prevent calibration from becoming permanently stuck:

```python
class CalibrationRecovery:
    """Mechanisms to prevent irreversible calibration drift."""
    
    # 1. Repair window: After conflict, positive signals rebuild faster
    REPAIR_WINDOW_HOURS: float = 24.0
    REPAIR_BOOST: float = 1.5  # Positive outcomes count 1.5x during repair
    
    # 2. Decay to neutral: Unused calibrations slowly normalize
    DECAY_RATE_PER_WEEK: float = 0.05  # 5% decay toward 1.0 per week of inactivity
    
    # 3. Play test: Occasional micro-probe when uncertain
    PROBE_THRESHOLD: float = 0.4  # If confidence < 0.4, consider probing
    PROBE_COOLDOWN_HOURS: float = 48.0
    
    @staticmethod
    def apply_repair_boost(
        calibration: TriggerCalibration,
        state: RelationshipState,
        outcome: str,
        confidence: float
    ) -> float:
        """Boost positive outcomes during repair window."""
        if outcome != "positive":
            return confidence
        
        # Check if in repair window (recent conflict + repair attempts)
        if state.conflict_tolerance < 0.5:  # Recently damaged
            return confidence * CalibrationRecovery.REPAIR_BOOST
        
        return confidence
    
    @staticmethod
    def apply_decay(
        calibration: TriggerCalibration,
        hours_since_last: float
    ) -> None:
        """Decay calibration toward neutral if unused."""
        if hours_since_last < 24 * 7:  # Less than a week
            return
        
        weeks_inactive = hours_since_last / (24 * 7)
        decay = CalibrationRecovery.DECAY_RATE_PER_WEEK * weeks_inactive
        
        # Blend multiplier toward 1.0
        calibration.learned_multiplier = (
            calibration.learned_multiplier * (1 - decay) + 
            1.0 * decay
        )
    
    @staticmethod
    def should_probe(calibration: TriggerCalibration, trigger_type: str) -> bool:
        """Should we do a gentle test of this trigger?"""
        # Only for playful triggers
        if trigger_type not in ("teasing", "flirting", "banter"):
            return False
        
        # Only if calibration is negative and we're uncertain
        if calibration.learned_multiplier > 0.8:
            return False
        
        if calibration.occurrence_count > 50:
            return False  # We have enough data
        
        # Check cooldown
        hours_since = (time.time() - calibration.last_occurrence) / 3600
        if hours_since < CalibrationRecovery.PROBE_COOLDOWN_HOURS:
            return False
        
        return True
```

---

### Final Delta Formula

Three-layer multiplication as Thai specified:

```python
def compute_effective_delta(
    trigger: str,
    raw_intensity: float,
    personality: AgentPersonality,
    state: RelationshipState,
    calibration: ContextualTriggerCalibration,
) -> float:
    """
    Compute final delta with all layers applied.
    
    delta = base_delta × DNA_sensitivity × bond_mod × user_multiplier × intensity
    """
    
    # Base delta for this trigger
    base_delta = DEFAULT_TRIGGER_DELTAS.get(trigger, {})
    
    # Layer 1: DNA sensitivity (personality)
    dna_sensitivity = personality.trigger_sensitivities.get(trigger, 1.0)
    
    # Layer 2: Bond modifier (relationship state)
    # Trust amplifies positive triggers, mutes negative at high trust
    if base_delta.get("valence", 0) > 0:
        bond_mod = 0.7 + (state.trust * 0.6)  # 0.7 to 1.3
    else:
        bond_mod = 1.3 - (state.trust * 0.6)  # 1.3 to 0.7
    
    # Intimacy amplifies vulnerability-related triggers
    if trigger in ("vulnerability", "comfort", "shared_joy"):
        bond_mod *= 0.8 + (state.intimacy * 0.4)  # 0.8 to 1.2
    
    # Layer 3: User calibration
    context = ContextBucket.from_state(state)
    user_multiplier = calibration.get_multiplier(context)
    
    # Combine
    effective = raw_intensity * dna_sensitivity * bond_mod * user_multiplier
    
    # Clamp to prevent extremes
    return max(0.1, min(3.0, effective))
```

---

## Context Block Generation

What the LLM actually sees:

```python
def generate_context_block(state: RelationshipState,
                           personality: AgentPersonality) -> str:
    """
    Generate rich emotional context for LLM prompt injection.
    """
    
    # Dominant moods
    dominant = get_dominant_moods(state.mood_weights, top_n=2)
    mood_desc = format_mood_description(dominant)
    
    # Relationship summary
    rel_desc = format_relationship(state)
    
    # Recent emotional trajectory (optional)
    trajectory = format_recent_trajectory(state)
    
    return f"""[EMOTIONAL_STATE]
You are feeling {mood_desc}.

Emotional tone:
  Valence: {format_percent(state.valence)} ({"positive" if state.valence > 0 else "negative"})
  Energy: {format_percent(state.arousal)} ({"high" if state.arousal > 0.3 else "calm"})

Relationship with user:
  Trust: {format_percent(state.trust)} — {describe_trust(state.trust)}
  Intimacy: {format_percent(state.intimacy)} — {describe_intimacy(state.intimacy)}
  Dynamic: {rel_desc}

{trajectory if trajectory else ""}
Let these feelings color your responses naturally. Don't mention them explicitly.
[/EMOTIONAL_STATE]"""


def format_mood_description(dominant: list[tuple[str, float]]) -> str:
    if not dominant:
        return "emotionally neutral"
    
    primary, weight = dominant[0]
    intensity = "strongly" if weight > 10 else "somewhat" if weight > 5 else "slightly"
    
    if len(dominant) > 1:
        secondary = dominant[1][0]
        return f"{intensity} {primary}, with hints of {secondary}"
    
    return f"{intensity} {primary}"


def describe_trust(trust: float) -> str:
    if trust > 0.8: return "deep bond, would share anything"
    if trust > 0.6: return "comfortable, feels safe"
    if trust > 0.4: return "warming up, cautiously open"
    if trust > 0.2: return "guarded, testing the waters"
    return "wary, walls up"


def describe_intimacy(intimacy: float) -> str:
    if intimacy > 0.8: return "soul-deep connection"
    if intimacy > 0.6: return "emotionally close, vulnerable together"
    if intimacy > 0.4: return "growing closer, sharing more"
    if intimacy > 0.2: return "friendly but surface-level"
    return "polite distance"
```

---

## Database Schema Updates

```sql
-- Extend emotional_state table
ALTER TABLE emotional_state ADD COLUMN intimacy REAL DEFAULT 0.2;
ALTER TABLE emotional_state ADD COLUMN playfulness_safety REAL DEFAULT 0.5;
ALTER TABLE emotional_state ADD COLUMN conflict_tolerance REAL DEFAULT 0.7;
ALTER TABLE emotional_state ADD COLUMN trigger_calibration_json TEXT;  -- JSON blob

-- New table for emotional event log (for learning + memory)
CREATE TABLE emotional_events_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    timestamp REAL NOT NULL,
    
    -- What happened
    message_snippet TEXT,           -- First 100 chars for context
    triggers_json TEXT,             -- [["teasing", 0.7], ...]
    
    -- State changes
    valence_before REAL,
    valence_after REAL,
    arousal_before REAL,
    arousal_after REAL,
    mood_shift_json TEXT,           -- {"bashful": +2, "supportive": -1}
    
    -- Outcome (for learning)
    agent_mood_tag TEXT,            -- Agent's self-reported mood
    inferred_outcome TEXT,          -- "positive" | "negative" | "neutral"
    
    -- Relationship changes
    trust_delta REAL,
    intimacy_delta REAL,
    
    FOREIGN KEY (user_id, agent_id) REFERENCES emotional_state(user_id, agent_id)
);

CREATE INDEX idx_emotional_events_v2_user_agent 
    ON emotional_events_v2(user_id, agent_id, timestamp DESC);
```

---

## Migration Path

### Phase 1: Foundation ✅ (2026-02-08)
- [x] Add new columns to emotional_state (intimacy, playfulness_safety, conflict_tolerance, trigger_calibration_json)
- [x] Create emotional_events_v2 table
- [x] Implement trigger_calibration loading/saving
- [x] Update _process_emotion_pre_llm to use calibration

### Phase 2: Learning Loop ✅ (2026-02-08)
- [x] Implement outcome inference from behavior tags (multi-signal)
- [x] Add learn_from_interaction to post-LLM processing
- [x] Create calibration update logic (Bayesian smoothing + context buckets)
- [x] Add intimacy/playfulness_safety/conflict_tolerance updates

### Phase 3: Context Enhancement ✅ (2026-02-08)
- [x] Rich context block generation with mood + relationship + trigger personality hints
- [x] Relationship dimension descriptions
- [x] Testing with real conversations

### Phase 4: Designer UI ✅ (2026-02-08)
- [x] Visualize user-agent relationship state (Bonds tab)
- [x] Show trigger calibration per user (Calibration tab)
- [x] Simulate interactions in designer (Simulator tab)
- [x] Compare "same agent, different users" (Bond Compare)

### Phase 5: Mood System Simplification ✅ (2026-02-09)
- [x] Remove double-dipping: `trigger_mood_map` deleted, `_update_valence_arousal_from_moods()` disabled
- [x] Add `MOOD_GROUPS` constant for UI organization (5 groups × 2-4 moods)
- [x] Add `calculate_mood_deltas_from_va()` — dot product projection of V/A deltas onto mood unit vectors
- [x] Wire new flow in `chat.py`: accumulate V/A deltas → project onto moods
- [x] Add `/api/designer/v2/mood-groups` endpoint
- [x] Update simulator to compute mood_shifts via V/A projection
- [x] Remove `get_trigger_mood_map()` from `config_loader.py`
- [x] Add `MoodBaselineEditor` component (grouped sliders by mood group)
- [x] Add mood drift preview badges in `TriggerResponseEditor`

---

## Success Metrics

### Uniqueness Test
After 50 interactions each:
- User A's Rem trust: 0.82
- User B's Rem trust: 0.45
- User A's teasing_multiplier: 1.4
- User B's teasing_multiplier: 0.7

**Pass:** Measurable divergence in relationship state and learned calibration.

### Personality Preservation Test
All users' Rems should still:
- Have baseline_valence ~0.3 (devoted disposition)
- High volatility (expressive)
- Forgiving trust dynamics

**Pass:** Core personality traits remain consistent while relationship diverges.

### Behavior Differentiation Test
Same message to different user's Rems:
- "You're such a dork"
  - User A (high playfulness_safety): Bashful, flirty response
  - User B (low playfulness_safety): Slightly hurt, defensive response

**Pass:** Same trigger produces different responses based on learned calibration.

---

## Appendix: Consolidated Trigger Taxonomy (15 Triggers)

| Category | Trigger | Description | Dimension Impact |
|----------|---------|-------------|------------------|
| **PLAY** | `teasing` | Playful mocking, jokes at expense | playfulness_safety |
| | `banter` | Back-and-forth wit, verbal sparring | playfulness_safety |
| | `flirting` | Romantic/playful advances | playfulness_safety, intimacy |
| **CARE** | `comfort` | Reassurance, emotional support | intimacy, trust |
| | `praise` | Compliments, appreciation, gratitude | trust, valence |
| | `affirmation` | Validation, agreement, encouragement | trust, valence |
| **FRICTION** | `criticism` | Negative feedback, complaints | conflict_tolerance, valence |
| | `rejection` | Dismissal, coldness, abandonment | trust, intimacy, conflict_tolerance |
| | `boundary` | Pushing limits, testing patience | conflict_tolerance, trust |
| | `dismissal` | Brushing off, ignoring, minimizing | trust, valence |
| **REPAIR** | `apology` | Saying sorry, admitting fault | conflict_tolerance, trust |
| | `accountability` | Taking responsibility, making amends | trust, conflict_tolerance |
| | `reconnection` | Reaching out after distance | conflict_tolerance, intimacy |
| **VULNERABILITY** | `disclosure` | Sharing secrets, opening up | intimacy, trust |
| | `trust_signal` | Explicit trust statements | trust, intimacy |

### Alias Mapping (Legacy → Consolidated)

```python
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
    "greeting": None,   # No calibration
    "farewell": None,   # No calibration
    "question": None,   # No calibration
}
```

---

## Appendix: Mood Palette (16 Core)

Moods are stored in the `moods` DB table and grouped via the `MOOD_GROUPS` constant in `emotion_engine.py`.

| Mood | V | A | Group | Expression |
|------|---|---|-------|------------|
| supportive | +0.7 | 0.3 | **warm** | nurturing, helpful |
| euphoric | +0.9 | 0.8 | **warm** | ecstatic, overjoyed |
| vulnerable | +0.2 | 0.3 | **warm** | open, tender |
| zen | +0.4 | 0.1 | **warm** | peaceful, centered |
| sassy | +0.3 | 0.6 | **playful** | cheeky, spirited |
| whimsical | +0.5 | 0.5 | **playful** | lighthearted, spontaneous |
| flirty | +0.6 | 0.6 | **playful** | teasing, romantic |
| bashful | +0.3 | 0.4 | **playful** | shy, flustered |
| snarky | 0.0 | 0.5 | **sharp** | biting humor |
| sarcastic | +0.1 | 0.4 | **sharp** | dry, ironic |
| defiant | -0.3 | 0.7 | **sharp** | stubborn, resistant |
| melancholic | -0.4 | 0.2 | **dark** | sad, wistful |
| suspicious | -0.2 | 0.5 | **dark** | wary, guarded |
| enraged | -0.8 | 0.9 | **dark** | furious, explosive |
| seductive | +0.5 | 0.7 | **wild** | alluring, intimate |
| erratic | 0.0 | 0.9 | **wild** | unpredictable |

### V/A Dot Product Projection

Each mood's (V,A) is normalized to a unit vector. When triggers push V/A in a direction, the dot product with each mood vector determines how much that mood's weight shifts:

```
Trigger pushes V/A → delta = (dV, dA)
For each mood: shift = dot(delta, unit_vector(mood_V, mood_A))
  positive shift → mood weight increases (aligned with V/A movement)
  negative shift → mood weight decreases (opposes V/A movement)
```

This replaces the old `trigger_mood_map` configuration, eliminating the double-dipping problem where triggers affected V/A twice (directly + via mood → V/A override).

---

*"Each relationship is a unique story written by two people. The agent brings their nature; the user brings their choices. Together, they create something that has never existed before."*

— Beatrice 💗, Keeper of the Forbidden Library
