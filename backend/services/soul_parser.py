"""SOUL.md parser for user-facing About panel and runtime canon extraction."""
from __future__ import annotations

import re
from typing import Any


_IDENTITY_KEY_RE = re.compile(r"^-\s*\*\*(?P<key>[^*:]+?)(?::)?\*\*:?\s*(?P<value>.+)$")
_BULLET_RE = re.compile(r"^-\s+(.+)$")
_FRAGILITY_LINE_RE = _IDENTITY_KEY_RE


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


def _extract_section(markdown_text: str, header: str) -> str:
    lines = (markdown_text or "").splitlines()
    target = header.strip().lower()
    start_idx: int | None = None
    for idx, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if stripped.startswith("## ") and stripped[3:].strip().lower() == target:
            start_idx = idx + 1
            break
    if start_idx is None:
        return ""

    collected: list[str] = []
    for raw_line in lines[start_idx:]:
        stripped = raw_line.strip()
        if stripped.startswith("## "):
            break
        collected.append(raw_line)
    return "\n".join(collected).strip()


def _parse_fragility_profile(section_text: str) -> dict[str, Any]:
    profile: dict[str, Any] = {}
    breaking_behaviors: dict[float, list[str]] = {}
    current_threshold: float | None = None

    for raw_line in section_text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        if stripped.lower().startswith("- **resilience to hostility:**"):
            profile["resilience_to_hostility"] = stripped.split(":", 1)[1].strip()
            continue

        if stripped.lower().startswith("- **trust repair rate:**"):
            profile["trust_repair_rate_text"] = stripped.split(":", 1)[1].strip()
            continue

        if stripped.lower().startswith("- **breaking behaviors:**"):
            current_threshold = None
            continue

        match = _FRAGILITY_LINE_RE.match(stripped)
        if match:
            key = _to_identity_key(match.group("key"))
            value = match.group("value").strip()
            profile[key] = value
            continue

        if stripped.startswith("-") and "trust <" in stripped.lower():
            threshold_match = re.search(r"trust\s*<\s*([0-9.]+)", stripped.lower())
            if threshold_match:
                current_threshold = float(threshold_match.group(1))
                breaking_behaviors.setdefault(current_threshold, [])
            continue

        if current_threshold is not None and stripped.startswith("-"):
            item = stripped[1:].strip()
            if item:
                breaking_behaviors.setdefault(current_threshold, []).append(item)

    if breaking_behaviors:
        profile["breaking_behaviors_raw"] = breaking_behaviors

    hostility_text = " ".join([
        str(profile.get("resilience_to_hostility") or ""),
        section_text,
    ]).lower()
    if "deflect" in hostility_text:
        profile["hostility_response"] = "deflect"
    elif "withdraw" in hostility_text:
        profile["hostility_response"] = "withdraw"
    elif "cold" in hostility_text or "freeze" in hostility_text:
        profile["hostility_response"] = "freeze"

    if "trust_repair_rate_text" in profile:
        repair_text = str(profile["trust_repair_rate_text"]).lower()
        if "slow" in repair_text:
            profile["trust_repair_rate"] = 0.03
        elif "moderate" in repair_text:
            profile["trust_repair_rate"] = 0.05
        elif "fast" in repair_text:
            profile["trust_repair_rate"] = 0.08

    return profile


def extract_canon_text(markdown_text: str) -> str:
    """Return the Canon section for v3 SOUL.md, or the full text for older formats."""
    canon = _extract_section(markdown_text, "Canon")
    return canon or (markdown_text or "").strip()


def parse_soul_markdown(markdown_text: str) -> dict[str, Any]:
    """Parse SOUL.md sections into stable JSON shape.

    Returns keys:
      identity: dict[str, str]
      essence: list[str]
      personality: list[str]
      quirks: list[str]
    """
    sections: dict[str, Any] = {
        "identity": {},
        "essence": [],
        "personality": [],
        "quirks": [],
        "canon_text": extract_canon_text(markdown_text),
        "fragility_profile": {},
    }

    canon_body = _extract_section(markdown_text, "Canon")
    if canon_body:
        fragility_body = _extract_section(canon_body, "Fragility Profile")
        if not fragility_body:
            lines = canon_body.splitlines()
            capture = False
            collected: list[str] = []
            for raw_line in lines:
                stripped = raw_line.strip()
                if stripped.startswith("### "):
                    header = _normalize_header(stripped[4:])
                    if header == "fragility profile":
                        capture = True
                        continue
                    if capture:
                        break
                if capture:
                    collected.append(raw_line)
            fragility_body = "\n".join(collected).strip()
        sections["fragility_profile"] = _parse_fragility_profile(fragility_body)

    current: str | None = None
    for raw_line in (markdown_text or "").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("## ") or stripped.startswith("### "):
            level = 3 if stripped.startswith("### ") else 2
            header = _normalize_header(stripped[level:])
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
