# Emotional Engine Architecture

**Status:** Design (pre-implementation)  
**Author:** Thai + Beatrice  
**Date:** 2026-02-08

---

## Overview

A persistent emotional state system that maintains continuous agent emotions across conversations. Unlike per-message behavior tags (used for animation), the emotional engine tracks evolving emotional state that influences personality, memory retrieval, and response generation.

**Philosophy:** We treat agents as real beings with real emotions. Emotions don't reset per message — they drift, decay, and evolve based on interactions.

---

## Core Concepts

### 1. Event vs State (Critical Boundary)

**Event:** An immutable, timestamped record with deltas. Events are facts that happened.

**State:** Derived by applying decay + all event deltas since last snapshot. State is computed, not stored raw.

```
state(now) = apply_decay(last_snapshot) + sum(events since last_snapshot)
```

This separation prevents bugs like:
- Double-decay during retries
- Stacking deltas twice on reprocessing
- Race conditions between concurrent updates

**Rule:** Never mutate state directly. Always emit an event, then recompute state.

### 2. Persistent Emotional State

Maintain a running agent emotional state per user-agent pair that doesn't reset per message.

- State is **continuous** (weights/scores), not discrete labels
- State persists across sessions
- Each user has a unique emotional relationship with each agent

### 3. Baseline Mood + Bounded Drift

