"""SOUL.md parser for user-facing About panel."""
from __future__ import annotations

import re
from typing import Any


_IDENTITY_KEY_RE = re.compile(r"^-\s*\*\*(?P<key>[^*]+)\*\*:\s*(?P<value>.+)$")
_BULLET_RE = re.compile(r"^-\s+(.+)$")


def _normalize_header(text: str) -> str:
    normalized = (text or "").strip().lower()
    normalized = normalized.replace("&", "and")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _to_identity_key(raw: str) -> str:
    key = raw.strip().lower()
    key = re.sub(r"[^a-z0-9]+", "_", key)
    key = key.strip("_")
    return key or "unknown"


def parse_soul_markdown(markdown_text: str) -> dict[str, Any]:
    """Parse SOUL.md sections into stable JSON shape.

    Returns keys:
      identity: dict[str, str]
      essence: list[str]
      personality: list[str]
      quirks: list[str]
    """
    sections = {
        "identity": {},
        "essence": [],
        "personality": [],
        "quirks": [],
    }

    current: str | None = None
    for raw_line in (markdown_text or "").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("## "):
            header = _normalize_header(stripped[3:])
            if header in {"identity"}:
                current = "identity"
            elif header in {"essence"}:
                current = "essence"
            elif header in {"personality", "personality and speech", "personality speech"}:
                current = "personality"
            elif header in {"quirks"}:
                current = "quirks"
            else:
                current = None
            continue

        if current == "identity":
            m = _IDENTITY_KEY_RE.match(stripped)
            if m:
                key = _to_identity_key(m.group("key"))
                sections["identity"][key] = m.group("value").strip()
            continue

        if current in {"essence", "personality", "quirks"}:
            m = _BULLET_RE.match(stripped)
            if m:
                text = m.group(1).strip()
                if text:
                    sections[current].append(text)

    return sections
