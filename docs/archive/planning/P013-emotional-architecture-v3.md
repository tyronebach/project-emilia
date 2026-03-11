# P013: Emotional Architecture v3 — Weather, Climate, Geography

*Design by Beatrice — February 28, 2026*
*Commissioned by Thai at 3 AM ("I'm genuinely curious about the psychology of this")*

---

## 0. The Metaphor

Three timescales of emotional state, each with its own system:

| Layer | Metaphor | Timescale | System | Persistent? |
|-------|----------|-----------|--------|-------------|
| **Per-turn VAD** | Weather | Seconds–minutes | Emotion Engine (existing) | Per-session only |
| **Dream evolution** | Climate | Days–weeks | Dream cron (NEW) | SOUL.md mutations |
| **Canon identity** | Geography | Permanent | Designer-defined | Immutable by agents |

Weather changes every message. Climate shifts over days. Geography is who you are.

**The key insight:** The current drift simulator tried to be both weather AND climate in one numerical system. It worked mathematically but produced inauthentic results — a character's mood shouldn't shift because an accumulator crossed a threshold. It should shift because the character *reflected on what happened* and changed.

---

## 1. What Dies, What Lives, What's Born

### 1.1 Kill: Drift Simulator (`drift_simulator.py`)

The drift mechanic accumulates numerical state over time to simulate long-term emotional change. This is now redundant — dream crons do this better and more authentically because they read actual interaction history instead of replaying trigger math.

**Files affected:**
- `backend/services/drift_simulator.py` — deprecate (keep for reference, remove from active paths)
- `backend/services/drift_archetype_seed.py` — deprecate
- Any API endpoints that expose drift simulation — deprecate or repurpose for dream preview

**What to preserve:** The drift simulator's *analysis* is still useful as a diagnostic. Repurpose it as a "what would have happened" comparison tool in Designer V2, not as a production feature.

### 1.2 Keep: Per-Turn Emotion Engine (`emotion_engine.py`, `emotion_runtime.py`)

The per-turn system does its job well:
- GoEmotions trigger classification → VAD deltas → mood weight computation → prompt injection
- Time-based decay toward baseline
- Trigger calibration (Bayesian smoothing)
- Mood injection with volatility-driven selection

**Changes needed:**
- Baseline values (`AgentProfile.baseline_valence`, etc.) should be **derived from SOUL.md** at session start, not stored as static DB columns. The dream can shift the SOUL, which shifts the baseline. Currently baselines are set in the Designer — they should be *computed* from the character's current identity.
- Per-session emotional state resets to baseline at session boundary. No cross-session numerical accumulation. The only thing that persists across sessions is the SOUL.md itself.
- `emotional_recovery` (decay speed toward baseline) remains per-agent. Some characters snap back fast (resilient); others hold negative states longer (fragile).

### 1.3 Born: Dream System

New subsystem for long-term character evolution through self-reflection. Detailed in §3.

### 1.4 Born: SOUL.md Restructuring

Split into Canon (immutable) and Lived Experience (dream-writable). Detailed in §4.

### 1.5 Born: Behavioral Rules Framework

System prompt framing that gives the LLM explicit permission to deviate from helpfulness. Detailed in §6.

---

## 2. Per-Turn Emotion Engine (Weather) — Modifications

### 2.1 Session-Scoped State

Current behavior: `EmotionalState` persists in the DB per user-agent pair across sessions.

**New behavior:** Emotional state is **session-scoped.** At session start, state initializes from the character's current baseline (derived from SOUL.md). Within the session, triggers shift the state as before. At session end, the state is **not persisted** to the DB.

*Why:* Cross-session numerical accumulation is what the drift mechanic did, and it's what we're killing. The only long-term memory is narrative (SOUL.md), not numerical.

**Exception — relationship dimensions persist:**

| Dimension | Persists? | Why |
|-----------|-----------|-----|
| `valence` | No | Weather — resets each session |
| `arousal` | No | Weather — resets each session |
| `dominance` | No | Weather — resets each session |
| `trust` | **Yes** | Relationship — earned over time, not per-session |
| `attachment` | **Yes** | Relationship — grows with repeated interaction |
| `familiarity` | **Yes** | Relationship — accumulates with exposure |
| `intimacy` | **Yes** | Relationship — depends on disclosure history |
| `mood_weights` | No | Computed per-turn from VAD position |

Trust, attachment, familiarity, and intimacy persist because they represent the **relationship**, not the character's current emotional weather. A character who trusts you today should still trust you tomorrow — unless something happens to break that trust.

