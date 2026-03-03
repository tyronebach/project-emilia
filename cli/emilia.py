#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
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


def cmd_health(client: EmiliaClient, args) -> int:
    console.print(json.dumps(client.get("/api/health"), indent=2))
    return 0


def cmd_setup(client: EmiliaClient, args) -> int:
    user = client.ensure_user()
    agent = client.ensure_agent()
    client.grant_access(user["id"], agent["id"])
    room = client.ensure_room(user["id"], agent["id"])
    payload = {"user_id": user["id"], "agent_id": agent["id"], "room_id": room["id"]}
    save_config(payload)
    console.print(json.dumps(payload, indent=2))
    return 0


def cmd_users_list(client: EmiliaClient, args) -> int:
    payload = client.get("/api/manage/users")
    print_table("Users", payload["users"], ["id", "display_name", "avatar_count"])
    return 0


def cmd_agents_list(client: EmiliaClient, args) -> int:
    payload = client.get("/api/manage/agents")
    print_table("Agents", payload["agents"], ["id", "display_name", "provider"])
    return 0


def cmd_rooms_list(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get("/api/rooms", headers=client._headers(user_id=ids["user_id"]))
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
    console.print(json.dumps(room, indent=2))
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
    console.print(payload["content"])
    return 0


def cmd_memory_search(client: EmiliaClient, args) -> int:
    ids = require_ids(args)
    payload = client.get(
        "/api/memory/search",
        headers=client._headers(user_id=ids["user_id"]),
        params={"agent_id": args.agent or ids["agent_id"], "q": args.query},
    )
    for row in payload["results"]:
        console.print(f'{row["path"]}: {row["snippet"]}')
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
    parser = argparse.ArgumentParser(prog="emilia")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health")
    sub.add_parser("setup")

    users = sub.add_parser("users").add_subparsers(dest="users_cmd", required=True)
    users.add_parser("list")

    agents = sub.add_parser("agents").add_subparsers(dest="agents_cmd", required=True)
    agents.add_parser("list")

    rooms = sub.add_parser("rooms")
    rooms_sub = rooms.add_subparsers(dest="rooms_cmd", required=True)
    rooms_list = rooms_sub.add_parser("list")
    rooms_list.add_argument("--user")
    rooms_create = rooms_sub.add_parser("create")
    rooms_create.add_argument("--name")
    rooms_create.add_argument("--user")
    rooms_create.add_argument("--agent")

    chat = sub.add_parser("chat")
    chat.add_argument("--room")
    chat.add_argument("--user")
    chat.add_argument("--agent")

    send = sub.add_parser("send")
    send.add_argument("--room")
    send.add_argument("--user")
    send.add_argument("--agent")
    send.add_argument("message")

    history = sub.add_parser("history")
    history.add_argument("--room")
    history.add_argument("--user")
    history.add_argument("--agent")
    history.add_argument("--limit", type=int, default=20)

    memory = sub.add_parser("memory")
    memory_sub = memory.add_subparsers(dest="memory_cmd", required=True)
    memory_list = memory_sub.add_parser("list")
    memory_list.add_argument("--user")
    memory_list.add_argument("--agent")
    memory_read = memory_sub.add_parser("read")
    memory_read.add_argument("path")
    memory_read.add_argument("--user")
    memory_read.add_argument("--agent")
    memory_search = memory_sub.add_parser("search")
    memory_search.add_argument("query")
    memory_search.add_argument("--user")
    memory_search.add_argument("--agent")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = EmiliaClient()
    try:
        if args.command == "health":
            return cmd_health(client, args)
        if args.command == "setup":
            return cmd_setup(client, args)
        if args.command == "users" and args.users_cmd == "list":
            return cmd_users_list(client, args)
        if args.command == "agents" and args.agents_cmd == "list":
            return cmd_agents_list(client, args)
        if args.command == "rooms" and args.rooms_cmd == "list":
            return cmd_rooms_list(client, args)
        if args.command == "rooms" and args.rooms_cmd == "create":
            return cmd_rooms_create(client, args)
        if args.command == "chat":
            return cmd_chat(client, args)
        if args.command == "send":
            return cmd_send(client, args)
        if args.command == "history":
            return cmd_history(client, args)
        if args.command == "memory" and args.memory_cmd == "list":
            return cmd_memory_list(client, args)
        if args.command == "memory" and args.memory_cmd == "read":
            return cmd_memory_read(client, args)
        if args.command == "memory" and args.memory_cmd == "search":
            return cmd_memory_search(client, args)
    finally:
        client.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
