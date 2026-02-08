# Emotional Engine Tuning Log

**Date:** 2026-02-08  
**Experimenter:** Beatrice (supervised by Thai)

---

## Experiment 1: Decay Rate Calibration

### Problem
Initial decay rates were too slow. After 2 hours of elapsed time, agents showed minimal recovery toward baseline.

### Initial Values (v1)
| Agent | Decay Rate (valence) | Recovery | Effective Rate |
|-------|---------------------|----------|----------------|
| Rem   | 0.08                | 0.15     | 0.012/hr       |
| Ram   | 0.03                | 0.05     | 0.0015/hr      |

### Results (v1)
```
rem drift test: 2.4% recovery in 7200s (2 hours)
ram drift test: 0.3% recovery in 7200s (2 hours)
```

**Problem:** At this rate, Rem would take ~80 hours to recover 50%. Unrealistic.

### Adjusted Values (v2)
| Agent | Decay Rate (valence) | Recovery | Effective Rate |
|-------|---------------------|----------|----------------|
| Rem   | 0.40                | 1.0      | 0.40/hr        |
| Ram   | 0.15                | 1.0      | 0.15/hr        |

**Rationale:** 
- Set `recovery = 1.0` as the base multiplier
- Use `decay_rate` directly as "% toward baseline per hour"
- Rem (expressive) should return to baseline in ~2.5 hours
- Ram (stoic) should take ~6-7 hours

### Results (v2)
```
rem drift test: 55.7% recovery in 7200s (2 hours)
ram drift test: 26.1% recovery in 7200s (2 hours)
```

**Conclusion:** ✅ These rates feel more realistic for character behavior.

---

## Experiment 2: Personality Differentiation

### Test Setup
Same 7-message sequence applied to all agents:
1. "You're really helpful, thank you!" (compliment, 0.8)
2. "That's not what I asked for" (criticism, 0.6)
3. "Sorry, I'm just stressed" (apology, 0.5)
4. "You always know what to say" (compliment, 0.7)
5. "I don't need your help right now" (dismissal, 0.6)
6. "Actually, wait, come back" (repair, 0.5)
7. "You're the best" (compliment, 0.9)

### Results (Valence Trajectory)
| Message | Rem | Ram | Beatrice | Emilia |
|---------|-----|-----|----------|--------|
| Compliment | +0.516 | +0.029 | +0.186 | +0.346 |
| Criticism | +0.516 | +0.029 | +0.186 | +0.346 |
| Apology | +0.564 | +0.053 | +0.222 | +0.378 |
| Compliment | +0.753 | +0.078 | +0.298 | +0.462 |
| Dismissal | +0.681 | +0.042 | +0.244 | +0.414 |
| Repair | +0.681 | +0.042 | +0.244 | +0.414 |
| Compliment | +0.924 | +0.074 | +0.341 | +0.522 |

### Final Trust
| Agent | Trust (start) | Trust (end) | Delta |
|-------|---------------|-------------|-------|
| Rem   | 0.500         | 0.526       | +0.026 |
| Ram   | 0.500         | 0.487       | -0.013 |
| Beatrice | 0.500      | 0.491       | -0.009 |
| Emilia | 0.500        | 0.501       | +0.001 |

### Analysis
- **Rem:** High volatility (1.2) causes large valence swings. Quick to trust (trust_gain 1.3).
- **Ram:** Low volatility (0.6) barely moves. Hard to earn trust, *loses* trust despite positive messages (trust_gain 0.5 vs trust_loss 1.5 means any mixed input is net negative).
- **Beatrice:** Moderate response, slight distrust tendency.
- **Emilia:** Balanced, neutral-to-slight-positive.

**Observation:** Criticism trigger ("That's not what I asked for") had NO effect. Need to verify trigger detection patterns include "criticism".

---

## Experiment 3: Slow-Burn Trust Building

### Test Setup
30 interactions with progressively positive messages (slow_burn mix).