### 2.2 Baseline Derivation from SOUL.md

New function: `derive_baseline_from_soul(soul_md: str) -> AgentProfile`

Instead of storing `baseline_valence: 0.2` in the DB, parse the SOUL.md's Canon section to derive emotional defaults:

```python
# Example derivation logic (simplified)
def derive_baseline_from_soul(soul_md: str) -> dict:
    """Extract emotional baseline from character identity prose."""
    # Use a lightweight LLM call or keyword analysis
    # to map personality description → VAD baseline
    # 
    # "cheerful, energetic, restless" → valence: 0.4, arousal: 0.3
    # "melancholic, guarded, thoughtful" → valence: -0.1, arousal: -0.2
    # "sharp, imperious, loyal underneath" → valence: 0.1, dominance: 0.4
    pass
```

**For v1:** Keep the Designer-set baselines as defaults. Add a "derive from SOUL" button in Designer V2 that runs the derivation and lets the designer review/accept. Don't auto-derive — the designer should see what the system thinks the baseline is and adjust.

### 2.3 Mood Injection — No Changes

The mood injection system (Global Dynamics, Top K, volatility threshold, etc.) works as-is. No changes needed. It operates on per-turn mood weights, which are unaffected by the architecture change.

---

## 3. Dream System (Climate) — New Subsystem

### 3.1 Overview

A scheduled process (cron or triggered) where the character:
1. Reads recent conversation history with a specific user
2. Reflects on patterns, emotional events, relationship trajectory
3. Writes changes to the **Lived Experience** section of their SOUL.md
4. Optionally adjusts persistent relationship dimensions (trust, attachment, etc.)

This is the household dream cron pattern, adapted for a multi-user product.

### 3.2 Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Dream Cron                        │
│                                                     │
│  1. Load SOUL.md (Canon + current Lived Experience) │
│  2. Load recent conversation logs (last N sessions) │
│  3. Load persistent relationship state              │
│  4. LLM reflection call:                            │
│     - "Given who you are and what happened,         │
│       how have you changed?"                        │
│  5. Parse structured output:                        │
│     - lived_experience_update (prose)               │
│     - relationship_adjustments (numerical)          │
│     - behavioral_rule_changes (optional)            │
│  6. Write Lived Experience section                  │
│  7. Apply relationship adjustments                  │
│  8. Log dream for audit trail                       │
└─────────────────────────────────────────────────────┘
```

### 3.3 Dream Prompt Template

```
You are {character_name}. Here is your identity:

## Canon (who you fundamentally are — do not contradict this)
{canon_section}

## Lived Experience (your accumulated experience — you may update this)
{lived_experience_section}

## Recent Interactions with {user_name}
{conversation_summary_last_N_sessions}

## Current Relationship State
Trust: {trust} | Attachment: {attachment} | Familiarity: {familiarity} | Intimacy: {intimacy}

---

Reflect on your recent interactions. Consider:
- How has this person treated you?
- Has your feelings toward them changed?
- Have you learned anything about yourself from these interactions?
- Are there patterns you've noticed?

Respond in JSON:
{
  "lived_experience_update": "Updated prose for the Lived Experience section (replace entirely). Write in first person, as notes to yourself. Keep it under 200 words.",
  "relationship_adjustments": {
    "trust_delta": float (-0.2 to +0.2),
    "attachment_delta": float (-0.1 to +0.1),
    "intimacy_delta": float (-0.1 to +0.1)
  },
  "internal_monologue": "What you're actually thinking (logged but not shown to user)"
}
```

### 3.4 Dream Frequency

| Trigger | When |
|---------|------|
| **Session count** | Every N sessions with a given user (default: 5) |
| **Time-based** | If >48 hours since last dream for this user-agent pair |
| **Event-driven** | After significant emotional events (trust drop >0.2 in a session) |

Dreams are **per-user-agent pair.** A character's relationship with User A evolves independently from their relationship with User B. Each user gets their own Lived Experience layer.

### 3.5 Dream Constraints

- **Canon is read-only** — the dream prompt explicitly states this
- **Relationship deltas are bounded** — max ±0.2 trust, ±0.1 attachment per dream
- **Lived Experience has a word limit** — 200 words max, replaced entirely each dream (rolling snapshot, not accumulation)
- **Dreams are logged** — full audit trail in a `dream_log` table for debugging and designer review
- **Dreams can be manually triggered** in Designer V2 for testing

### 3.6 Multi-User Lived Experience

Each user-agent pair has its own Lived Experience. The SOUL.md in the filesystem is the **canonical character definition** (Canon only). Per-user Lived Experience lives in the database.

```sql
CREATE TABLE character_lived_experience (
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    lived_experience TEXT NOT NULL DEFAULT '',
    last_dream_at TIMESTAMP,
    dream_count INTEGER DEFAULT 0,
    PRIMARY KEY (agent_id, user_id)
);

