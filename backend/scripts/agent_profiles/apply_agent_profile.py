#!/usr/bin/env python3
"""
One-shot helper to apply a full Designer V2 personality profile to an agent.

Usage:
  python scripts/apply_agent_profile.py --agent-id rem --profile /path/to/profile.json

Optional:
  --api http://localhost:8080
  --token <AUTH_TOKEN>   (or set AUTH_TOKEN env var)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def build_request(api_base: str, agent_id: str, payload: dict, token: str | None):
    url = f"{api_base.rstrip('/')}/api/designer/v2/personalities/{agent_id}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    return req


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply Designer V2 personality profile to an agent.")
    parser.add_argument("--agent-id", required=True, help="Agent id to update (e.g., rem)")
    parser.add_argument("--profile", required=True, help="Path to JSON profile payload")
    parser.add_argument("--api", default="http://localhost:8080", help="API base URL")
    parser.add_argument("--token", default=os.getenv("AUTH_TOKEN"), help="Auth token (or set AUTH_TOKEN)")
    args = parser.parse_args()

    try:
        with open(args.profile, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as exc:
        print(f"Failed to read profile JSON: {exc}", file=sys.stderr)
        return 1

    req = build_request(args.api, args.agent_id, payload, args.token)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            print(body)
            return 0
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8") if exc.fp else ""
        print(f"HTTP {exc.code}: {err_body or exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
