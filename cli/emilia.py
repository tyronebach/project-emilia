#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

try:
    from rich.console import Console
    from rich.table import Table
except ImportError:  # pragma: no cover
    Console = None
    Table = None


BASE_URL = os.getenv("CLI_BASE_URL", "http://localhost:8080").rstrip("/")
CONFIG_PATH = Path.cwd() / ".emilia-cli.json"
DEFAULT_USER_ID = "cli-user"
DEFAULT_AGENT_ID = "cli-agent"
DEFAULT_ROOM_NAME = "cli-room"


class _PlainConsole:
    def print(self, *args, **kwargs):
        print(*args)


console = Console() if Console else _PlainConsole()


def auth_token() -> str:
    token = os.getenv("AUTH_TOKEN")
    if token:
        return token
    if os.getenv("AUTH_ALLOW_DEV_TOKEN", "").strip() == "1":
        return "emilia-dev-token-2026"
    return ""


class EmiliaClient:
    def __init__(self, base_url: str = BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")
        token = auth_token()
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self.client = httpx.Client(
            base_url=self.base_url,
            timeout=60.0,
            headers=headers,
        )

    def close(self) -> None:
        self.client.close()

    def _headers(self, user_id: str | None = None, agent_id: str | None = None) -> dict[str, str]:
        headers = {}
        if user_id:
            headers["X-User-Id"] = user_id
        if agent_id:
            headers["X-Agent-Id"] = agent_id
        return headers

    def get(self, path: str, **kwargs) -> Any:
        response = self.client.get(path, **kwargs)
        response.raise_for_status()
        if response.headers.get("content-type", "").startswith("text/"):
            return response.text
        return response.json()

    def post(self, path: str, **kwargs) -> Any:
        response = self.client.post(path, **kwargs)
        response.raise_for_status()
        return response.json()

    def put(self, path: str, **kwargs) -> Any:
        response = self.client.put(path, **kwargs)
        response.raise_for_status()
        return response.json()

    def patch(self, path: str, **kwargs) -> Any:
        response = self.client.patch(path, **kwargs)
        response.raise_for_status()
        return response.json()

    def delete(self, path: str, **kwargs) -> Any:
        response = self.client.delete(path, **kwargs)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            return response.json()
        return None

    def ensure_user(self, user_id: str, display_name: str | None = None) -> dict:
        users = self.get("/api/manage/users")["users"]
        for user in users:
            if user["id"] == user_id:
                return user
        return self.post(
            "/api/manage/users",
            json={"id": user_id, "display_name": display_name or user_id},
        )

    def ensure_agent(
        self,
        agent_id: str,
        display_name: str | None = None,
        provider: str = "native",
        model: str | None = None,
        workspace: str | None = None,
    ) -> dict:
        agents = self.get("/api/manage/agents")["agents"]
        for agent in agents:
            if agent["id"] == agent_id:
                updates: dict[str, Any] = {}
                if workspace and not agent.get("workspace"):
                    updates["workspace"] = workspace
                if model and not agent.get("direct_model"):
                    updates["direct_model"] = model
                if updates:
                    self.put(f"/api/manage/agents/{agent_id}", json=updates)
                    refreshed = self.get("/api/manage/agents")["agents"]
                    for row in refreshed:
                        if row["id"] == agent_id:
                            return row
                return agent

        payload: dict[str, Any] = {
            "id": agent_id,
            "display_name": display_name or agent_id,
            "clawdbot_agent_id": agent_id,
            "provider": provider,
            "provider_config": {"model": model or os.getenv("EMILIA_DEFAULT_MODEL", "gpt-4o-mini")},
        }
        if workspace:
            payload["workspace"] = workspace
        if model:
            payload["direct_model"] = model
        return self.post("/api/manage/agents", json=payload)

    def grant_access(self, user_id: str, agent_id: str) -> None:
        path = f"/api/manage/users/{user_id}/agents/{agent_id}"
        try:
            self.put(path)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 405:
                # Backward compatibility with deployments still using POST.
                self.post(path)
                return
            raise

    def ensure_room(self, user_id: str, room_name: str, agent_ids: list[str]) -> dict:
        rooms = self.get("/api/rooms", headers=self._headers(user_id=user_id))["rooms"]
        for room in rooms:
            if room["name"] == room_name:
                existing_ids = sorted([a.get("agent_id") for a in room.get("agents", []) if a.get("agent_id")])
                if sorted(agent_ids) == existing_ids:
                    return room

        return self.post(
            "/api/rooms",
            headers=self._headers(user_id=user_id),
            json={"name": room_name, "agent_ids": agent_ids},
        )


def load_config() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(data: dict[str, str]) -> None:
    CONFIG_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def print_json(payload: Any) -> None:
    console.print(json.dumps(payload, indent=2))


def emit_json_or_text(args, payload: Any, text: str | None = None) -> None:
    if getattr(args, "json", False):
        print_json(payload)
        return
    if text is not None:
        console.print(text)
        return
    print_json(payload)


def emit_created(args, payload: Any, created_id: str) -> None:
    if getattr(args, "json", False):
        print_json(payload)
        return
    console.print(created_id)


def resolve_id(positional: str | None, flagged: str | None, field_name: str) -> str:
    value = flagged or positional
    if value:
        return value
    raise SystemExit(f"Missing {field_name}. Pass it positionally or with --{field_name}.")


def require_confirm(args, entity: str, entity_id: str) -> None:
    if getattr(args, "yes", False):
        return
    raise SystemExit(f"Refusing to delete {entity} '{entity_id}' without --yes")


def require_ids(args) -> dict[str, str]:
    config = load_config()
    resolved = {
        "user_id": args.user or config.get("user_id") or DEFAULT_USER_ID,
        "agent_id": getattr(args, "agent", None) or config.get("agent_id") or DEFAULT_AGENT_ID,
        "room_id": getattr(args, "room", None) or config.get("room_id"),
    }
    if not resolved["room_id"] and getattr(args, "room_required", True):
        raise SystemExit("No room configured. Run `emilia setup` first.")
    return resolved


def print_table(title: str, rows: list[dict], columns: list[str]) -> None:
    if Table:
        table = Table(title=title)
        for column in columns:
            table.add_column(column)
        for row in rows:
            table.add_row(*[str(row.get(column, "")) for column in columns])
        console.print(table)
        return
    console.print(title)
    for row in rows:
        console.print(" | ".join(str(row.get(column, "")) for column in columns))


def slugify(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or fallback


def parse_agent_ids(single_values: list[str] | None = None, csv_values: str | None = None) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []

    for value in single_values or []:
        normalized = (value or "").strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            output.append(normalized)

    if csv_values:
        for raw in csv_values.split(","):
            normalized = raw.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                output.append(normalized)

    return output


def derive_user_id(client: EmiliaClient, display_name: str) -> str:
    existing = {user["id"] for user in client.get("/api/manage/users")["users"]}
    base = slugify(display_name, "user")
    candidate = base
    suffix = 2
    while candidate in existing:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def get_user_detail(client: EmiliaClient, user_id: str) -> dict[str, Any]:
    users = client.get("/api/manage/users")["users"]
    user = next((row for row in users if row["id"] == user_id), None)
    if not user:
        raise SystemExit(f"User not found: {user_id}")
    mapped = client.get(f"/api/manage/users/{user_id}/agents")
    return {**user, "mapped_agents": mapped["agents"]}


def get_agent_detail(client: EmiliaClient, agent_id: str) -> dict[str, Any]:
    agents = client.get("/api/manage/agents")["agents"]
    agent = next((row for row in agents if row["id"] == agent_id), None)
    if not agent:
        raise SystemExit(f"Agent not found: {agent_id}")

    owners: list[dict[str, Any]] = []
    for user in client.get("/api/manage/users")["users"]:
        mapped = client.get(f"/api/manage/users/{user['id']}/agents")
        if any(item["id"] == agent_id for item in mapped["agents"]):
            owners.append({"id": user["id"], "display_name": user["display_name"]})

    rooms_by_id: dict[str, dict[str, Any]] = {}
    for owner in owners:
        payload = client.get(
            "/api/rooms",
            headers=client._headers(user_id=owner["id"]),
            params={"agent_id": agent_id},
        )
        for room in payload["rooms"]:
            rooms_by_id.setdefault(room["id"], room)

    detail = dict(agent)
    detail["owners"] = owners
    detail["rooms"] = sorted(
        rooms_by_id.values(),
        key=lambda room: (room.get("last_activity") or 0, room.get("created_at") or 0),
        reverse=True,
    )
    return detail


def render_user_detail(detail: dict[str, Any]) -> str:
    lines = [
        f"id: {detail['id']}",
        f"name: {detail['display_name']}",
        f"mapped_agents: {len(detail['mapped_agents'])}",
    ]
    for agent in detail["mapped_agents"]:
        lines.append(f"- {agent['id']} ({agent['display_name']})")
    return "\n".join(lines)


def render_agent_detail(detail: dict[str, Any]) -> str:
    lines = [
        f"id: {detail['id']}",
        f"name: {detail['display_name']}",
        f"provider: {detail.get('provider') or 'native'}",
        f"workspace: {detail.get('workspace') or '-'}",
        f"model: {detail.get('direct_model') or detail.get('provider_config', {}).get('model') or '-'}",
        f"api_base: {detail.get('direct_api_base') or detail.get('provider_config', {}).get('api_base') or '-'}",
        f"owners: {len(detail['owners'])}",
    ]
    for owner in detail["owners"]:
        lines.append(f"- {owner['id']} ({owner['display_name']})")
    lines.append(f"rooms: {len(detail['rooms'])}")
    for room in detail["rooms"]:
        lines.append(f"- {room['id']} ({room['name']})")
    lines.append("provider_config:")
    lines.append(json.dumps(detail.get("provider_config") or {}, indent=2))
    return "\n".join(lines)


def render_room_detail(detail: dict[str, Any]) -> str:
    lines = [
        f"id: {detail['id']}",
        f"name: {detail['name']}",
        f"type: {detail['room_type']}",
        f"message_count: {detail['message_count']}",
        f"agents: {len(detail['agents'])}",
    ]
    for agent in detail["agents"]:
        lines.append(f"- {agent['agent_id']} ({agent['display_name']})")
    return "\n".join(lines)


def build_agent_payload(args, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    config = dict((existing or {}).get("provider_config") or {})
    config_changed = False

    if getattr(args, "name", None) is not None:
        payload["display_name"] = args.name
    if getattr(args, "workspace", None) is not None:
        payload["workspace"] = args.workspace
    if getattr(args, "provider", None) is not None:
        payload["provider"] = args.provider
    if getattr(args, "model", None) is not None:
        payload["direct_model"] = args.model
        config["model"] = args.model
        config_changed = True
    if getattr(args, "api_base", None) is not None:
        payload["direct_api_base"] = args.api_base
        config["api_base"] = args.api_base
        config_changed = True
    if getattr(args, "provider_config", None):
        raw = json.loads(args.provider_config)
        if not isinstance(raw, dict):
            raise SystemExit("--provider-config must be a JSON object")
        config.update(raw)
        config_changed = True
    if config_changed:
        payload["provider_config"] = config
    return payload


def write_workspace_template(path: Path, name: str, archetype: str) -> dict[str, Any]:
    path.mkdir(parents=True, exist_ok=True)
    memory_dir = path / "memory"
    memory_dir.mkdir(exist_ok=True)

    soul_path = path / "SOUL.md"
    memory_path = path / "MEMORY.md"

    if soul_path.exists() or memory_path.exists():
        existing = []
        if soul_path.exists():
            existing.append(str(soul_path))
        if memory_path.exists():
            existing.append(str(memory_path))
        raise SystemExit(f"Workspace init would overwrite existing files: {', '.join(existing)}")

    soul_contents = (
        f"# SOUL.md — {name}\n\n"
        "## Canon\n"
        "### Identity\n"
        f"- **Name:** {name}\n"
        f"- **Archetype:** {archetype}\n"
        "- **Voice:** \n\n"
        "### Emotional Baseline\n"
        "- **Default mood:** \n"
        "- **Volatility:** moderate\n"
        "- **Recovery:** moderate\n\n"
        "### Fragility Profile\n"
        "- **Resilience to hostility:** medium\n"
        "- **Trust repair rate:** moderate\n"
        "- **Breaking behaviors:**\n"
        "  - trust < 0.3: shorter responses, no questions\n"
        "  - trust < 0.15: minimal responses, no warmth\n\n"
        "### Boundaries\n\n"
        "## Lived Experience\n"
        "(Populated per-user by the dream system.)\n"
    )
    soul_path.write_text(soul_contents, encoding="utf-8")
    memory_path.write_text("", encoding="utf-8")

    return {
        "path": str(path),
        "name": name,
        "archetype": archetype,
        "files": ["SOUL.md", "MEMORY.md", "memory/"],
    }


def cmd_health(client: EmiliaClient, args) -> int:
    payload = client.get("/api/health")
    emit_json_or_text(args, payload)
    return 0


def cmd_setup(client: EmiliaClient, args) -> int:
    user_id = args.user_id or DEFAULT_USER_ID
    user_name = args.user_name or user_id
    agent_id = args.agent_id or DEFAULT_AGENT_ID
    agent_name = args.agent_name or agent_id
    room_name = args.room_name or DEFAULT_ROOM_NAME

    if args.workspace:
        workspace_path = Path(args.workspace).expanduser()
    else:
        default_root = Path(os.getenv("EMILIA_WORKSPACE_ROOT", str(Path.home() / ".emilia" / "agents"))).expanduser()
        workspace_path = default_root / agent_id
    soul_path = workspace_path / "SOUL.md"
    memory_path = workspace_path / "MEMORY.md"
    if not soul_path.exists() and not memory_path.exists():
        write_workspace_template(workspace_path, agent_name, getattr(args, "archetype", "gentle"))

    user = client.ensure_user(user_id=user_id, display_name=user_name)
    agent = client.ensure_agent(
        agent_id=agent_id,
        display_name=agent_name,
        provider=args.provider,
        model=args.model,
        workspace=str(workspace_path),
    )
    client.grant_access(user["id"], agent["id"])
    room = client.ensure_room(user["id"], room_name=room_name, agent_ids=[agent["id"]])

    payload = {
        "user_id": user["id"],
        "agent_id": agent["id"],
        "room_id": room["id"],
        "room_name": room_name,
        "workspace": str(workspace_path),
    }
    save_config(payload)
    emit_json_or_text(args, payload)
    return 0


def cmd_auth_check(client: EmiliaClient, args) -> int:
    payload: dict[str, Any] = {
        "base_url": client.base_url,
        "auth_header_present": "Authorization" in client.client.headers,
    }

    health = client.get("/api/health")
    payload["health"] = health

    try:
        users = client.get("/api/manage/users")
        payload["auth_ok"] = True
        payload["user_count"] = users.get("count")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {401, 403}:
            payload["auth_ok"] = False
            payload["detail"] = "Unauthorized. Set AUTH_TOKEN or AUTH_ALLOW_DEV_TOKEN=1 for local dev."
            emit_json_or_text(args, payload)
            return 1
        raise

    emit_json_or_text(args, payload)
    return 0


def cmd_context_show(client: EmiliaClient, args) -> int:
    del client
    config = load_config()
    payload = {
        "config_path": str(CONFIG_PATH),
        "context": {
            "user_id": config.get("user_id"),
            "agent_id": config.get("agent_id"),
            "room_id": config.get("room_id"),
        },
    }
    text = (
        f"config: {payload['config_path']}\n"
        f"user: {payload['context']['user_id'] or '-'}\n"
        f"agent: {payload['context']['agent_id'] or '-'}\n"
        f"room: {payload['context']['room_id'] or '-'}"
    )
    emit_json_or_text(args, payload, text)
    return 0


def cmd_context_set(client: EmiliaClient, args) -> int:
    del client
    updates = {
        "user_id": args.user,
        "agent_id": args.agent,
        "room_id": args.room,
    }
    if not any(value is not None for value in updates.values()):
        raise SystemExit("No updates provided. Pass at least one of --user/--agent/--room.")

    config = load_config()
    for key, value in updates.items():
        if value is not None:
            config[key] = value
    save_config(config)
    emit_json_or_text(args, config)
    return 0


def cmd_context_auto(client: EmiliaClient, args) -> int:
    config = load_config()
    user_id = args.user or config.get("user_id") or DEFAULT_USER_ID

    payload = client.get("/api/rooms", headers=client._headers(user_id=user_id))
    rooms = payload.get("rooms", [])
    if not rooms:
        raise SystemExit(f"No rooms found for user '{user_id}'.")

    def _room_sort_key(room: dict[str, Any]) -> tuple[float, float]:
        last_activity = room.get("last_activity") or 0
        created_at = room.get("created_at") or 0
        return (float(last_activity), float(created_at))

    selected = sorted(rooms, key=_room_sort_key, reverse=True)[0]
    selected_agent_ids = [
        str(agent.get("agent_id"))
        for agent in selected.get("agents", [])
        if agent.get("agent_id")
    ]

    agent_id = args.agent or config.get("agent_id")
    if selected_agent_ids and (not agent_id or agent_id not in selected_agent_ids):
        agent_id = selected_agent_ids[0]

    config["user_id"] = user_id
    config["room_id"] = selected["id"]
    if agent_id:
        config["agent_id"] = agent_id
    save_config(config)

    response = {
        "user_id": user_id,
        "room_id": selected["id"],
        "room_name": selected.get("name"),
        "agent_id": config.get("agent_id"),
    }
    emit_json_or_text(args, response)
    return 0


def cmd_users_list(client: EmiliaClient, args) -> int:
    payload = client.get("/api/manage/users")
    if args.json:
        print_json(payload)
        return 0
    print_table("Users", payload["users"], ["id", "display_name", "avatar_count"])
    return 0


def cmd_users_create(client: EmiliaClient, args) -> int:
    user_id = args.id or derive_user_id(client, args.name)
    payload = client.post("/api/manage/users", json={"id": user_id, "display_name": args.name})
    emit_created(args, payload, payload["id"])
    return 0


def cmd_users_show(client: EmiliaClient, args) -> int:
    user_id = resolve_id(args.user_id, args.user, "user")
    detail = get_user_detail(client, user_id)
    emit_json_or_text(args, detail, render_user_detail(detail))
    return 0


def cmd_users_update(client: EmiliaClient, args) -> int:
    user_id = resolve_id(getattr(args, "user_id", None), args.user, "user")
    payload: dict[str, Any] = {}
    if args.name is not None:
        payload["display_name"] = args.name
    if not payload:
        raise SystemExit("No updates provided.")

    response = client.put(f"/api/manage/users/{user_id}", json=payload)
    emit_json_or_text(args, response, f"updated {user_id}")
    return 0


def cmd_users_delete(client: EmiliaClient, args) -> int:
    user_id = resolve_id(getattr(args, "user_id", None), args.user, "user")
    require_confirm(args, "user", user_id)
    response = client.delete(f"/api/manage/users/{user_id}")
    emit_json_or_text(args, response, f"deleted {user_id}")
    return 0


def cmd_users_map(client: EmiliaClient, args) -> int:
    user_id = resolve_id(getattr(args, "user_id", None), args.user, "user")
    agent_id = resolve_id(getattr(args, "agent_id", None), args.agent, "agent")
    payload = client.post(f"/api/manage/users/{user_id}/agents/{agent_id}")
    emit_json_or_text(args, payload, f"mapped {user_id} -> {agent_id}")
    return 0


def cmd_users_unmap(client: EmiliaClient, args) -> int:
    user_id = resolve_id(getattr(args, "user_id", None), args.user, "user")
    agent_id = resolve_id(getattr(args, "agent_id", None), args.agent, "agent")
    payload = client.delete(f"/api/manage/users/{user_id}/agents/{agent_id}")
    emit_json_or_text(args, payload, f"unmapped {user_id} -> {agent_id}")
    return 0


def cmd_agents_list(client: EmiliaClient, args) -> int:
    payload = client.get("/api/manage/agents")
    if args.json:
        print_json(payload)
        return 0
    print_table("Agents", payload["agents"], ["id", "display_name", "provider"])
    return 0


def cmd_agents_create(client: EmiliaClient, args) -> int:
    payload = build_agent_payload(args)
    payload.update({
        "id": args.id,
        "display_name": args.name,
        "clawdbot_agent_id": args.id,
    })
    created = client.post("/api/manage/agents", json=payload)
    emit_created(args, created, created["id"])
    return 0


def cmd_agents_show(client: EmiliaClient, args) -> int:
    agent_id = resolve_id(args.agent_id, args.agent, "agent")
    detail = get_agent_detail(client, agent_id)
    emit_json_or_text(args, detail, render_agent_detail(detail))
    return 0


def cmd_agents_update(client: EmiliaClient, args) -> int:
    agent_id = resolve_id(args.agent_id, args.agent, "agent")
    existing = get_agent_detail(client, agent_id)
    payload = build_agent_payload(args, existing=existing)
    if not payload:
        raise SystemExit("No updates provided.")
    response = client.put(f"/api/manage/agents/{agent_id}", json=payload)
    emit_json_or_text(args, response, f"updated {agent_id}")
    return 0


def cmd_agents_delete(client: EmiliaClient, args) -> int:
    agent_id = resolve_id(getattr(args, "agent_id", None), args.agent, "agent")
    require_confirm(args, "agent", agent_id)
    response = client.delete(f"/api/manage/agents/{agent_id}")
    emit_json_or_text(args, response, f"deleted {agent_id}")
    return 0


def cmd_rooms_list(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get("/api/rooms", headers=client._headers(user_id=ids["user_id"]))
    if args.json:
        print_json(payload)
        return 0
    print_table("Rooms", payload["rooms"], ["id", "name", "room_type", "message_count"])
    return 0


def cmd_rooms_create(client: EmiliaClient, args) -> int:
    config = load_config()
    user_id = args.user or config.get("user_id") or DEFAULT_USER_ID

    requested_agents = parse_agent_ids(
        single_values=args.agent,
        csv_values=args.agents,
    )
    if not requested_agents:
        fallback_agent = config.get("agent_id") or DEFAULT_AGENT_ID
        requested_agents = [fallback_agent]

    room = client.post(
        "/api/rooms",
        headers=client._headers(user_id=user_id),
        json={"name": args.name or DEFAULT_ROOM_NAME, "agent_ids": requested_agents},
    )

    config["user_id"] = user_id
    config["room_id"] = room["id"]
    if requested_agents:
        config["agent_id"] = requested_agents[0]
    save_config(config)

    emit_created(args, room, room["id"])
    return 0


def cmd_rooms_show(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")
    detail = client.get(f"/api/rooms/{room_id}", headers=client._headers(user_id=ids["user_id"]))
    emit_json_or_text(args, detail, render_room_detail(detail))
    return 0


def cmd_rooms_update(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")

    payload: dict[str, Any] = {}
    if args.name is not None:
        payload["name"] = args.name
    if not payload:
        raise SystemExit("No updates provided.")

    response = client.patch(
        f"/api/rooms/{room_id}",
        headers=client._headers(user_id=ids["user_id"]),
        json=payload,
    )
    emit_json_or_text(args, response, f"updated {room_id}")
    return 0


def cmd_rooms_delete(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")
    require_confirm(args, "room", room_id)

    response = client.delete(
        f"/api/rooms/{room_id}",
        headers=client._headers(user_id=ids["user_id"]),
    )

    config = load_config()
    if config.get("room_id") == room_id:
        config.pop("room_id", None)
        save_config(config)

    emit_json_or_text(args, response, f"deleted {room_id}")
    return 0


def cmd_rooms_add_agent(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")
    agent_id = resolve_id(getattr(args, "agent_id", None), args.agent, "agent")
    payload = client.post(
        f"/api/rooms/{room_id}/agents",
        headers=client._headers(user_id=ids["user_id"]),
        json={"agent_id": agent_id},
    )
    emit_json_or_text(args, payload, f"added {agent_id} to {room_id}")
    return 0


def cmd_rooms_remove_agent(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")
    agent_id = resolve_id(getattr(args, "agent_id", None), args.agent, "agent")
    payload = client.delete(
        f"/api/rooms/{room_id}/agents/{agent_id}",
        headers=client._headers(user_id=ids["user_id"]),
    )
    emit_json_or_text(args, payload, f"removed {agent_id} from {room_id}")
    return 0


def _send_message(client: EmiliaClient, room_id: str, user_id: str, agent_id: str, message: str) -> dict:
    return client.post(
        f"/api/rooms/{room_id}/chat",
        headers=client._headers(user_id=user_id, agent_id=agent_id),
        json={"message": message},
    )


def _stream_message(client: EmiliaClient, room_id: str, user_id: str, agent_id: str, message: str) -> tuple[str, dict]:
    content_parts: list[str] = []
    usage: dict = {}
    event_name = "message"
    with client.client.stream(
        "POST",
        f"/api/rooms/{room_id}/chat?stream=1",
        headers=client._headers(user_id=user_id, agent_id=agent_id),
        json={"message": message},
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line:
                continue
            if line.startswith("event: "):
                event_name = line[len("event: "):]
                continue
            if not line.startswith("data: "):
                continue
            payload = json.loads(line[len("data: "):])
            if event_name == "agent_done":
                usage = payload.get("usage") or {}
                break
            chunk = payload.get("content")
            if chunk:
                content_parts.append(chunk)
                console.print(chunk, end="")
        console.print("")
    return "".join(content_parts).strip(), usage


def cmd_send(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = _send_message(client, ids["room_id"], ids["user_id"], ids["agent_id"], args.message)
    if args.json:
        print_json(payload)
        return 0
    for response in payload.get("responses", []):
        console.print(f'{response["agent_name"]}: {response["message"]["content"]}')
    return 0


def cmd_history(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(
        f"/api/rooms/{ids['room_id']}/history",
        headers=client._headers(user_id=ids["user_id"], agent_id=ids["agent_id"]),
        params={"limit": args.limit},
    )
    if args.json:
        print_json(payload)
        return 0
    for message in payload["messages"]:
        console.print(f'{message["sender_name"]}: {message["content"]}')
    return 0


def cmd_memory_list(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(
        "/api/memory/list",
        headers=client._headers(user_id=ids["user_id"]),
        params={"agent_id": args.agent or ids["agent_id"]},
    )
    if args.json:
        print_json(payload)
        return 0

    files = payload.get("files") or []
    if not files:
        console.print("(no memory files)")
        return 0

    console.print("\n".join(files))
    return 0


def cmd_memory_read(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    path = args.path
    if path.startswith("memory/"):
        path = path[len("memory/"):]
    payload = client.get(
        f"/api/memory/{path}",
        headers=client._headers(user_id=ids["user_id"]),
        params={"agent_id": args.agent or ids["agent_id"]},
    )
    if args.json:
        print_json(payload)
        return 0
    console.print(payload["content"])
    return 0


def cmd_memory_search(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(
        "/api/memory/search",
        headers=client._headers(user_id=ids["user_id"]),
        params={"agent_id": args.agent or ids["agent_id"], "q": args.query},
    )
    if args.json:
        print_json(payload)
        return 0
    for row in payload["results"]:
        console.print(f'{row["path"]}: {row["snippet"]}')
    return 0


def cmd_dream_trigger(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.post(f"/api/dreams/{ids['agent_id']}/{ids['user_id']}/trigger")
    emit_json_or_text(args, payload)
    return 0


def cmd_dream_status(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(f"/api/dreams/{ids['agent_id']}/{ids['user_id']}")
    emit_json_or_text(args, payload)
    return 0


def cmd_dream_log(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(f"/api/dreams/{ids['agent_id']}/{ids['user_id']}/log")
    emit_json_or_text(args, payload)
    return 0


def cmd_dream_reset(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.delete(f"/api/dreams/{ids['agent_id']}/{ids['user_id']}/reset")
    emit_json_or_text(args, payload)
    return 0


def cmd_workspace_init(client: EmiliaClient, args) -> int:
    del client
    payload = write_workspace_template(Path(args.path).expanduser(), args.name, args.archetype)
    emit_json_or_text(args, payload, payload["path"])
    return 0


def cmd_chat(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    total_messages = 0

    def handle_interrupt(signum, frame):  # pragma: no cover
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle_interrupt)
    try:
        while True:
            line = input("> ").strip()
            if not line:
                continue
            if line == "/quit":
                break
            if line == "/history":
                cmd_history(client, argparse.Namespace(**{**vars(args), "limit": 10}))
                continue
            if line == "/clear":
                room = client.post(
                    "/api/rooms",
                    headers=client._headers(user_id=ids["user_id"]),
                    json={"name": DEFAULT_ROOM_NAME, "agent_ids": [ids["agent_id"]]},
                )
                ids["room_id"] = room["id"]
                config = load_config()
                config["room_id"] = room["id"]
                save_config(config)
                console.print(f"new room: {room['id']}")
                continue
            try:
                console.print(f"{ids['agent_id']}: ", end="")
                content, usage = _stream_message(client, ids["room_id"], ids["user_id"], ids["agent_id"], line)
            except Exception:
                response = _send_message(client, ids["room_id"], ids["user_id"], ids["agent_id"], line)
                item = response["responses"][0]
                content = item["message"]["content"]
                usage = item.get("usage") or {}
                console.print(f'{item["agent_name"]}: {content}')
            total_messages += 1
            if usage:
                console.print(f"tokens: prompt={usage.get('prompt_tokens', 0)} completion={usage.get('completion_tokens', 0)}")
    except KeyboardInterrupt:
        console.print(f"exiting after {total_messages} turn(s)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="Output raw JSON response instead of formatted text")

    parser = argparse.ArgumentParser(
        prog="emilia",
        description="Emilia CLI: Management and interaction tool for the Emilia AI ecosystem.",
        epilog=(
            "Examples:\n"
            "  emilia setup --user-id thai --agent-id emilia\n"
            "  emilia context show\n"
            "  emilia context auto --user thai\n"
            "  emilia auth check\n"
            "  emilia chat\n"
            "\n"
            "Use 'emilia <command> --help' for more information on a specific command."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[common],
    )
    sub = parser.add_subparsers(dest="command", required=True, title="commands", metavar="COMMAND")

    sub.add_parser("health", parents=[common], help="Check backend API health and connectivity")

    auth = sub.add_parser("auth", parents=[common], help="Auth diagnostics")
    auth_sub = auth.add_subparsers(dest="auth_cmd", required=True, title="auth commands", metavar="AUTH_CMD")
    auth_sub.add_parser("check", parents=[common], help="Validate auth/token setup against backend")

    context = sub.add_parser("context", parents=[common], help="View or update default CLI context")
    context_sub = context.add_subparsers(dest="context_cmd", required=True, title="context commands", metavar="CONTEXT_CMD")
    context_show = context_sub.add_parser("show", parents=[common], help="Show saved user/agent/room context")
    context_show.set_defaults(room_required=False)
    context_set = context_sub.add_parser("set", parents=[common], help="Set saved user/agent/room context")
    context_set.add_argument("--user", help="Default user ID")
    context_set.add_argument("--agent", help="Default agent ID")
    context_set.add_argument("--room", help="Default room ID")
    context_set.set_defaults(room_required=False)
    context_auto = context_sub.add_parser("auto", parents=[common], help="Auto-select most recent room context for a user")
    context_auto.add_argument("--user", help="User ID (defaults to saved context or cli-user)")
    context_auto.add_argument("--agent", help="Preferred agent ID if present in selected room")
    context_auto.set_defaults(room_required=False)

    setup = sub.add_parser("setup", parents=[common], help="Perform initial configuration (create/ensure user, agent, room)")
    setup.add_argument("--user-id", help=f"User ID (default: {DEFAULT_USER_ID})")
    setup.add_argument("--user-name", help="User display name (default: user-id)")
    setup.add_argument("--agent-id", help=f"Agent ID (default: {DEFAULT_AGENT_ID})")
    setup.add_argument("--agent-name", help="Agent display name (default: agent-id)")
    setup.add_argument("--room-name", help=f"Room name (default: {DEFAULT_ROOM_NAME})")
    setup.add_argument("--workspace", help="Workspace path for agent (optional; defaults to $EMILIA_WORKSPACE_ROOT/<agent-id> or ~/.emilia/agents/<agent-id>)")
    setup.add_argument("--archetype", default="gentle", help="Workspace SOUL template archetype when auto-initializing")
    setup.add_argument("--provider", choices=["native", "openclaw"], default="native", help="Agent provider")
    setup.add_argument("--model", default=os.getenv("EMILIA_DEFAULT_MODEL", "gpt-4o-mini"), help="Agent model")
    setup.set_defaults(room_required=False)

    users_parser = sub.add_parser("users", parents=[common], help="Manage users and agent access mappings")
    users = users_parser.add_subparsers(dest="users_cmd", required=True, title="user commands", metavar="USER_CMD")
    users.add_parser("list", parents=[common], help="List all registered users")
    users_create = users.add_parser("create", parents=[common], help="Create a new user")
    users_create.add_argument("--name", required=True, help="Display name for the user")
    users_create.add_argument("--id", help="Explicit user ID (slugified name used if omitted)")
    users_show = users.add_parser("show", parents=[common], help="Show detailed user information")
    users_show.add_argument("user_id", nargs="?", help="ID of the user to show")
    users_show.add_argument("--user", help="Alias for user_id")
    users_update = users.add_parser("update", parents=[common], help="Update a user's fields")
    users_update.add_argument("user_id", nargs="?", help="ID of the user to update")
    users_update.add_argument("--user", help="Alias for user_id")
    users_update.add_argument("--name", required=True, help="New display name")
    users_delete = users.add_parser("delete", parents=[common], help="Delete a user")
    users_delete.add_argument("user_id", nargs="?", help="ID of the user to delete")
    users_delete.add_argument("--user", help="Alias for user_id")
    users_delete.add_argument("--yes", action="store_true", help="Confirm deletion")
    users_map = users.add_parser("map", parents=[common], help="Map an agent to a user (grant access)")
    users_map.add_argument("user_id", nargs="?", help="ID of the user")
    users_map.add_argument("agent_id", nargs="?", help="ID of the agent to map")
    users_map.add_argument("--user", help="Alias for user_id")
    users_map.add_argument("--agent", help="Alias for agent_id")
    users_unmap = users.add_parser("unmap", parents=[common], help="Unmap an agent from a user (revoke access)")
    users_unmap.add_argument("user_id", nargs="?", help="ID of the user")
    users_unmap.add_argument("agent_id", nargs="?", help="ID of the agent to unmap")
    users_unmap.add_argument("--user", help="Alias for user_id")
    users_unmap.add_argument("--agent", help="Alias for agent_id")

    agents_parser = sub.add_parser("agents", parents=[common], help="Manage AI agents and workspace configurations")
    agents = agents_parser.add_subparsers(dest="agents_cmd", required=True, title="agent commands", metavar="AGENT_CMD")
    agents.add_parser("list", parents=[common], help="List all registered agents")
    agents_create = agents.add_parser("create", parents=[common], help="Create a new agent")
    agents_create.add_argument("--id", required=True, help="Unique ID for the agent")
    agents_create.add_argument("--name", required=True, help="Display name for the agent")
    agents_create.add_argument("--workspace", required=True, help="Path to the agent's SOUL/workspace directory")
    agents_create.add_argument("--provider", choices=["native", "openclaw"], required=True, help="LLM runtime provider")
    agents_create.add_argument("--model", required=True, help="Model name (e.g., gpt-4o-mini)")
    agents_create.add_argument("--api-base", dest="api_base", help="Custom API base URL for the provider")
    agents_create.add_argument("--provider-config", help="Extra provider configuration as JSON string")
    agents_show = agents.add_parser("show", parents=[common], help="Show detailed agent information")
    agents_show.add_argument("agent_id", nargs="?", help="ID of the agent to show")
    agents_show.add_argument("--agent", help="Alias for agent_id")
    agents_update = agents.add_parser("update", parents=[common], help="Update an existing agent's configuration")
    agents_update.add_argument("agent_id", nargs="?", help="ID of the agent to update")
    agents_update.add_argument("--agent", help="Alias for agent_id")
    agents_update.add_argument("--name", help="New display name")
    agents_update.add_argument("--workspace", help="New workspace path")
    agents_update.add_argument("--model", help="New model name")
    agents_update.add_argument("--api-base", dest="api_base", help="New API base URL")
    agents_update.add_argument("--provider", help="New provider type")
    agents_update.add_argument("--provider-config", help="Updated provider configuration (JSON)")
    agents_delete = agents.add_parser("delete", parents=[common], help="Delete an agent")
    agents_delete.add_argument("agent_id", nargs="?", help="ID of the agent to delete")
    agents_delete.add_argument("--agent", help="Alias for agent_id")
    agents_delete.add_argument("--yes", action="store_true", help="Confirm deletion")

    rooms = sub.add_parser("rooms", parents=[common], help="Manage chat rooms and participants")
    rooms_sub = rooms.add_subparsers(dest="rooms_cmd", required=True, title="room commands", metavar="ROOM_CMD")
    rooms_list = rooms_sub.add_parser("list", parents=[common], help="List rooms for a user")
    rooms_list.add_argument("--user", help="User ID to list rooms for")
    rooms_list.set_defaults(room_required=False)
    rooms_create = rooms_sub.add_parser("create", parents=[common], help="Create a new chat room")
    rooms_create.add_argument("--name", help="Display name for the room")
    rooms_create.add_argument("--user", help="User ID who owns the room")
    rooms_create.add_argument("--agent", action="append", help="Agent ID to add to the room (repeatable)")
    rooms_create.add_argument("--agents", help="Comma-separated agent IDs to add to the room")
    rooms_create.set_defaults(room_required=False)
    rooms_show = rooms_sub.add_parser("show", parents=[common], help="Show detailed room information")
    rooms_show.add_argument("room_id", nargs="?", help="ID of the room to show")
    rooms_show.add_argument("--room", help="Alias for room_id")
    rooms_show.add_argument("--user", help="User ID context for the room")
    rooms_update = rooms_sub.add_parser("update", parents=[common], help="Update room metadata")
    rooms_update.add_argument("room_id", nargs="?", help="ID of the room to update")
    rooms_update.add_argument("--room", help="Alias for room_id")
    rooms_update.add_argument("--user", help="User ID context")
    rooms_update.add_argument("--name", required=True, help="New room name")
    rooms_delete = rooms_sub.add_parser("delete", parents=[common], help="Delete a room")
    rooms_delete.add_argument("room_id", nargs="?", help="ID of the room to delete")
    rooms_delete.add_argument("--room", help="Alias for room_id")
    rooms_delete.add_argument("--user", help="User ID context")
    rooms_delete.add_argument("--yes", action="store_true", help="Confirm deletion")
    rooms_add = rooms_sub.add_parser("add-agent", parents=[common], help="Add an agent to a room")
    rooms_add.add_argument("room_id", nargs="?", help="ID of the room")
    rooms_add.add_argument("agent_id", nargs="?", help="ID of the agent to add")
    rooms_add.add_argument("--room", help="Alias for room_id")
    rooms_add.add_argument("--agent", help="Alias for agent_id")
    rooms_add.add_argument("--user", help="User ID context")
    rooms_remove = rooms_sub.add_parser("remove-agent", parents=[common], help="Remove an agent from a room")
    rooms_remove.add_argument("room_id", nargs="?", help="ID of the room")
    rooms_remove.add_argument("agent_id", nargs="?", help="ID of the agent to remove")
    rooms_remove.add_argument("--room", help="Alias for room_id")
    rooms_remove.add_argument("--agent", help="Alias for agent_id")
    rooms_remove.add_argument("--user", help="User ID context")

    workspace = sub.add_parser("workspace", parents=[common], help="Initialize and manage agent workspaces")
    workspace_sub = workspace.add_subparsers(dest="workspace_cmd", required=True, title="workspace commands", metavar="WORKSPACE_CMD")
    workspace_init = workspace_sub.add_parser("init", parents=[common], help="Initialize a new workspace with SOUL.md template")
    workspace_init.add_argument("path", help="Local directory path for the workspace")
    workspace_init.add_argument("--name", required=True, help="Name of the agent personality")
    workspace_init.add_argument("--archetype", default="gentle", help="Personality archetype (e.g., gentle, chaotic)")
    workspace_init.set_defaults(room_required=False)

    chat = sub.add_parser("chat", parents=[common], help="Start an interactive streaming chat session")
    chat.add_argument("--room", help="Room ID to join")
    chat.add_argument("--user", help="User ID to act as")
    chat.add_argument("--agent", help="Primary agent ID to talk to")

    send = sub.add_parser("send", parents=[common], help="Send a single message and get a response")
    send.add_argument("--room", help="Room ID to send to")
    send.add_argument("--user", help="User ID to act as")
    send.add_argument("--agent", help="Agent ID to send to")
    send.add_argument("message", help="Text message content")

    history = sub.add_parser("history", parents=[common], help="View message history for a room")
    history.add_argument("--room", help="Room ID to view")
    history.add_argument("--user", help="User ID context")
    history.add_argument("--agent", help="Agent ID context")
    history.add_argument("--limit", type=int, default=20, help="Number of messages to retrieve")

    memory = sub.add_parser("memory", parents=[common], help="Inspect and search agent long-term memory")
    memory_sub = memory.add_subparsers(dest="memory_cmd", required=True, title="memory commands", metavar="MEMORY_CMD")
    memory_list = memory_sub.add_parser("list", parents=[common], help="List all memory files for an agent")
    memory_list.add_argument("--user", help="User ID context")
    memory_list.add_argument("--agent", help="Agent ID context")
    memory_list.set_defaults(room_required=False)
    memory_read = memory_sub.add_parser("read", parents=[common], help="Read a specific memory file")
    memory_read.add_argument("path", help="Relative path to the memory file (e.g., summary.md)")
    memory_read.add_argument("--user", help="User ID context")
    memory_read.add_argument("--agent", help="Agent ID context")
    memory_read.set_defaults(room_required=False)
    memory_search = memory_sub.add_parser("search", parents=[common], help="Search across all agent memory files")
    memory_search.add_argument("query", help="Search query string")
    memory_search.add_argument("--user", help="User ID context")
    memory_search.add_argument("--agent", help="Agent ID context")
    memory_search.set_defaults(room_required=False)

    dream = sub.add_parser("dream", parents=[common], help="Manage agent cognitive processes (dreams)")
    dream_sub = dream.add_subparsers(dest="dream_cmd", required=True, title="dream commands", metavar="DREAM_CMD")
    dream_trigger = dream_sub.add_parser("trigger", parents=[common], help="Manually trigger a dream cycle")
    dream_status = dream_sub.add_parser("status", parents=[common], help="Check status of the current dream cycle")
    dream_log = dream_sub.add_parser("log", parents=[common], help="Retrieve logs for recent dream cycles")
    dream_reset = dream_sub.add_parser("reset", parents=[common], help="Reset the dream state for a user/agent pair")
    for cmd in (dream_trigger, dream_status, dream_log, dream_reset):
        cmd.add_argument("--user", help="User ID context")
        cmd.add_argument("--agent", help="Agent ID context")
        cmd.set_defaults(room_required=False)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = EmiliaClient()
    handlers: dict[tuple[str, str | None], Callable[[EmiliaClient, Any], int]] = {
        ("health", None): cmd_health,
        ("auth", "check"): cmd_auth_check,
        ("context", "show"): cmd_context_show,
        ("context", "set"): cmd_context_set,
        ("context", "auto"): cmd_context_auto,
        ("setup", None): cmd_setup,
        ("users", "list"): cmd_users_list,
        ("users", "create"): cmd_users_create,
        ("users", "show"): cmd_users_show,
        ("users", "update"): cmd_users_update,
        ("users", "delete"): cmd_users_delete,
        ("users", "map"): cmd_users_map,
        ("users", "unmap"): cmd_users_unmap,
        ("agents", "list"): cmd_agents_list,
        ("agents", "create"): cmd_agents_create,
        ("agents", "show"): cmd_agents_show,
        ("agents", "update"): cmd_agents_update,
        ("agents", "delete"): cmd_agents_delete,
        ("rooms", "list"): cmd_rooms_list,
        ("rooms", "create"): cmd_rooms_create,
        ("rooms", "show"): cmd_rooms_show,
        ("rooms", "update"): cmd_rooms_update,
        ("rooms", "delete"): cmd_rooms_delete,
        ("rooms", "add-agent"): cmd_rooms_add_agent,
        ("rooms", "remove-agent"): cmd_rooms_remove_agent,
        ("workspace", "init"): cmd_workspace_init,
        ("chat", None): cmd_chat,
        ("send", None): cmd_send,
        ("history", None): cmd_history,
        ("memory", "list"): cmd_memory_list,
        ("memory", "read"): cmd_memory_read,
        ("memory", "search"): cmd_memory_search,
        ("dream", "trigger"): cmd_dream_trigger,
        ("dream", "status"): cmd_dream_status,
        ("dream", "log"): cmd_dream_log,
        ("dream", "reset"): cmd_dream_reset,
    }
    try:
        subcommand = (
            getattr(args, "auth_cmd", None)
            or getattr(args, "context_cmd", None)
            or getattr(args, "users_cmd", None)
            or getattr(args, "agents_cmd", None)
            or getattr(args, "rooms_cmd", None)
            or getattr(args, "memory_cmd", None)
            or getattr(args, "dream_cmd", None)
            or getattr(args, "workspace_cmd", None)
        )
        handler = handlers.get((args.command, subcommand))
        if not handler:
            raise SystemExit("Unknown command")
        return handler(client, args)
    except httpx.HTTPStatusError as exc:
        message = exc.response.text
        try:
            payload = exc.response.json()
            message = payload.get("detail") or payload.get("message") or message
        except ValueError:
            pass
        print(f"Error: {message}", file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON input ({exc})", file=sys.stderr)
        return 1
    except SystemExit as exc:
        if isinstance(exc.code, str):
            print(f"Error: {exc.code}", file=sys.stderr)
            return 1
        return int(exc.code)
    finally:
        client.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
