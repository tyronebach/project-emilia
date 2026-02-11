# P006 Soul Window - Developer Guide

Date: 2026-02-11  
Status: Implemented baseline (Phase 1-3 scope)  
Source plan: `docs/planning/P006-soul-window.md`

## Purpose

This guide is for future contributors extending Soul Window without regressing core architecture principles:

- simple
- robust
- extendable
- minimal maintenance

Use this with the canonical plan file, not instead of it.

## What Is Implemented

### Backend

- User-facing router:
  - `backend/routers/soul_window.py`
  - Endpoints:
    - `GET /api/soul-window/mood`
    - `GET /api/soul-window/bond`
    - `GET /api/soul-window/about`
    - `GET /api/soul-window/events`
    - `POST /api/soul-window/events`
- Router registration:
  - `backend/routers/__init__.py`
  - `backend/main.py`
- Read-model/service helpers:
  - `backend/services/soul_window_service.py`
  - `backend/services/soul_parser.py`
  - `backend/services/workspace_events.py`
- Chat integration:
  - first-turn context injection in `backend/routers/chat.py`
  - structured `emotion.snapshot` in SSE `event: emotion` and non-stream `emotion_debug`
  - workspace milestone auto-hook after successful message handling

### Frontend

- Types:
  - `frontend/src/types/soulWindow.ts`
- API wrappers:
  - `frontend/src/utils/soulWindowApi.ts`
- Mood snapshot wiring:
  - `EmotionDebug.snapshot` in `frontend/src/utils/api.ts`
  - `chatStore.currentMood` in `frontend/src/store/chatStore.ts`
  - SSE handling in `frontend/src/hooks/useChat.ts`
- UI:
  - `frontend/src/components/MoodIndicator.tsx`
  - `frontend/src/components/BondModal.tsx`
  - `frontend/src/components/AboutModal.tsx`
  - integrated in `frontend/src/components/Header.tsx` and `frontend/src/App.tsx`
- Initial message simplification:
  - `frontend/src/components/InitializingPage.tsx`

## Decision Log (Locked for this iteration)

These came from product decisions during plan refinement:

1. First interaction source: earliest message timestamp across user-agent sessions (`A`)
2. Timezone: UTC (`A`)
3. Relationship type: inferred heuristically from dimensions (`B`)
4. Greeting ownership: backend-first context + simplified frontend init prompt (`B`)
5. Events writes: user/admin API writes only, no agent-authored file writes (`A`)

If you change these, update both this guide and the canonical plan decision log.

## Contract Baselines

### Auth and identity

- All Soul Window routes require:
  - `Authorization: Bearer ...`
  - `X-User-Id`
  - `X-Agent-Id`
- Do not expose user identity by public path parameters for these routes.

### Mood contract

- Frontend must consume structured payload from:
  - SSE `event: emotion` -> `snapshot`
  - `GET /api/soul-window/mood`
- Frontend must not parse free-text `context_block` for product logic.

### Workspace file contract

- Events file path:
  - `{workspace}/user_data/{user_id}/events.json`
- `workspace` source of truth:
  - `agents.workspace` in DB
- Writes are atomic via temp file + replace.
- Items are idempotent by `id`.

### First-turn context contract

- Only non-runtime first conversational turn receives deterministic session facts.
- Facts are UTC and style-neutral.
- Avoid putting personality/tone instructions in this block.

## Architecture Guardrails

1. Keep workspace file logic out of SQL repositories.
2. Keep relationship dimensions canonical in DB (`emotional_state`), not in events file.
3. Keep read-model composition in service layer (`soul_window_service.py`), not routers.
4. Keep router logic thin: auth/access checks + service orchestration.
5. Keep frontend state split: live mood snapshot in Zustand (`chatStore.currentMood`) and modal data via API wrappers.

## Known Drift Risks and Mitigations

### Risk: Mood taxonomy divergence

- Symptom: frontend hard-codes mood IDs/emojis.
- Mitigation: continue deriving metadata from `moods` table in backend service.

### Risk: duplicate bond logic

- Symptom: new threshold/label logic appears in multiple routers/components.
- Mitigation: centralize relationship labels/inference in `soul_window_service.py`.

### Risk: identity inconsistencies

- Symptom: user IDs appear in query/path for user-facing Soul Window routes.
- Mitigation: enforce header/dependency pattern only.

### Risk: filesystem write fragility

- Symptom: partial/corrupt `events.json` on failure.
- Mitigation: preserve atomic write strategy and schema normalization.

## Extension Backlog (Recommended Next Steps)

1. Add dedicated backend tests for parser/events services:
   - `soul_parser` section parsing edge cases
   - `workspace_events` idempotency and date filtering
2. Add frontend component tests for:
   - `MoodIndicator`
   - `BondModal` and `AboutModal` loading/error states
3. Add optional pagination/filtering to `/api/soul-window/events` if event volume grows.
4. Add optional `include_raw` toggle control in About UI only if needed.
5. Add observability counters (request timings/errors) for Soul Window routes.

## Change Checklist for Future P006 Work

1. Update `docs/planning/P006-soul-window.md` when behavior or decisions change.
2. Update this guide with new contracts/guardrails.
3. Update `DOCUMENTATION.md` and relevant READMEs for user-visible architecture changes.
4. Run tests:
   - backend: `backend/.venv/bin/python -m pytest -q backend/tests`
   - frontend: `cd frontend && npm test && npm run lint && npm run build`

## Quick File Map

- Plan: `docs/planning/P006-soul-window.md`
- Router: `backend/routers/soul_window.py`
- Services:
  - `backend/services/soul_window_service.py`
  - `backend/services/workspace_events.py`
  - `backend/services/soul_parser.py`
- Chat integration: `backend/routers/chat.py`
- Frontend API/types:
  - `frontend/src/utils/soulWindowApi.ts`
  - `frontend/src/types/soulWindow.ts`
- Frontend UI:
  - `frontend/src/components/MoodIndicator.tsx`
  - `frontend/src/components/BondModal.tsx`
  - `frontend/src/components/AboutModal.tsx`
