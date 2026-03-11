# Soul Window Backend Guide

Backend constraints for `backend/routers/soul_window.py`.

## What Exists

Routes:
- `GET /api/soul-window/mood`
- `GET /api/soul-window/bond`
- `GET /api/soul-window/about`
- `GET /api/soul-window/events`
- `POST /api/soul-window/events`

Supporting modules:
- `backend/services/soul_window_service.py`
- `backend/services/soul_parser.py`
- `backend/services/workspace_events.py`

## Hard Requirements

- Soul Window routes require auth plus `X-User-Id` and `X-Agent-Id`.
- The active user must be mapped to the agent.
- `OPENCLAW_GATEWAY_URL` must be configured; otherwise these routes return `503`.
- Event reads and writes require `agents.workspace`.

## File Contract

Workspace events path:

```text
{workspace}/user_data/{user_id}/events.json
```

Writes are atomic via temp-file replacement in `WorkspaceEventsService`.

## Related Runtime Behavior

- First-turn facts use `DEFAULT_TIMEZONE` with UTC fallback.
- Chat paths publish structured emotion snapshots separately; Soul Window should not parse free-text prompt blocks.
- Bond data comes from persistent relationship dimensions in `emotional_state`, not from the events file.

## Current Guardrails

- Keep filesystem event logic out of SQL repositories.
- Keep bond inference centralized in `soul_window_service.py`.
- Keep routers thin; access checks belong there, read-model composition does not.

<!-- TODO: Revalidate this guide if Soul Window is decoupled from OpenClaw in a future backend pass. -->
