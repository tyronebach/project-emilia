# Architecture Sanity Check

**Date:** 2026-02-08  
**Purpose:** Compare initial spec vs actual implementation, identify gaps & improvements

---

## Original Spec Summary (EMOTIONAL-ENGINE.md)

### Core Concepts
1. Event vs State separation
2. Persistent emotional state per user-agent
3. Baseline mood + bounded drift (homeostasis)
4. Volatility & recovery parameters
5. Valence/arousal core model + optional dominance/trust/attachment
6. Trust asymmetry (slow gain, fast loss)
7. Tag-to-impact mappings
8. Play context (teasing flips at high trust)
9. Temporal decay + inertia
10. Emotional salience scoring for memory
11. LLM prompt injection
12. Animation influence
13. Safety rails
14. Relationship types (friend/family/romantic/mentor/companion)
15. Debuggability

---

## Implementation Status

| Feature | Spec | Implemented | Notes |
|---------|------|-------------|-------|
| **Event vs State** | ✓ | ⚠️ Partial | We log events but state is stored directly, not recomputed from events |
| **Persistent per user-agent** | ✓ | ✅ | `emotional_state` table with user_id + agent_id |
| **Baseline + drift** | ✓ | ✅ | mood_baseline + decay toward baseline |
| **Volatility** | ✓ | ✅ | `emotional_volatility` multiplier |
| **Recovery** | ✓ | ✅ | `emotional_recovery` + `mood_decay_rate` |
| **Valence/Arousal** | ✓ | ✅ | Core axes implemented |
| **Dominance** | ✓ | ⚠️ | In dataclass but not actively used |
| **Trust** | ✓ | ✅ | With asymmetric gain/loss |
| **Attachment** | ✓ | ⚠️ | In dataclass, minimal use |
| **Familiarity** | ✓ | ⚠️ | In dataclass, increments but not used for decisions |
| **Trust asymmetry** | ✓ | ✅ | gain_multiplier / loss_multiplier |
| **Tag-to-impact** | ✓ | ✅ | DEFAULT_TRIGGER_DELTAS + trigger_mood_map |
| **Play context** | ✓ | ✅ | Teasing flips at high trust |
| **Decay + inertia** | ✓ | ⚠️ | Decay yes, inertia/rate limits not implemented |
| **Emotional salience** | ✓ | ❌ | Not implemented (memory scoring) |
| **LLM injection** | ✓ | ✅ | generate_context_block() with dominant moods |
| **Animation influence** | ✓ | ❌ | Not connected (avatar uses behavior tags) |
| **Safety rails** | ✓ | ⚠️ | Basic clamping, no runaway detection |
| **Relationship types** | ✓ | ✅ | friend/romantic with trigger_mood_maps |
| **Debug endpoints** | ✓ | ✅ | /api/debug/emotional-* |
| **16 moods (synthlove)** | New | ✅ | Hybrid architecture added |
| **Per-relationship mappings** | New | ✅ | trigger_mood_map per relationship |
| **LLM trigger detection** | New | ✅ | Optional, async |

---

## What We Did Well

### 1. Clean Data Model
- `EmotionalState` and `AgentProfile` dataclasses are well-structured
- Easy to extend, serialize, test

### 2. Hybrid Architecture
- Merged valence/arousal (scientific) with mood labels (intuitive)
- Best of both: computed values + human-readable moods

### 3. Config-driven
- Agent profiles in JSON
- Relationship mappings in JSON
- Easy to tune without code changes

### 4. Debug/Tune Infrastructure
- Debug endpoints for inspection
- Dialogue runner for testing
- Comparison script for trigger detection

### 5. Trust Asymmetry
- Correctly implemented slow gain, fast loss
- Per-agent multipliers

---

## Gaps & Improvements Needed

### 1. Event Sourcing (Partial)
**Spec:** "Never mutate state directly. Always emit event, recompute."  
**Current:** We mutate state and log events separately.  
**Risk:** Potential for state drift from events over time.  
**Fix:** Optional — current approach is simpler and works. Full event sourcing adds complexity.

### 2. Inertia / Rate Limits
**Spec:** Max delta per interaction ±0.3 valence, smoothing.  
**Current:** No rate limits, mood can swing wildly.  
**Fix:** Add max_delta_per_turn parameter, smooth consecutive events.

### 3. Emotional Salience for Memory
**Spec:** Score memories by emotional intensity for retrieval.  
**Current:** Not connected to memory system.  
**Fix:** When emilia-webapp has memory retrieval, add emotional salience scoring.

### 4. Animation Connection
**Spec:** Map emotional state → animation parameters.  
**Current:** Avatar uses behavior tags, not emotional state.  
**Fix:** Connect emotional state to idle animation selection, micro-behaviors.

### 5. Safety Rails
**Spec:** Alert if stuck in extreme state, anti-runaway behaviors.  
**Current:** Basic clamping only.  
**Fix:** Add threshold alerts, de-escalation triggers.

### 6. Dominance/Attachment Underused
**Spec:** Full use of all axes.  
**Current:** Dominance and attachment in schema but not affecting behavior.  
**Fix:** Wire into behavior levers or LLM context.

### 7. Trigger Detection Accuracy
**Test result:** Regex only 36.84% F1.  
**Issue:** Misses nuance, false positives on subtle messages.  
**Fix:** Hybrid approach — regex for obvious, LLM for ambiguous.

### 8. Novelty/Repetition Handling
**Spec:** Repeated triggers have diminished impact.  
**Current:** Not implemented.  
**Fix:** Add trigger_counts cache, apply novelty multiplier.

---

## Recommendations

### Short-term (Do Now)
1. ✅ LLM vs regex comparison (done)
2. Add max_delta_per_turn rate limit
3. Improve regex patterns for common misses

### Medium-term (Next Sprint)
1. Connect emotional state to avatar idle selection
2. Add novelty counter for repeated triggers
3. Implement Agent Designer frontend (MVP)

### Long-term (Later)
1. Full emotional salience for memory
2. Event sourcing (if needed for audit trail)
3. Multi-agent emotional relationships

---

## Architecture Verdict

**Overall: Solid foundation with room to grow.**

The core emotional engine works correctly. The hybrid mood system (16 moods + valence/arousal) is more expressive than the original spec. Main gaps are in edge cases (inertia, novelty, safety rails) and connections to other systems (memory, animation).

The design is clean enough that these can be added incrementally without major refactoring.

---

*Signed: Beatrice 💗*