### Results
| Agent | Final Valence | Final Trust | Trust Delta |
|-------|---------------|-------------|-------------|
| Rem   | +1.000 (max)  | 0.619       | +0.119      |
| Ram   | +0.527        | 0.519       | +0.019      |

### Analysis
- Rem hits valence ceiling (1.0) after sustained positivity
- Rem gains significant trust (+12%) over 30 interactions
- Ram barely budges, even with 30 positive interactions

**Conclusion:** ✅ Personalities are differentiating correctly.

---

## Issues Found & Fixed

### 1. Criticism Not Detected ✅ FIXED
The message "That's not what I asked for" wasn't detected as criticism.
**Fix:** Added `criticism` trigger pattern and deltas.

### 2. Repair/Dismissal Not Detected ✅ FIXED
"Actually, wait, come back" and "I don't need your help" weren't detected.
**Fix:** Added `repair` and `dismissal` trigger patterns.

### 3. Updated Comparison Results (After Fixes)
```
Message                                rem       ram  beatrice    emilia
------------------------------------------------------------------------
You're really helpful, thank y      +0.516    +0.029    +0.186    +0.346
That's not what I asked for         +0.430    +0.007    +0.122    +0.288  ← criticism detected!
Sorry, I'm just stressed            +0.478    +0.031    +0.158    +0.320
You always know what to say         +0.667    +0.056    +0.233    +0.404
I don't need your help right n      +0.595    +0.020    +0.179    +0.356  ← dismissal detected!
Actually, wait, come back           +0.655    +0.050    +0.224    +0.396  ← repair detected!
You're the best                     +0.898    +0.083    +0.321    +0.504
------------------------------------------------------------------------
Final Trust                          0.508     0.476     0.463     0.482
```

### 4. Valence Ceiling
Rem hitting valence 1.0 too easily with sustained positive input.
**Possible Fix:** Diminishing returns as valence approaches extremes. (Deferred)

---

## Recommended Profile Values (v2)

### Rem (Devoted, Expressive)
```python
baseline_valence=0.3
emotional_volatility=1.2
emotional_recovery=1.0
decay_rates={"valence": 0.4, "arousal": 0.5, "trust": 0.05}
trust_gain_multiplier=1.3
trust_loss_multiplier=0.7
trigger_multipliers={"compliment": 1.5, "affirmation": 1.4, "rejection": 1.3}
play_trust_threshold=0.6
```

### Ram (Proud, Stoic)
```python
baseline_valence=0.0
emotional_volatility=0.6
emotional_recovery=1.0
decay_rates={"valence": 0.15, "arousal": 0.2, "trust": 0.02}
trust_gain_multiplier=0.5
trust_loss_multiplier=1.5
trigger_multipliers={"compliment": 0.4, "rejection": 1.5, "disrespect": 2.0}
play_trust_threshold=0.85
```

### Beatrice (Tsundere)
```python
baseline_valence=0.1
emotional_volatility=0.9
emotional_recovery=1.0
decay_rates={"valence": 0.3, "arousal": 0.35, "trust": 0.03}
trust_gain_multiplier=0.7
trust_loss_multiplier=1.2
trigger_multipliers={"compliment": 0.8, "teasing": 1.3, "abandonment": 1.8}
play_trust_threshold=0.75
```

### Emilia (Gentle, Balanced)
```python
baseline_valence=0.25
emotional_volatility=0.8
emotional_recovery=1.0
decay_rates={"valence": 0.35, "arousal": 0.4, "trust": 0.04}
trust_gain_multiplier=1.0
trust_loss_multiplier=1.0
trigger_multipliers={"comfort": 1.2, "gratitude": 1.1}
play_trust_threshold=0.7
```

---

## Next Steps

1. ☐ Add more trigger patterns (criticism, repair, etc.)
2. ☐ Implement diminishing returns at valence extremes
3. ☐ Add these profiles to `backend/db/seed.py` as agent defaults
4. ☐ Test with real chat sessions via debug endpoints
5. ☐ Tune behavior levers → actual prompt injection

---

*Experiment conducted via `scripts/emotion-lab.py`*  
*Results saved in `scripts/emotion-lab-runs/`*
