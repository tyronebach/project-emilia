"""Workspace-backed events timeline helpers for Soul Window features."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(dt: datetime | None = None) -> str:
    return (dt or _utc_now()).isoformat()


def _parse_event_date(raw: Any) -> date | None:
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None

    # Prefer YYYY-MM-DD, fallback to full ISO datetime.
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        pass

    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _normalize_id(raw: Any) -> str:
    return str(raw or "").strip()


class WorkspaceEventsService:
    """Read/write event timelines in agent workspaces.

    File location:
      {workspace}/user_data/{user_id}/events.json
    """

    SCHEMA_VERSION = 1

    @staticmethod
    def events_path(workspace: Path, user_id: str) -> Path:
        return workspace / "user_data" / user_id / "events.json"

    @staticmethod
    def default_events(user_id: str, agent_id: str, now_utc: datetime | None = None) -> dict[str, Any]:
        now_iso = _iso_utc(now_utc)
        return {
            "schema_version": WorkspaceEventsService.SCHEMA_VERSION,
            "user_id": user_id,
            "agent_id": agent_id,
            "created_at": now_iso,
            "updated_at": now_iso,
            "milestones": [],
            "upcoming_events": [],
        }

    @staticmethod
    def _normalize_payload(payload: dict[str, Any], user_id: str, agent_id: str) -> dict[str, Any]:
        now_iso = _iso_utc()

        milestones = payload.get("milestones")
        if not isinstance(milestones, list):
            milestones = []

        upcoming = payload.get("upcoming_events")
        if not isinstance(upcoming, list):
            upcoming = []

        created_at = payload.get("created_at")
        if not isinstance(created_at, str) or not created_at.strip():
            created_at = now_iso

        return {
            "schema_version": WorkspaceEventsService.SCHEMA_VERSION,
            "user_id": user_id,
            "agent_id": agent_id,
            "created_at": created_at,
            "updated_at": payload.get("updated_at") if isinstance(payload.get("updated_at"), str) else now_iso,
            "milestones": milestones,
            "upcoming_events": upcoming,
        }

    @staticmethod
    def load_events(
        workspace: Path,
        user_id: str,
        agent_id: str,
        *,
        create_if_missing: bool = False,
    ) -> dict[str, Any]:
        path = WorkspaceEventsService.events_path(workspace, user_id)
        if not path.exists():
            events = WorkspaceEventsService.default_events(user_id, agent_id)
            if create_if_missing:
                WorkspaceEventsService.save_events(path, events)
            return events

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("events payload must be object")
        except Exception:
            payload = WorkspaceEventsService.default_events(user_id, agent_id)

        normalized = WorkspaceEventsService._normalize_payload(payload, user_id, agent_id)
        # Keep user/agent ownership aligned with route context.
        normalized["user_id"] = user_id
        normalized["agent_id"] = agent_id
        return normalized

    @staticmethod
    def save_events(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        encoded = json.dumps(payload, indent=2, sort_keys=True)
        tmp_path.write_text(encoded + "\n", encoding="utf-8")
        tmp_path.replace(path)

    @staticmethod
    def get_events(workspace: Path, user_id: str, agent_id: str) -> dict[str, Any]:
        return WorkspaceEventsService.load_events(workspace, user_id, agent_id, create_if_missing=False)

    @staticmethod
    def get_upcoming(
        workspace: Path,
        user_id: str,
        agent_id: str,
        *,
        days: int = 7,
        now_utc: datetime | None = None,
    ) -> list[dict[str, Any]]:
        events = WorkspaceEventsService.load_events(workspace, user_id, agent_id, create_if_missing=False)
        today = (now_utc or _utc_now()).date()
        upper = today + timedelta(days=max(0, days))

        rows: list[tuple[date, dict[str, Any]]] = []
        for item in events.get("upcoming_events", []):
            if not isinstance(item, dict):
                continue
            event_date = _parse_event_date(item.get("date"))
            if not event_date:
                continue
            if today <= event_date <= upper:
                rows.append((event_date, item))

        rows.sort(key=lambda x: x[0])
        return [item for _d, item in rows]

    @staticmethod
    def _find_by_id(items: list[dict[str, Any]], item_id: str) -> dict[str, Any] | None:
        for item in items:
            if isinstance(item, dict) and _normalize_id(item.get("id")) == item_id:
                return item
        return None

    @staticmethod
    def _touch(events: dict[str, Any]) -> None:
        events["updated_at"] = _iso_utc()

    @staticmethod
    def add_milestone(
        workspace: Path,
        user_id: str,
        agent_id: str,
        milestone: dict[str, Any],
    ) -> dict[str, Any]:
        events = WorkspaceEventsService.load_events(workspace, user_id, agent_id, create_if_missing=True)

        milestone_id = _normalize_id(milestone.get("id"))
        milestone_type = str(milestone.get("type") or "").strip()
        milestone_date = str(milestone.get("date") or "").strip()
        if not milestone_id or not milestone_type or not milestone_date:
            raise ValueError("milestone requires id, type, date")

        existing = WorkspaceEventsService._find_by_id(events["milestones"], milestone_id)
        if existing is None:
            item = {
                "id": milestone_id,
                "type": milestone_type,
                "date": milestone_date,
                "note": milestone.get("note"),
                "source": str(milestone.get("source") or "system"),
            }
            if "game" in milestone and milestone.get("game"):
                item["game"] = str(milestone.get("game"))
            events["milestones"].append(item)
            WorkspaceEventsService._touch(events)
            WorkspaceEventsService.save_events(WorkspaceEventsService.events_path(workspace, user_id), events)
        return events

    @staticmethod
    def add_event(
        workspace: Path,
        user_id: str,
        agent_id: str,
        event: dict[str, Any],
    ) -> dict[str, Any]:
        events = WorkspaceEventsService.load_events(workspace, user_id, agent_id, create_if_missing=True)

        event_id = _normalize_id(event.get("id"))
        event_type = str(event.get("type") or "").strip()
        event_date = str(event.get("date") or "").strip()
        if not event_id or not event_type or not event_date:
            raise ValueError("event requires id, type, date")

        existing = WorkspaceEventsService._find_by_id(events["upcoming_events"], event_id)
        if existing is None:
            events["upcoming_events"].append({
                "id": event_id,
                "type": event_type,
                "date": event_date,
                "note": event.get("note"),
                "source": str(event.get("source") or "user"),
            })
            WorkspaceEventsService._touch(events)
            WorkspaceEventsService.save_events(WorkspaceEventsService.events_path(workspace, user_id), events)
        return events

    @staticmethod
    def remove_item(workspace: Path, user_id: str, agent_id: str, item_id: str) -> dict[str, Any]:
        normalized_id = _normalize_id(item_id)
        if not normalized_id:
            raise ValueError("id is required")

        events = WorkspaceEventsService.load_events(workspace, user_id, agent_id, create_if_missing=True)
        before_m = len(events["milestones"])
        before_e = len(events["upcoming_events"])

        events["milestones"] = [
            item for item in events["milestones"]
            if not (isinstance(item, dict) and _normalize_id(item.get("id")) == normalized_id)
        ]
        events["upcoming_events"] = [
            item for item in events["upcoming_events"]
            if not (isinstance(item, dict) and _normalize_id(item.get("id")) == normalized_id)
        ]

        if len(events["milestones"]) != before_m or len(events["upcoming_events"]) != before_e:
            WorkspaceEventsService._touch(events)
            WorkspaceEventsService.save_events(WorkspaceEventsService.events_path(workspace, user_id), events)

        return events

    @staticmethod
    def ensure_auto_milestones(
        workspace: Path,
        user_id: str,
        agent_id: str,
        *,
        interaction_count: int,
        runtime_trigger: bool,
        game_id: str | None = None,
    ) -> None:
        now = _utc_now()
        today_str = now.date().isoformat()

        if not runtime_trigger and interaction_count == 1:
            WorkspaceEventsService.add_milestone(
                workspace,
                user_id,
                agent_id,
                {
                    "id": "first_conversation",
                    "type": "first_conversation",
                    "date": today_str,
                    "note": None,
                    "source": "system",
                },
            )

        for threshold in (100, 500):
            if interaction_count >= threshold:
                WorkspaceEventsService.add_milestone(
                    workspace,
                    user_id,
                    agent_id,
                    {
                        "id": f"interaction_{threshold}",
                        "type": f"interaction_{threshold}",
                        "date": today_str,
                        "note": None,
                        "source": "system",
                    },
                )

        if game_id:
            WorkspaceEventsService.add_milestone(
                workspace,
                user_id,
                agent_id,
                {
                    "id": "first_game",
                    "type": "first_game",
                    "date": today_str,
                    "note": None,
                    "game": game_id,
                    "source": "system",
                },
            )