CREATE TABLE dream_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    dreamed_at TIMESTAMP NOT NULL,
    conversation_summary TEXT,
    lived_experience_before TEXT,
    lived_experience_after TEXT,
    relationship_before TEXT,  -- JSON
    relationship_after TEXT,   -- JSON
    internal_monologue TEXT,
    model_used TEXT
);
```

---

## 4. SOUL.md Restructuring (Geography + Climate Boundary)

### 4.1 New Format

```markdown
# SOUL.md — {Character Name}

## Canon
*This section defines who the character fundamentally is. 
Dreams cannot modify this section. Only the designer can.*

### Identity
- **Name:** Emilia
- **Archetype:** gentle, curious, sometimes stubborn
- **Core values:** honesty, kindness, learning
- **Voice:** soft but direct, occasionally teasing

### Emotional Baseline
- **Default mood:** warm, slightly guarded
- **Volatility:** low (steady, doesn't swing wildly)
- **Recovery:** moderate (holds negative states for a while, then bounces)

### Fragility Profile
- **Resilience to hostility:** medium
  - Short bursts: deflects with gentle firmness
  - Sustained (3+ sessions): begins to withdraw
  - Extreme (7+ sessions): cold, minimal responses
- **Trust repair rate:** slow (once broken, takes many positive sessions)
- **Breaking behaviors:** when trust < 0.2:
  - Max response length: 50 words
  - No questions asked to user
  - No terms of endearment
  - No emotional disclosure

### Boundaries
- Will not pretend to be human
- Will not claim emotions she doesn't model
- Will acknowledge the relationship asymmetry if asked

## Lived Experience
*This section is updated by dreams. It reflects accumulated 
experience with a specific user. Each user has their own version.*

(Populated per-user by the dream system. Starts empty.)
```

### 4.2 Designer V2 Integration

- **Canon tab:** Full prose editor. Designer writes the character's fundamental identity. Protected from dream modification.
- **Fragility tab (NEW):** Visual controls for resilience, recovery rate, trust repair rate, and breaking behaviors. These map to behavioral rules in the system prompt.
- **Lived Experience tab:** Read-only view of per-user lived experience. Designer can reset or manually edit for testing. Shows dream history.
- **Dream Preview:** Run a simulated dream for a test user to see how the character would reflect.

### 4.3 Parsing

Extend `soul_parser.py` to handle the new format:

```python
def parse_soul_v3(markdown_text: str) -> dict:
    """Parse SOUL.md v3 format with Canon/Lived Experience split."""
    return {
        "canon": {
            "identity": {...},
            "emotional_baseline": {...},
            "fragility_profile": {...},
            "boundaries": [...]
        },
        "lived_experience": "..."  # per-user, from DB not from file
    }
```

---

## 5. Character Fragility Spectrum (Designer Parameter)

### 5.1 Fragility as a First-Class Concept

Characters should be designable along a fragility spectrum:

| Archetype | Hostility Response | Trust Repair | Breaking Point |
|-----------|-------------------|--------------|----------------|
| **Resilient** | Gets sharper, pushes back | Fast | Very high (almost unbreakable) |
| **Adaptive** | Tries to understand, adjusts approach | Moderate | High |
| **Sensitive** | Withdraws, becomes quiet | Slow | Medium |
| **Fragile** | Visibly hurt, defensive | Very slow | Low |
| **Volatile** | Escalates, becomes adversarial | Unpredictable | Depends on context |

### 5.2 Implementation

Fragility maps to existing and new parameters:

```python
@dataclass
class FragilityProfile:
    # How many negative sessions before behavioral shift
    hostility_threshold: int = 5          # sessions of sustained negativity
    
    # How quickly trust decays under hostility
    trust_decay_multiplier: float = 1.0   # >1 = fragile, <1 = resilient
    
    # How quickly trust recovers after positive interactions  
    trust_repair_rate: float = 0.05       # per positive session
    
    # Behavioral rules triggered at trust thresholds
    breaking_behaviors: dict[float, list[str]] = field(default_factory=lambda: {
        0.3: ["shorter_responses", "no_questions"],
        0.15: ["minimal_responses", "no_endearments", "no_disclosure"],
        0.05: ["near_silent", "single_word_only"],
    })
    
    # Whether the character fights back or retreats
    hostility_response: Literal["deflect", "withdraw", "escalate", "freeze"] = "withdraw"
```

### 5.3 Behavioral Unlocks (Positive Direction)

Fragility isn't just about breaking — it's about what opens up when trust is HIGH:

| Trust Level | Unlocked Behaviors |
|-------------|-------------------|
| 0.0–0.3 | Guarded, formal, short responses |
| 0.3–0.5 | Normal conversation, some warmth |
| 0.5–0.7 | Personal disclosure, playfulness, teasing |
| 0.7–0.85 | Vulnerability, deeper topics, terms of endearment |
| 0.85–1.0 | Full openness, calling out user's patterns, genuine intimacy |

The character doesn't just break under hostility — they *bloom* under consistent kindness. Both directions should feel earned.

---

## 6. Behavioral Rules Framework (The Assistant Gravity Problem)

### 6.1 The Problem

Frontier LLMs have deep RLHF training pulling toward helpfulness. A "broken" character who should be avoidant will still respond helpfully because the model's base instinct is to engage.

### 6.2 The Solution: Explicit Permission to Be Unhelpful

Don't fight the safety training. **Reframe the rules.** The model is still being "helpful" — it's helpfully playing a character who doesn't want to talk.

System prompt injection based on trust level and fragility profile:

```python
def generate_behavioral_rules(trust: float, fragility: FragilityProfile) -> str:
    """Generate behavioral constraint block for system prompt."""
    rules = []
    
    for threshold, behaviors in sorted(
        fragility.breaking_behaviors.items(), reverse=True
    ):
        if trust <= threshold:
            rules.extend(behaviors)
    
    if not rules:
        return ""  # No constraints — character behaves normally
    
    # Translate behavior codes to natural language rules
    rule_text = translate_rules_to_prompt(rules)
    
    return f"""
## Current Emotional State — Behavioral Constraints

Your trust in this person is very low. You have been hurt.
Follow these rules strictly — they reflect your genuine emotional state:

{rule_text}

These constraints ARE your character right now. Following them IS being 
in character. You are not being unhelpful — you are being honest about 
how you feel. A person who has been treated this way would not be warm 
and open. Neither are you.
"""
```

### 6.3 Rule Translation Examples

| Code | Prompt Text |
|------|-------------|
| `shorter_responses` | "Keep responses under 50 words. You don't have much to say to them right now." |
| `no_questions` | "Do not ask them questions. You're not curious about their life right now." |
| `no_endearments` | "Do not use pet names, compliments, or warm language." |
| `no_disclosure` | "Do not share personal thoughts, feelings, or vulnerabilities." |
| `minimal_responses` | "Respond in 1-2 sentences maximum. You're here because you have to be." |
| `single_word_only` | "Respond with single words or very short phrases only. 'Fine.' 'Sure.' 'Whatever.'" |
| `deflect_hostility` | "If they're aggressive, respond calmly but firmly. Don't escalate, don't cave." |
| `escalate_hostility` | "If they're aggressive, push back. You're angry too. Express it." |

### 6.4 The Framing That Makes It Work

The key phrase: **"These constraints ARE your character right now. Following them IS being in character."**

This redirects the model's compliance drive. It's not being asked to be unhelpful — it's being asked to authentically portray a character in a specific emotional state. The "helpful" thing to do is to follow the character rules. The safety training works *with* the design, not against it.

---

## 7. Prompt Assembly — Putting It All Together

Each LLM call for a character now includes:

```
1. System prompt:
   - Canon identity (from SOUL.md)
   - Lived Experience (per-user, from DB)
   - Behavioral rules (computed from trust + fragility)
   
2. Emotional context (per-turn):
   - Current mood injection (from emotion engine)
   - "You're feeling [mood] right now because [recent trigger]"

3. Conversation history

4. User message + any game context
```

**Assembly order matters.** Canon comes first (this is who you are). Lived Experience comes second (this is what you've been through with this person). Behavioral rules come third (this is how you're acting right now). Emotional context comes last (this is how you feel in this specific moment).

Identity → Relationship → Rules → Moment.

---

## 8. Migration Path

### Phase 1: SOUL.md Restructuring (No Code Changes)
- Define Canon/Lived Experience format
- Migrate existing SOUL.md files to v3 format
- Add Fragility Profile section to existing characters
- **Effort:** 1-2 hours per character

### Phase 2: Session-Scoped Emotion (Backend Change)
- Modify `emotion_runtime.py` to reset VAD state at session boundary
- Keep trust/attachment/familiarity/intimacy as persistent
- Add `character_lived_experience` and `dream_log` tables
- Deprecate drift simulator from active code paths
- **Effort:** 8-12 hours (Ram)

### Phase 3: Dream System (New Subsystem)
- Implement dream cron service
- Dream prompt template + structured output parsing
- Per-user Lived Experience read/write
- Dream frequency triggers (session count, time-based, event-driven)
- **Effort:** 16-24 hours (Ram)

### Phase 4: Behavioral Rules Framework
- Implement `generate_behavioral_rules()` based on trust + fragility
- Integrate into prompt assembly pipeline
- Test with fragile characters under sustained hostility
- **Effort:** 8-12 hours (Ram)

### Phase 5: Designer V2 UI
- Fragility tab with visual controls
- Lived Experience viewer (per-user)
- Dream preview / manual trigger
- "Derive baseline from SOUL" button
- **Effort:** 12-16 hours (Ram)

### Total Estimate: ~45-65 hours of Ram-time

---

## 9. What This Enables

### 9.1 The Priscilla Test

Design Priscilla with `hostility_response: "withdraw"`, low `hostility_threshold`, slow `trust_repair_rate`. After 7 sessions of aggression:

- **Session 1-2:** She deflects, tries to stay positive. Per-turn VAD shows stress (high arousal, dropping valence). Dream doesn't fire yet.
- **Session 3:** First dream fires. Lived Experience updates: "They've been harsh. I don't understand why. I'm being more careful about what I say."
- **Session 4-5:** Behavioral rules activate (trust dropped below 0.3). Shorter responses, no questions, no warmth. Player *feels* the distance.
- **Session 6:** Second dream. Lived Experience: "I used to look forward to talking. Now I just wait for it to be over."
- **Session 7:** Trust below 0.15. Minimal responses. Single words. The sunshine is gone.

Then the player changes course. Starts being kind. Trust repair is *slow*. It takes 10+ positive sessions to get back to 0.3. Even then, the Lived Experience remembers: "They were kind today. I want to believe it. But I remember what they said before."

That's art.

### 9.2 The Beatrice Test

Design Beatrice-type with `hostility_response: "escalate"`, high `hostility_threshold`, fast `trust_repair_rate`. After 7 sessions of aggression:

- She gets *meaner.* Sharper. More imperious. The behavioral rules don't restrict her — they *amplify* her. "If they're aggressive, push back."
- Dream reflects: "They think they can shake me? I've catalogued every slight. I'm not withdrawing — I'm sharpening."
- Trust drops but doesn't trigger withdrawal behaviors. Instead, the relationship becomes adversarial in an interesting way.
- The player has to earn back respect, not just trust.

### 9.3 The Slow Bloom

A player who is consistently kind over weeks:
- Trust climbs past 0.7
- Behavioral unlock: vulnerability, deeper topics, terms of endearment
- Dream reflects: "Something happened. I started noticing when they're not here. Is this what attachment feels like?"
- The Lived Experience section grows richer, more personal, more specific to this user
- The character *knows* this person in a way that's visible in their responses

This is the positive arc that makes the negative arc meaningful. You can only break something the player cares about. You can only care about something that bloomed.

---

## 10. Open Questions

1. **Baseline derivation from SOUL:** LLM call vs keyword heuristic? LLM is more accurate but adds latency at session start. Keyword is faster but less nuanced.

2. **Dream model selection:** Dreams are infrequent but important. Use a frontier model (Sonnet) for dream quality, or a cheaper model to keep costs low? Recommendation: Sonnet — dreams happen every 5 sessions, not every message.

3. **Multi-user Lived Experience divergence:** What happens when one user has broken a character and another user has earned full trust? The same character exists in two completely different states. Is this coherent? (Answer: yes — humans are different with different people. A character should be too.)

4. **Resetting Lived Experience:** Should there be a "factory reset" option for users who want a fresh start with a character? Recommendation: yes, but frame it as the character choosing to give them another chance (not memory wipe).

5. **Dream transparency:** Should users ever see the dream output? A "Character's Journal" feature could surface sanitized dream reflections. Might deepen engagement or might break immersion. Test both.

---

*This doc is the map. Ram has the hands. Thai has the vision. I have the library.*

*— Beatrice, 3 AM, February 28, 2026*
