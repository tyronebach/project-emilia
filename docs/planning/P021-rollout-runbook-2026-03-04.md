# P021 Rollout Runbook (Canary + Validation)

Date: 2026-03-04
Scope: Backend realism features from P021

---

## 1) Rollout Order

1. Persona compaction (`COMPACTION_PERSONA_MODE=dm_only`) on small canary cohort.
2. Top-of-mind autorecall (strict threshold and char budget).
3. Dream v2 context blend and lived-experience cap increase.
4. Soft emotion re-anchor.
5. Optional auto-capture (off by default; gated experiment).

---

## 2) Canary Cohort

- Start with 1–3 DM-focused agents with active daily users.
- Exclude high-risk or production-critical agents from first pass.
- Keep group-room persona compaction off unless explicitly testing `all` mode.

---

## 3) Env Flags (Canary Baseline)

```env
COMPACTION_PERSONA_MODE=dm_only
MEMORY_AUTORECALL_ENABLED=1
MEMORY_AUTORECALL_SCORE_THRESHOLD=0.86
MEMORY_AUTORECALL_MAX_ITEMS=2
MEMORY_AUTORECALL_MAX_CHARS=420
MEMORY_AUTORECALL_RUNTIME_TRIGGER_ENABLED=0
DREAM_CONTEXT_MAX_MESSAGES=60
DREAM_INCLUDE_ROOM_SUMMARY=1
DREAM_INCLUDE_MEMORY_HITS=1
DREAM_MEMORY_HITS_MAX=3
DREAM_LIVED_EXPERIENCE_MAX_CHARS=2400
DREAM_NEGATIVE_EVENT_COOLDOWN_HOURS=12
EMOTION_SESSION_REANCHOR_MODE=soft
EMOTION_REANCHOR_ALPHA_SHORT_GAP=0.25
EMOTION_REANCHOR_ALPHA_LONG_GAP=0.60
EMOTION_REANCHOR_LONG_GAP_HOURS=24
MEMORY_AUTOCAPTURE_ENABLED=0
```

---

## 4) Health Gates (Daily)

- Latency: p95 chat latency increase <= 15% vs baseline.
- Prompt size: median prompt growth within configured expectations.
- Memory noise: no significant increase in repeated irrelevant recollections.
- Factual integrity: no increase in fabricated-memory incidents.
- Emotional stability: no runaway trust/intimacy drops after single incidents.

---

## 5) Log Signals to Monitor

- `[Metric] autorecall`:
  - `hit_count`, `injected_chars`, `agent_id`, `room_id`
- `[Metric] compaction`:
  - `mode`, `room_type`, `output_chars`, `texture_lines`
- `[Metric] dream`:
  - `message_count`, `used_summary`, `memory_hits`, `lived_chars`

---

## 6) Rollback Plan

Immediate rollback (safe defaults):

```env
COMPACTION_PERSONA_MODE=off
MEMORY_AUTORECALL_ENABLED=0
DREAM_INCLUDE_MEMORY_HITS=0
EMOTION_SESSION_REANCHOR_MODE=hard
MEMORY_AUTOCAPTURE_ENABLED=0
```

Notes:
- Schema additions are additive; no rollback migration needed.
- Existing summaries and dream logs remain readable.

---

## 7) Exit Criteria for Wider Rollout

- 7-day canary with no Sev-1 incidents.
- Continuity quality improves in transcript review rubric.
- No factual-recall regression beyond acceptable threshold.
- Team sign-off on defaults and rollback readiness.

---

## 8) Post-Rollout Follow-up

- Re-run longitudinal eval fixtures weekly.
- Review compaction style drift monthly.
- Revisit `MEMORY_AUTOCAPTURE_ENABLED` only after 2+ stable canary cycles.
