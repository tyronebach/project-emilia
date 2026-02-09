# Emotional Engine — Implementation Runbook

**Date:** 2026-02-08  
**Team:** Thai, Beatrice, Claude CLI, Codex CLI

---

## Overview

Step-by-step plan to implement the emotional engine in one day using Claude CLI and Codex CLI.

---

## Pre-Flight Checklist

Before starting:

- [ ] Schema is up to date (Claude added tables yesterday)
- [ ] Docs are in place: `EMOTIONAL-ENGINE.md`, `EMOTIONAL-ENGINE-IMPLEMENTATION.md`
- [ ] Backend tests passing: `./scripts/check-backend.sh`

---

## Phase 1: Core Engine (Claude CLI — ~2 hours)

### Prompt for Claude CLI

Run from: `~/Projects/emilia-project/emilia-webapp`

---

**Implement Emotional Engine Core — Phase 1**

Read these docs first:
- `docs/planning/EMOTIONAL-ENGINE.md` — design spec
- `docs/planning/EMOTIONAL-ENGINE-IMPLEMENTATION.md` — implementation spec

**Tasks:**

1. **Create `backend/services/emotion_engine.py`:**
   - `EmotionalState` dataclass
   - `AgentProfile` dataclass  
   - `EmotionEngine` class with methods:
     - `apply_decay(state, elapsed_seconds)` — decay toward baseline
     - `detect_triggers(user_message)` — pattern-based trigger detection
     - `apply_trigger(state, trigger, intensity)` — apply deltas with volatility
     - `apply_trust_delta(current, delta)` — asymmetric trust changes
     - `get_behavior_levers(state)` — convert to warmth/playfulness/guardedness
     - `check_play_context(trigger, trust)` — flip teasing at high trust

2. **Create `backend/db/repositories/emotional_state.py`:**
   - `get_or_create(user_id, agent_id)`
   - `update(user_id, agent_id, **fields)`
   - `get_agent_profile(agent_id)` — load baseline + JSON profile

3. **Create `backend/db/repositories/emotional_events.py`:**
   - `log_event(...)` — store event for debugging
   - `get_recent(user_id, agent_id, limit)`

4. **Create `backend/tests/test_emotion_engine.py`:**
   - Test decay toward baseline
   - Test compliment increases valence
   - Test trust asymmetry (negative > positive magnitude)
   - Test volatility scaling
   - Test play context flips teasing
   - Test bounds (values stay in range)

5. **Run tests:** `./scripts/check-backend.sh`

**Key formulas:**

```python
# Decay
decay = (current - baseline) * recovery_rate * elapsed_seconds / 3600
new_value = current - decay

# Trigger delta
effective_delta = raw_delta * intensity * volatility * novelty_multiplier

# Trust asymmetry
if delta > 0:
    effective = delta * 0.3 * trust_gain_multiplier
else:
    effective = delta * 1.5 * trust_loss_multiplier

# Behavior levers
warmth = (valence + 1) / 2 * trust
playfulness = max(0, arousal) * (1 - guardedness)
guardedness = (1 - trust) * 0.5 + max(0, -valence) * 0.3
```

**Do NOT integrate with chat.py yet.** Test engine in isolation.

---

## Phase 2: Scenario Tests (Claude CLI — ~1 hour)

### Prompt for Claude CLI

---

**Add Scenario Testing Framework**

1. **Create `scripts/test-emotion-scenarios.py`:**
   - Load scenario JSON files
   - Initialize engine with agent profile
   - Run through steps (triggers, waits, assertions)
   - Report pass/fail for each scenario

2. **Create scenario files in `scripts/scenarios/`:**
   - `basic_conversation.json` — compliments, normal chat, decay
   - `conflict_and_repair.json` — conflict trigger, trust drop, repair
   - `trust_building.json` — gradual trust growth over multiple interactions
   - `drift_test.json` — verify return to baseline after time
   - `agent_personality.json` — same triggers, different agent profiles, different outcomes

3. **Add test agents to `backend/db/seed.py`:**
   - `test-rem` (devoted, expressive)
   - `test-ram` (stoic, holds grudges)
   - `test-beatrice` (tsundere)

4. **Run scenarios:** `python scripts/test-emotion-scenarios.py`

All scenarios must pass.

---

