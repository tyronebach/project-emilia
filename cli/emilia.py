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
    return "emilia-dev-token-2026"


class EmiliaClient:
    def __init__(self, base_url: str = BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(
            base_url=self.base_url,
            timeout=60.0,
            headers={"Authorization": f"Bearer {auth_token()}"},
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

    def ensure_user(self) -> dict:
        users = self.get("/api/manage/users")["users"]
        for user in users:
            if user["id"] == DEFAULT_USER_ID:
                return user
        return self.post("/api/manage/users", json={"id": DEFAULT_USER_ID, "display_name": DEFAULT_USER_ID})

    def ensure_agent(self) -> dict:
        agents = self.get("/api/manage/agents")["agents"]
        for agent in agents:
            if agent["id"] == DEFAULT_AGENT_ID:
                return agent
        return self.post(
            "/api/manage/agents",
            json={
                "id": DEFAULT_AGENT_ID,
                "display_name": DEFAULT_AGENT_ID,
                "provider": "native",
                "provider_config": {"model": os.getenv("EMILIA_DEFAULT_MODEL", "gpt-4o-mini")},
            },
        )

    def grant_access(self, user_id: str, agent_id: str) -> None:
        self.put(f"/api/manage/users/{user_id}/agents/{agent_id}")

    def ensure_room(self, user_id: str, agent_id: str) -> dict:
        rooms = self.get("/api/rooms", headers=self._headers(user_id=user_id), params={"agent_id": agent_id})["rooms"]
        for room in rooms:
            if room["name"] == DEFAULT_ROOM_NAME:
                return room
        return self.post(
            "/api/rooms",
            headers=self._headers(user_id=user_id),
            json={"name": DEFAULT_ROOM_NAME, "agent_ids": [agent_id]},
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
    user = client.ensure_user()
    agent = client.ensure_agent()
    client.grant_access(user["id"], agent["id"])
    room = client.ensure_room(user["id"], agent["id"])
    payload = {"user_id": user["id"], "agent_id": agent["id"], "room_id": room["id"]}
    save_config(payload)
    emit_json_or_text(args, payload)
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
    payload.update({"id": args.id, "display_name": args.name})
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


def cmd_rooms_list(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get("/api/rooms", headers=client._headers(user_id=ids["user_id"]))
    if args.json:
        print_json(payload)
        return 0
    print_table("Rooms", payload["rooms"], ["id", "name", "room_type", "message_count"])
    return 0


def cmd_rooms_create(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room = client.post(
        "/api/rooms",
        headers=client._headers(user_id=ids["user_id"]),
        json={"name": args.name or "cli-room", "agent_ids": [ids["agent_id"]]},
    )
    config = load_config()
    config["room_id"] = room["id"]
    save_config(config)
    emit_created(args, room, room["id"])
    return 0


def cmd_rooms_show(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    room_id = resolve_id(getattr(args, "room_id", None), args.room or ids["room_id"], "room")
    detail = client.get(f"/api/rooms/{room_id}", headers=client._headers(user_id=ids["user_id"]))
    emit_json_or_text(args, detail, render_room_detail(detail))
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
    response = payload["responses"][0]
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
    console.print("\n".join(payload["files"]))
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
    common.add_argument("--json", action="store_true")

    parser = argparse.ArgumentParser(prog="emilia", parents=[common])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", parents=[common])
    sub.add_parser("setup", parents=[common])

    users_parser = sub.add_parser("users", parents=[common])
    users = users_parser.add_subparsers(dest="users_cmd", required=True)
    users.add_parser("list", parents=[common])
    users_create = users.add_parser("create", parents=[common])
    users_create.add_argument("--name", required=True)
    users_create.add_argument("--id")
    users_show = users.add_parser("show", parents=[common])
    users_show.add_argument("user_id", nargs="?")
    users_show.add_argument("--user")
    users_map = users.add_parser("map", parents=[common])
    users_map.add_argument("user_id", nargs="?")
    users_map.add_argument("agent_id", nargs="?")
    users_map.add_argument("--user")
    users_map.add_argument("--agent")
    users_unmap = users.add_parser("unmap", parents=[common])
    users_unmap.add_argument("user_id", nargs="?")
    users_unmap.add_argument("agent_id", nargs="?")
    users_unmap.add_argument("--user")
    users_unmap.add_argument("--agent")

    agents_parser = sub.add_parser("agents", parents=[common])
    agents = agents_parser.add_subparsers(dest="agents_cmd", required=True)
    agents.add_parser("list", parents=[common])
    agents_create = agents.add_parser("create", parents=[common])
    agents_create.add_argument("--id", required=True)
    agents_create.add_argument("--name", required=True)
    agents_create.add_argument("--workspace", required=True)
    agents_create.add_argument("--provider", choices=["native", "openclaw"], required=True)
    agents_create.add_argument("--model", required=True)
    agents_create.add_argument("--api-base", dest="api_base")
    agents_create.add_argument("--provider-config")
    agents_show = agents.add_parser("show", parents=[common])
    agents_show.add_argument("agent_id", nargs="?")
    agents_show.add_argument("--agent")
    agents_update = agents.add_parser("update", parents=[common])
    agents_update.add_argument("agent_id", nargs="?")
    agents_update.add_argument("--agent")
    agents_update.add_argument("--name")
    agents_update.add_argument("--workspace")
    agents_update.add_argument("--model")
    agents_update.add_argument("--api-base", dest="api_base")
    agents_update.add_argument("--provider")
    agents_update.add_argument("--provider-config")

    rooms = sub.add_parser("rooms", parents=[common])
    rooms_sub = rooms.add_subparsers(dest="rooms_cmd", required=True)
    rooms_list = rooms_sub.add_parser("list", parents=[common])
    rooms_list.add_argument("--user")
    rooms_list.set_defaults(room_required=False)
    rooms_create = rooms_sub.add_parser("create", parents=[common])
    rooms_create.add_argument("--name")
    rooms_create.add_argument("--user")
    rooms_create.add_argument("--agent")
    rooms_create.set_defaults(room_required=False)
    rooms_show = rooms_sub.add_parser("show", parents=[common])
    rooms_show.add_argument("room_id", nargs="?")
    rooms_show.add_argument("--room")
    rooms_show.add_argument("--user")
    rooms_add = rooms_sub.add_parser("add-agent", parents=[common])
    rooms_add.add_argument("room_id", nargs="?")
    rooms_add.add_argument("agent_id", nargs="?")
    rooms_add.add_argument("--room")
    rooms_add.add_argument("--agent")
    rooms_add.add_argument("--user")
    rooms_remove = rooms_sub.add_parser("remove-agent", parents=[common])
    rooms_remove.add_argument("room_id", nargs="?")
    rooms_remove.add_argument("agent_id", nargs="?")
    rooms_remove.add_argument("--room")
    rooms_remove.add_argument("--agent")
    rooms_remove.add_argument("--user")

    workspace = sub.add_parser("workspace", parents=[common])
    workspace_sub = workspace.add_subparsers(dest="workspace_cmd", required=True)
    workspace_init = workspace_sub.add_parser("init", parents=[common])
    workspace_init.add_argument("path")
    workspace_init.add_argument("--name", required=True)
    workspace_init.add_argument("--archetype", default="gentle")
    workspace_init.set_defaults(room_required=False)

    chat = sub.add_parser("chat", parents=[common])
    chat.add_argument("--room")
    chat.add_argument("--user")
    chat.add_argument("--agent")

    send = sub.add_parser("send", parents=[common])
    send.add_argument("--room")
    send.add_argument("--user")
    send.add_argument("--agent")
    send.add_argument("message")

    history = sub.add_parser("history", parents=[common])
    history.add_argument("--room")
    history.add_argument("--user")
    history.add_argument("--agent")
    history.add_argument("--limit", type=int, default=20)

    memory = sub.add_parser("memory", parents=[common])
    memory_sub = memory.add_subparsers(dest="memory_cmd", required=True)
    memory_list = memory_sub.add_parser("list", parents=[common])
    memory_list.add_argument("--user")
    memory_list.add_argument("--agent")
    memory_list.set_defaults(room_required=False)
    memory_read = memory_sub.add_parser("read", parents=[common])
    memory_read.add_argument("path")
    memory_read.add_argument("--user")
    memory_read.add_argument("--agent")
    memory_read.set_defaults(room_required=False)
    memory_search = memory_sub.add_parser("search", parents=[common])
    memory_search.add_argument("query")
    memory_search.add_argument("--user")
    memory_search.add_argument("--agent")
    memory_search.set_defaults(room_required=False)

    dream = sub.add_parser("dream", parents=[common])
    dream_sub = dream.add_subparsers(dest="dream_cmd", required=True)
    for name in ("trigger", "status", "log", "reset"):
        cmd = dream_sub.add_parser(name, parents=[common])
        cmd.add_argument("--user")
        cmd.add_argument("--agent")
        cmd.set_defaults(room_required=False)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = EmiliaClient()
    handlers: dict[tuple[str, str | None], Callable[[EmiliaClient, Any], int]] = {
        ("health", None): cmd_health,
        ("setup", None): cmd_setup,
        ("users", "list"): cmd_users_list,
        ("users", "create"): cmd_users_create,
        ("users", "show"): cmd_users_show,
        ("users", "map"): cmd_users_map,
        ("users", "unmap"): cmd_users_unmap,
        ("agents", "list"): cmd_agents_list,
        ("agents", "create"): cmd_agents_create,
        ("agents", "show"): cmd_agents_show,
        ("agents", "update"): cmd_agents_update,
        ("rooms", "list"): cmd_rooms_list,
        ("rooms", "create"): cmd_rooms_create,
        ("rooms", "show"): cmd_rooms_show,
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
            getattr(args, "users_cmd", None)
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