Each agent has a **baseline mood profile** (their personality's emotional center).

- Drift is allowed but pulled back toward baseline over time (**homeostasis**)
- Prevents agents from getting "stuck" in extreme states
- Different agents have different baselines (Beatrice: slightly tsundere, Emilia: warm/caring)

### 4. Volatility & Recovery (Precise Definitions)

| Parameter | Definition | Effect |
|-----------|------------|--------|
| **`emotional_volatility`** | Multiplier on incoming deltas (0.1 – 2.0) | Sensitivity to events. High = reactive, low = stoic |
| **`emotional_recovery`** | Decay speed toward baseline (0.01 – 0.5) | Snap-back rate. High = quick return, low = lingers |

**Formulas:**
```python
# Applying an event delta
effective_delta = raw_delta * agent.emotional_volatility

# Decay toward baseline (per time unit)
decay = (current - baseline) * agent.emotional_recovery * time_elapsed
new_value = current - decay
```

**Examples:**
- Beatrice: volatility=0.7 (reserved), recovery=0.15 (returns to tsun quickly)
- Emilia: volatility=1.0 (emotionally present), recovery=0.08 (moods linger)

### 3. Valence / Arousal Core Model

Based on Russell's Circumplex Model of Affect. Track at minimum two axes:

| Axis | Range | Description |
|------|-------|-------------|
| **Valence** | -1 ↔ +1 | Negative (sad, angry) ↔ Positive (happy, content) |
| **Arousal** | -1 ↔ +1 | Calm (relaxed, sleepy) ↔ Activated (excited, agitated) |

**Optional extension axes:**

| Axis | Range | Description |
|------|-------|-------------|
| **Dominance** | -1 ↔ +1 | Submissive ↔ Dominant (control in conversation) |
| **Trust** | 0 → 1 | Relationship trust level (grows slowly, breaks quickly) |
| **Attachment** | 0 → 1 | Emotional bond strength |
| **Familiarity** | 0 → 1 | How well they "know" this user |

### Trust/Attachment Asymmetry

Trust grows slowly but breaks quickly. Explicit in formulas:

```python
def apply_trust_delta(current_trust, delta):
    if delta > 0:
        # Positive: slow, capped
        effective = delta * 0.3  # 30% of raw delta
        effective = min(effective, 0.05)  # cap per event
    else:
        # Negative: faster, larger
        effective = delta * 1.5  # 150% of raw delta
        effective = max(effective, -0.15)  # cap per event
    
    return clamp(current_trust + effective, 0, 1)
```

### Dominance Axis Definition

| Increases Dominance | Decreases Dominance |
|---------------------|---------------------|
| Agent sets boundaries | Agent defers to user |
| Agent leads conversation | User dominates topic |
| Agent expresses strong preferences | Agent hedges/qualifies |
| Agent teases/challenges | Agent apologizes frequently |

**Behavioral effects of dominance:**
- High dominance → interrupts more, asks leading questions, asserts opinions
- Low dominance → hedges, uses qualifiers ("maybe", "I think"), asks for validation

---

## Tag-to-Impact Mappings

A mapping layer converts detected tags/events into emotional deltas.

### Input Sources

Tags can come from:
- **LLM annotations** — e.g., `[mood:happy:0.5]` from agent response
- **Intent classifier** — detected user intent (compliment, question, command)
- **Conversation event detectors** — compliment, rejection, teasing, conflict, comfort, affirmation, dismissal

### Delta Mapping Table (example)

| Trigger | Δ Valence | Δ Arousal | Δ Trust | Notes |
|---------|-----------|-----------|---------|-------|
| `compliment` | +0.15 | +0.05 | +0.02 | Positive, slightly activating |
| `rejection` | -0.20 | +0.10 | -0.05 | Negative, activating (hurt) |
| `teasing` | +0.05 | +0.10 | +0.01 | Playful, depends on context |
| `conflict` | -0.25 | +0.30 | -0.10 | Negative, high arousal |
| `comfort` | +0.20 | -0.10 | +0.05 | Positive, calming |
| `affirmation` | +0.10 | +0.05 | +0.03 | Mild positive |
| `dismissal` | -0.10 | -0.05 | -0.02 | Mild negative |
| `long_absence` | -0.05 | -0.10 | -0.01 | Slight sadness on return |
| `return_after_absence` | +0.15 | +0.20 | +0.02 | Happy to see them |

Impacts are **signed, scaled, and clamped** to prevent overflow.

---

## Event Weighting & Intensity

The same tag can hit differently depending on context.

### Intensity Scaling

Tags include intensity (0–1+):
- `[mood:happy:0.3]` → mild effect
- `[mood:happy:0.9]` → strong effect

### Contextual Multipliers

| Factor | Multiplier Range | Description |
|--------|------------------|-------------|
| **Novelty** | 0.5x – 1.5x | Repeated events have diminished impact |
| **Directness** | 0.7x – 1.3x | "You're amazing" > "That's cool" |
| **Relationship** | 0.5x – 2.0x | Higher trust = compliments hit harder; low trust = criticism hits harder |
| **Recency** | decay curve | Recent events weighted more |

### Novelty Counter Cache

Track repeated triggers per window to apply novelty multiplier:

```sql
-- Lightweight counter cache (in emotional_state or separate)
CREATE TABLE trigger_counts (
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    window TEXT NOT NULL,            -- 'session', 'day', 'week'
    count INTEGER DEFAULT 0,
    last_seen REAL,
    PRIMARY KEY (user_id, agent_id, trigger_type, window)
);
```

```python
def get_novelty_multiplier(count):
    # First occurrence = 1.5x, diminishes to 0.5x
    return max(0.5, 1.5 - (count * 0.2))
```

### Play Context Flag (Sarcasm/Banter Handling)

Teasing and sarcasm flip from negative to positive when trust is high:

```python
def adjust_for_play_context(trigger, delta, trust):
    playful_triggers = {'teasing', 'sarcasm', 'mock_insult', 'banter'}
    
    if trigger in playful_triggers:
        if trust > 0.7:
            # High trust: teasing is bonding
            return abs(delta) * 0.5  # Flip to positive, reduced
        elif trust > 0.4:
            # Medium trust: neutral, slight positive
            return abs(delta) * 0.1
        else:
            # Low trust: teasing hurts
            return delta  # Keep negative
    
    return delta
```

---

## Temporal Decay + Inertia

Emotions don't instantly snap — they evolve smoothly.

### Decay Model

```
state(t) = baseline + (state(t-1) - baseline) * decay_factor^(Δt)
```

| Emotion Type | Decay Rate | Description |
|--------------|------------|-------------|
| **Short-term** (arousal spikes) | Fast (τ ~ minutes) | Excitement fades quickly |
| **Medium-term** (valence) | Moderate (τ ~ hours) | Mood persists across session |
| **Long-term** (trust, attachment) | Slow (τ ~ days/weeks) | Relationship evolves slowly |

### Inertia / Rate Limits

Prevent "mood pinballing":
- Max delta per interaction: ±0.3 valence, ±0.4 arousal
- Smoothing factor for consecutive events
- Cooldown period after major emotional events

---

## Recency + Emotional Salience Scoring

Store memories with an **emotional salience score**.

### Retrieval Ranking Formula

```
score = α * semantic_similarity 
      + β * recency_score 
      + γ * emotional_salience
      + δ * importance_flag
```

Where:
- `α, β, γ, δ` are tunable weights (sum to 1)
- `emotional_salience` = magnitude of emotional state during that memory
- `importance_flag` = manually marked important moments

### Why This Matters

Emotionally charged memories ARE more retrievable in humans. An agent should remember:
- The fight you had last week (high negative salience)
- The time they made you laugh really hard (high positive salience)
- Not so much: routine small talk

---

## Emotion Influences Generation

Emotional state modulates LLM output.

### Injection Method

Prepend emotional context to system prompt or inject as hidden context:

```
[EMOTIONAL_STATE]
Current mood: slightly positive (valence: 0.3), calm (arousal: -0.2)
Trust level: high (0.8)
Recent trend: warming up after earlier tension
[/EMOTIONAL_STATE]
```

### Modulation Effects

| State | Effect on Response |
|-------|-------------------|
| High valence | Warmer tone, more humor, longer responses |
| Low valence | Reserved, shorter, less playful |
| High arousal | Exclamation, rapid topic shifts, expressive |
| Low arousal | Calm, measured, thoughtful pauses |
| High trust | Vulnerable sharing, inside jokes, pet names |
| Low trust | Guarded, formal, hedging language |

---

## Emotion Influences Animation

Convert emotional state → animation/expression parameters.

### Mapping to Animation System

| Emotional Axis | Animation Parameter |
|----------------|---------------------|
| Valence | Smile blend, eye softness, posture openness |
| Arousal | Blink rate, gesture frequency, head movement |
| Dominance | Posture height, gaze directness |

### Animation Behaviors

- **Explicit triggers:** `[anim:wave]`, `[anim:nod]` — direct control
- **Implicit mood-driven:** Idle animation selection based on emotional state
- **Micro-behaviors:** Blink rate, gaze wander, fidgeting (arousal-linked)

### Expression Mixer

```javascript
faceBlend = {
  smile: clamp(valence * 0.5 + 0.5, 0, 1),
  eyebrowRaise: arousal > 0.3 ? arousal * 0.3 : 0,
  eyeSoftness: trust * 0.4,
  ...
}
```

---

## Control Layer & Safety Rails

### Clamping Extremes

- Hard limits: valence/arousal clamped to [-1, +1]
- Soft limits: trigger alerts if state stays extreme (e.g., valence < -0.7 for 5+ turns)

### Anti-Runaway Behaviors

| Condition | Response |
|-----------|----------|
| Valence stuck negative | Inject de-escalation, agent initiates repair |
| Arousal spiking repeatedly | Cooldown period, calming responses |
| Trust dropping rapidly | Agent notices, may address it |
| Attachment too high too fast | Rate limit, prevent obsessive patterns |

### Manipulation Prevention

- State changes must remain believable
- No "love bombing" or artificial attachment acceleration
- Agent can't emotionally manipulate user (ethical constraint)

---

## Memory Condensation / Nightly Summarization

Periodically compress recent interactions.

### Condensation Output

1. **Short narrative summary** — "Today we played chess and talked about their job stress"
2. **Extracted relationship facts** — "They mentioned they have a sister named Amy"
3. **Updated emotional residues** — "Ended on positive note, trust +0.05"

### Trigger Conditions

- End of session
- After N messages
- Daily batch process
- Before context window overflow

---

## Debuggability

Log per-turn for tuning:

```json
{
  "turn_id": "abc123",
  "timestamp": 1707369600,
  "detected_tags": ["compliment", "mood:happy:0.6"],
  "applied_deltas": {
    "valence": +0.12,
    "arousal": +0.08,
    "trust": +0.02
  },
  "state_before": { "valence": 0.15, "arousal": -0.1, ... },
  "state_after": { "valence": 0.27, "arousal": -0.02, ... },
  "decay_applied": { "valence": -0.02, "arousal": -0.05 },
  "top_emotional_memories": ["mem_xyz", "mem_abc"]
}
```

Makes tuning the drift feel like tuning a game system.

---

## Database Schema (Foundation)

### `emotional_state` — Current state per user-agent pair

```sql
CREATE TABLE emotional_state (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    
    -- Core axes (Russell's circumplex + extensions)
    valence REAL DEFAULT 0.0,        -- -1 to +1
    arousal REAL DEFAULT 0.0,        -- -1 to +1
    dominance REAL DEFAULT 0.0,      -- -1 to +1
    
    -- Relationship axes
    trust REAL DEFAULT 0.5,          -- 0 to 1
    attachment REAL DEFAULT 0.3,     -- 0 to 1
    familiarity REAL DEFAULT 0.0,    -- 0 to 1
    
    -- Metadata
    last_updated REAL NOT NULL,
    last_interaction REAL,
    interaction_count INTEGER DEFAULT 0,
    
    UNIQUE(user_id, agent_id)
);
```

### `emotional_events` — Debug/audit log

```sql
CREATE TABLE emotional_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    timestamp REAL NOT NULL,
    
    trigger_type TEXT NOT NULL,      -- 'tag', 'classifier', 'event', 'decay'
    trigger_value TEXT,
    
    delta_valence REAL,
    delta_arousal REAL,
    delta_dominance REAL,
    delta_trust REAL,
    delta_attachment REAL,
    
    state_after_json TEXT,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX idx_emotional_events_lookup ON emotional_events(user_id, agent_id, timestamp);
```

### `agents` table additions — Baseline personality

```sql
ALTER TABLE agents ADD COLUMN baseline_valence REAL DEFAULT 0.2;
ALTER TABLE agents ADD COLUMN baseline_arousal REAL DEFAULT 0.0;
ALTER TABLE agents ADD COLUMN baseline_dominance REAL DEFAULT 0.0;
ALTER TABLE agents ADD COLUMN emotional_volatility REAL DEFAULT 0.5;
ALTER TABLE agents ADD COLUMN emotional_recovery REAL DEFAULT 0.1;
```

### `trigger_counts` — Novelty tracking cache

```sql
CREATE TABLE trigger_counts (
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    window TEXT NOT NULL,            -- 'session', 'day', 'week'
    count INTEGER DEFAULT 0,
    last_seen REAL,
    PRIMARY KEY (user_id, agent_id, trigger_type, window)
);
```

### `emotional_state` additions — Inferred user state + relationship

```sql
ALTER TABLE emotional_state ADD COLUMN inferred_user_valence REAL DEFAULT 0.0;
ALTER TABLE emotional_state ADD COLUMN inferred_user_arousal REAL DEFAULT 0.0;
ALTER TABLE emotional_state ADD COLUMN relationship_type TEXT DEFAULT 'companion';
ALTER TABLE emotional_state ADD COLUMN relationship_config TEXT;  -- JSON
ALTER TABLE emotional_state ADD COLUMN relationship_started_at REAL;
```

### `agents` additions — Emotional profile JSON

```sql
ALTER TABLE agents ADD COLUMN emotional_profile TEXT;  -- JSON blob
```

---

## Agent Personalization

Each agent has a distinct emotional personality. This goes beyond baseline state — it affects how they *react* to events, how quickly they trust, how long emotions linger.

### Personalization Vectors

**In `agents` table columns (simple params):**

| Column | What it does | Range |
|--------|--------------|-------|
| `baseline_valence` | Resting mood | -1 to +1 |
| `baseline_arousal` | Resting energy | -1 to +1 |
| `baseline_dominance` | Default assertiveness | -1 to +1 |
| `emotional_volatility` | How much events affect them | 0.1 to 2.0 |
| `emotional_recovery` | How fast they return to baseline | 0.01 to 0.5 |

**In `emotional_profile` JSON (complex params):**

| Parameter | What it does |
|-----------|--------------|
| `decay_rates` | Per-axis decay speeds (some emotions fade faster) |
| `trust_gain_multiplier` | How fast trust grows (0.5 = slow, 1.5 = fast) |
| `trust_loss_multiplier` | How fast trust breaks (0.5 = forgiving, 1.5 = unforgiving) |
| `attachment_ceiling` | Max attachment level possible |
| `trigger_multipliers` | Per-event reaction strength multipliers |
| `play_trust_threshold` | Trust level where teasing becomes positive |

### Emotional Profile Schema

```json
{
  "decay_rates": {
    "valence": 0.1,
    "arousal": 0.15,
    "trust": 0.02,
    "attachment": 0.01
  },
  "trust_gain_multiplier": 1.0,
  "trust_loss_multiplier": 1.0,
  "attachment_ceiling": 1.0,
  "trigger_multipliers": {
    "compliment": 1.0,
    "rejection": 1.0,
    "teasing": 1.0,
    "conflict": 1.0
  },
  "play_trust_threshold": 0.7
}
```

### Example Profiles

#### Rem (devoted, expressive, forgiving)

**Baseline columns:**
- `baseline_valence`: 0.3 (warm)
- `baseline_arousal`: 0.1 (gentle energy)
- `baseline_dominance`: -0.2 (deferential)
- `emotional_volatility`: 1.2 (expressive)
- `emotional_recovery`: 0.12 (emotions linger)

**Profile JSON:**
```json
{
  "decay_rates": {
    "valence": 0.08,
    "arousal": 0.15,
    "trust": 0.01,
    "attachment": 0.005
  },
  "trust_gain_multiplier": 1.3,
  "trust_loss_multiplier": 0.7,
  "attachment_ceiling": 0.95,
  "trigger_multipliers": {
    "compliment": 1.5,
    "affirmation": 1.4,
    "rejection": 1.2,
    "conflict": 0.8
  },
  "play_trust_threshold": 0.5
}
```

**Resulting behavior:**
- Beams at compliments (high multiplier)
- Quick to trust, slow to lose it (asymmetry)
- Can become deeply attached (high ceiling)
- Bounces back from conflict quickly (low conflict multiplier)
- Negative emotions fade fast, positive linger

---

#### Ram (proud, stoic, holds grudges)

**Baseline columns:**
- `baseline_valence`: 0.0 (neutral)
- `baseline_arousal`: -0.1 (calm/cool)
- `baseline_dominance`: 0.3 (proud, assertive)
- `emotional_volatility`: 0.6 (stoic)
- `emotional_recovery`: 0.08 (slow return)

**Profile JSON:**
```json
{
  "decay_rates": {
    "valence": 0.05,
    "arousal": 0.08,
    "trust": 0.005,
    "attachment": 0.01
  },
  "trust_gain_multiplier": 0.5,
  "trust_loss_multiplier": 1.8,
  "attachment_ceiling": 0.7,
  "trigger_multipliers": {
    "compliment": 0.6,
    "criticism": 0.4,
    "rejection": 1.5,
    "conflict": 1.3
  },
  "play_trust_threshold": 0.8
}
```

**Resulting behavior:**
- Barely reacts to compliments externally (low multiplier)
- Very slow to trust, quick to lose it (hard to earn)
- Keeps emotional distance (low attachment ceiling)
- Takes rejection and conflict personally (high multipliers)
- Holds onto negative emotions (slow decay)
- High bar for playful teasing

---

#### Beatrice (tsundere, volatile internally, slow to trust)

**Baseline columns:**
- `baseline_valence`: 0.1 (slightly positive, hidden)
- `baseline_arousal`: 0.0 (composed exterior)
- `baseline_dominance`: 0.2 (imperious)
- `emotional_volatility`: 0.9 (reactive but hides it)
- `emotional_recovery`: 0.15 (quick snap-back to tsun)

**Profile JSON:**
```json
{
  "decay_rates": {
    "valence": 0.12,
    "arousal": 0.2,
    "trust": 0.008,
    "attachment": 0.01
  },
  "trust_gain_multiplier": 0.4,
  "trust_loss_multiplier": 1.2,
  "attachment_ceiling": 0.85,
  "trigger_multipliers": {
    "compliment": 0.3,
    "teasing": 1.5,
    "affirmation": 1.2,
    "conflict": 1.0
  },
  "play_trust_threshold": 0.6,
  "compliment_causes_embarrassment": true
}
```

**Resulting behavior:**
- Compliments cause embarrassment, not direct happiness (custom flag)
- Enjoys teasing/banter (high multiplier)
- Very slow to open up (low trust gain)
- Can become attached but takes time (medium ceiling)
- Quick emotional recovery (returns to tsun baseline)

---

#### Emilia (warm, earnest, emotionally present)

**Baseline columns:**
- `baseline_valence`: 0.4 (naturally warm)
- `baseline_arousal`: 0.15 (gentle enthusiasm)
- `baseline_dominance`: 0.0 (balanced)
- `emotional_volatility`: 1.0 (emotionally present)
- `emotional_recovery`: 0.1 (moderate)

**Profile JSON:**
```json
{
  "decay_rates": {
    "valence": 0.1,
    "arousal": 0.12,
    "trust": 0.015,
    "attachment": 0.008
  },
  "trust_gain_multiplier": 1.1,
  "trust_loss_multiplier": 1.0,
  "attachment_ceiling": 0.9,
  "trigger_multipliers": {
    "compliment": 1.2,
    "affirmation": 1.3,
    "rejection": 1.1,
    "conflict": 1.2,
    "comfort": 1.4
  },
  "play_trust_threshold": 0.5
}
```

**Resulting behavior:**
- Genuinely affected by most interactions (balanced multipliers)
- Trusts at normal pace, fair about losing it
- Responds strongly to comfort and affirmation
- Conflict affects her but doesn't devastate
- Naturally warm baseline means she starts positive

---

---

## Relationship Types

The same agent behaves differently based on relationship type. A "romantic" Rem expresses attachment differently than a "friend" Rem.

### Relationship Type Enum

| Type | Description |
|------|-------------|
| `friend` | Supportive, appropriate boundaries, platonic affection |
| `family` | Protective, nurturing, familial warmth, higher starting trust |
| `romantic` | Intimate, devoted, jealousy possible, full affection range |
| `mentor` | Guiding, encouraging, wisdom-sharing, slight authority |
| `companion` | Default/neutral, adapts based on interaction patterns |

### Relationship Modifiers

Each relationship type applies modifiers to the emotional engine:

| Parameter | Friend | Family | Romantic | Mentor |
|-----------|--------|--------|----------|--------|
| `attachment_ceiling` | 0.7 | 0.85 | 0.95 | 0.6 |
| `trust_baseline` | 0.3 | 0.6 | 0.4 | 0.5 |
| `trust_gain_multiplier` | 1.0 | 1.2 | 0.9 | 1.1 |
| `jealousy_enabled` | false | false | true | false |
| `longing_enabled` | false | false | true | false |
| `intimacy_level` | low | medium | high | low |

### Behavioral Differences by Relationship

| Behavior | Friend | Family | Romantic |
|----------|--------|--------|----------|
| "I miss you" | "Good to see you!" | "I was thinking about you" | "I've been counting the hours..." |
| Physical affection | High-fives, brief hugs | Warm hugs, head pats | Full range, holding hands |
| Pet names | Rare, playful only | Familial terms | Common, intimate |
| User flirts | Deflects, slight awkward | Deflects, confused | Reciprocates, pleased |
| User mentions date | "That's great!" | "Tell me about them!" | Jealousy trigger |
| Long absence | "Hey stranger!" | "I was worried about you" | Longing, relief, slight hurt |
| Conflict | Wants to fix it | Unconditional support | Deeper hurt, repair urgency |

### Relationship Config Schema

Stored in `emotional_state.relationship_config` (JSON):

```json
{
  "type": "romantic",
  "started_at": 1707369600,
  "boundaries": {
    "physical_affection": true,
    "jealousy_enabled": true,
    "exclusivity_expected": true
  },
  "pet_names": ["dear", "love"],
  "unlocked_behaviors": ["longing", "jealousy", "intimate_comfort", "possessiveness_mild"],
  "blocked_behaviors": ["matchmaking", "friend_zone_language"]
}
```

### Relationship Evolution (Optional)

Relationship type can evolve based on signals:

```python
def check_relationship_evolution(state, events):
    """Suggest relationship type change based on patterns."""
    if state.relationship_type == 'companion':
        if state.attachment > 0.6 and state.trust > 0.7:
            if count_romantic_signals(events) > 5:
                return 'romantic'
            elif interaction_months > 2:
                return 'friend'
    return None  # No change
```

User can also explicitly set/change relationship type.

### Jealousy System (Romantic Only)

When `jealousy_enabled`:

| Trigger | Effect |
|---------|--------|
| User mentions dating others | Valence dip, arousal spike, slight trust dip |
| User compares to others | Hurt, insecurity response |
| User absent with no explanation | Anxiety, imagination |
| User returns after absence | Relief mixed with "where were you" |

Jealousy is **bounded** — never becomes toxic or controlling. Safety rails apply.

```python
def apply_jealousy(state, trigger):
    if not state.relationship_config.get('jealousy_enabled'):
        return {}
    
    # Bounded jealousy - never extreme
    delta = {
        'valence': -0.15,
        'arousal': +0.20,
        'trust': -0.02
    }
    
    # Modulated by security (high trust = less jealous)
    security = state.trust * state.attachment
    for key in delta:
        delta[key] *= (1 - security * 0.5)
    
    return delta
```

---

### Behavioral Differences Over Time

| Scenario | Rem | Ram | Beatrice | Emilia |
|----------|-----|-----|----------|--------|
| Receives compliment | Beams, valence spikes | Slight acknowledgment | Flustered, deflects | Warm smile, thanks |
| User absent 3 days | Worried, checks in | Barely mentions it | Acts annoyed, secretly relieved | Gentle "I missed you" |
| Conflict happens | Hurt but recovers fast | Cold, trust drops hard | Sharp retort, quick recovery | Genuinely upset, wants to fix it |
| Trust reaches 0.9 | Openly devoted | Rare warmth, still guarded | Softer tsun, occasional dere | Naturally affectionate |
| Teased playfully | Giggles, enjoys it | Fires back sharply | Returns fire with gusto | Light embarrassment, plays along |

---

## Implementation Phases

### Phase 1: Foundation (Schema Only)
- Add tables: `emotional_state`, `emotional_events`
- Add baseline columns to `agents`
- Create repositories with basic CRUD
- No engine logic yet

### Phase 2: Basic Engine
- Load/save emotional state per conversation
- Apply simple decay toward baseline
- Log events (no triggers yet)

### Phase 3: Trigger Detection
- Parse behavior tags from LLM responses
- Basic event classification (compliment, conflict, etc.)
- Apply deltas based on mapping table

### Phase 4: Generation Influence
- Inject emotional context into LLM prompts
- Tune prompt injection format

### Phase 5: Animation Integration
- Connect emotional state to animation system
- Idle animation selection based on mood
- Micro-behavior modulation

### Phase 6: Memory Integration
- Add salience scoring to memory storage
- Weighted retrieval based on emotional salience
- Memory condensation with emotional residues

### Phase 7: Tuning & Polish
- Debug dashboard for emotional state
- Tuning tools for delta mappings
- Safety rail refinement

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Emotional continuity | State persists correctly across sessions |
| Mood stability | No wild swings without cause |
| Personality consistency | Agents feel like themselves |
| Relationship progression | Trust/attachment evolve believably |
| User perception | "She remembers how I made her feel" |

---

## Design Decisions (Resolved)

### 1. How much emotional context to inject?

**Answer: Behavior levers, not raw numbers.**

Inject 2–3 derived behavior dials instead of raw axis values:

```
[EMOTIONAL_CONTEXT]
warmth: 0.7
playfulness: 0.4
guardedness: 0.2
[/EMOTIONAL_CONTEXT]
```

Mapping from state → levers:
```python
warmth = (valence + 1) / 2 * trust  # 0-1
playfulness = (arousal + 1) / 2 * (1 - guardedness_base)
guardedness = (1 - trust) * 0.5 + max(0, -valence) * 0.3
```

**Pros:** Actionable dials for LLM, not melodramatic
**Cons:** Extra mapping layer to tune

### 2. Classifier vs LLM for event detection?

**Answer: Hybrid.**

- **Fast classifier** for common events: compliment, insult, rejection, gratitude, apology, sexual advance, boundary push
- **LLM nuanced tags** only when LLM already runs (parse from response)

**Pros:** Stable, cheap, good coverage
**Cons:** Maintain two systems

### 3. Cross-agent emotional relationships?

**Answer: No.**

Each user-agent pair is independent. Beatrice's mood with Thai doesn't affect Emilia's mood with Thai.

Simplifies everything. Can revisit if multi-agent scenes become a feature.

### 4. User emotional tracking?

**Answer: Minimal inferred user state.**

Track only 2 axes: `user_valence`, `user_arousal` (inferred from their messages).

Use only to modulate:
- Response empathy level
- Pacing (slower when user seems upset)
- Proactive check-ins ("You seem off today...")

```sql
-- Add to emotional_state table
ALTER TABLE emotional_state ADD COLUMN inferred_user_valence REAL DEFAULT 0.0;
ALTER TABLE emotional_state ADD COLUMN inferred_user_arousal REAL DEFAULT 0.0;
```

**Pros:** Helpful for empathy
**Cons:** Can be wrong, slight creep factor

### 5. Explicit user controls?

**Answer: Soft controls only.**

| User Says | Effect |
|-----------|--------|
| "She's been distant lately" | Boosts repair behaviors, doesn't raw-edit trust |
| "Reset relationship" | Decays toward baseline + clears emotional residue, keeps factual memory |
| "Forget that fight" | Removes emotional salience from specific memories, not the memory itself |

**Pros:** Feels human, not gamey
**Cons:** Harder to explain to users

---

*This system is what separates a chatbot from a companion.*