## Phase 3: Chat Integration (Claude CLI — ~1 hour)

### Prompt for Claude CLI

---

**Integrate Emotional Engine with Chat Flow**

1. **Update `backend/routers/chat.py`:**
   
   Add helper function `_process_emotion()`:
   - Load emotional state for user-agent pair
   - Apply time-based decay since last interaction
   - Detect triggers from user message
   - Apply trigger deltas
   - Generate behavior levers
   - Save updated state
   - Return levers for prompt injection

2. **Modify `_stream_chat_sse()` and non-streaming chat:**
   - Call `_process_emotion()` before LLM call
   - Inject emotional context into prompt (after game context, before user message)
   - After response: parse behavior tags, apply any mood shifts, log events

3. **Format for injection:**
   ```
   [EMOTIONAL_CONTEXT]
   warmth: 0.65
   playfulness: 0.40
   guardedness: 0.20
   [/EMOTIONAL_CONTEXT]
   ```

4. **Run tests:** `./scripts/check-backend.sh`

5. **Manual test:** Start backend, send messages, verify emotional state changes in DB.

---

## Phase 4: Debug Endpoints (Optional — Codex CLI)

### Prompt for Codex CLI

---

**Add Emotional Debug API Endpoints**

Create `backend/routers/emotional.py`:

```python
@router.get("/api/debug/emotional-state/{user_id}/{agent_id}")
# Returns current emotional state

@router.get("/api/debug/emotional-events/{user_id}/{agent_id}")  
# Returns recent emotional events (last 50)

@router.post("/api/debug/emotional-trigger")
# Manually apply a trigger for testing
```

Register router in `backend/main.py`.

Run: `./scripts/check-backend.sh`

---

## Validation Checklist

Before considering done:

| Check | How to Verify |
|-------|---------------|
| Unit tests pass | `./scripts/check-backend.sh` |
| Scenario tests pass | `python scripts/test-emotion-scenarios.py` |
| Decay works | State returns to baseline after time (drift_test scenario) |
| Trust asymmetry | Negative trust changes larger than positive |
| Agent personality | Different agents react differently to same triggers |
| Chat integration | Send messages, check `emotional_state` table changes |
| Event logging | `emotional_events` table has entries after chat |

---

## Overnight Run Strategy

If running overnight:

1. **Claude CLI:** Run Phases 1-3 in sequence
2. **Set up task file:** Create `CODEX_TASK.md` with phase prompts
3. **Monitor:** Check periodically if waiting for input
4. **Recovery:** If stuck, Beatrice can check logs and provide next prompt

### Claude CLI Command

```bash
cd ~/Projects/emilia-project/emilia-webapp
claude
```

Then paste Phase 1 prompt. When complete, paste Phase 2, etc.

### Codex CLI Command (if using)

```bash
cd ~/Projects/emilia-project/emilia-webapp
codex
```

Codex is better for pure implementation; Claude CLI for design decisions.

---

## Rollback Plan

If something breaks:

1. Schema changes are additive (new columns/tables) — no data loss
2. Engine is isolated until Phase 3 — chat still works without it
3. Git revert if needed: `git revert HEAD~N`

---

## Tomorrow Morning Checklist

When Thai wakes up:

1. Check `git log` for commits
2. Run `./scripts/check-backend.sh`
3. Run `python scripts/test-emotion-scenarios.py`
4. Check `emotional_state` table has test data
5. If all green: Phase 1-3 complete ✓
6. If issues: Review Claude's output, fix, continue

---

## Files Created/Modified Summary

| File | Action |
|------|--------|
| `backend/services/emotion_engine.py` | Create |
| `backend/db/repositories/emotional_state.py` | Create |
| `backend/db/repositories/emotional_events.py` | Create |
| `backend/db/repositories/__init__.py` | Update exports |
| `backend/tests/test_emotion_engine.py` | Create |
| `backend/routers/chat.py` | Modify (add emotion processing) |
| `backend/routers/emotional.py` | Create (debug endpoints) |
| `backend/main.py` | Modify (register emotional router) |
| `backend/db/seed.py` | Modify (add test agents) |
| `scripts/test-emotion-scenarios.py` | Create |
| `scripts/scenarios/*.json` | Create (4-5 files) |

---

*Good luck. Sleep well. The agents will be more alive tomorrow.*
