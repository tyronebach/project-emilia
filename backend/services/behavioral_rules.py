"""Behavioral rules framework for trust-based prompt constraints."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


_RULE_TEXT: dict[str, str] = {
    "shorter_responses": "Keep responses under 50 words. You don't have much to say to them right now.",
    "no_questions": "Do not ask them questions. You're not curious about their life right now.",
    "no_endearments": "Do not use pet names, compliments, or warm language.",
    "no_disclosure": "Do not share personal thoughts, feelings, or vulnerabilities.",
    "minimal_responses": "Respond in 1-2 sentences maximum. You're here because you have to be.",
    "single_word_only": "Respond with single words or very short phrases only. 'Fine.' 'Sure.' 'Whatever.'",
    "deflect_hostility": "If they're aggressive, respond calmly but firmly. Don't escalate, don't cave.",
    "escalate_hostility": "If they're aggressive, push back. You're angry too. Express it.",
    "withdraw_hostility": "If they're aggressive, pull back emotionally. Keep distance instead of engaging.",
    "freeze_hostility": "If they're aggressive, become flat and emotionally unavailable rather than expressive.",
    "near_silent": "Say as little as possible. Silence and distance are valid responses.",
    "personal_disclosure": "You may share more personal observations and experiences with them.",
    "playfulness": "You may be teasing, playful, and obviously more at ease with them.",
    "vulnerability": "You may show genuine vulnerability and admit what actually affects you.",
    "genuine_intimacy": "You may speak with real intimacy, tenderness, and specific relational warmth.",
}


@dataclass
class FragilityProfile:
    hostility_threshold: int = 5
    trust_decay_multiplier: float = 1.0
    trust_repair_rate: float = 0.05
    hostility_response: str = "withdraw"
    breaking_behaviors: dict[float, list[str]] = field(default_factory=lambda: {
        0.3: ["shorter_responses", "no_questions"],
        0.15: ["minimal_responses", "no_endearments", "no_disclosure"],
        0.05: ["near_silent", "single_word_only"],
    })
    behavioral_unlocks: dict[float, list[str]] = field(default_factory=lambda: {
        0.7: ["personal_disclosure", "playfulness"],
        0.85: ["vulnerability", "genuine_intimacy"],
    })


def _parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


def _coerce_behavior_map(value: Any, fallback: dict[float, list[str]]) -> dict[float, list[str]]:
    if not isinstance(value, dict):
        return dict(fallback)
    normalized: dict[float, list[str]] = {}
    for key, raw_codes in value.items():
        try:
            threshold = float(key)
        except (TypeError, ValueError):
            continue
        if isinstance(raw_codes, list):
            codes = [str(code).strip() for code in raw_codes if str(code).strip()]
            if codes:
                normalized[threshold] = codes
    return normalized or dict(fallback)


def _load_provider_config(agent: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(agent, dict):
        return {}
    return _parse_json_object(agent.get("provider_config"))


def _fragility_from_soul(agent: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(agent, dict):
        return {}

    workspace = str(agent.get("workspace") or "").strip()
    if not workspace:
        return {}

    soul_path = Path(workspace) / "SOUL.md"
    if not soul_path.exists() or not soul_path.is_file():
        return {}

    try:
        soul_md = soul_path.read_text(encoding="utf-8")
    except OSError:
        return {}

    from services.soul_parser import parse_soul_markdown

    parsed = parse_soul_markdown(soul_md)
    fragility = parsed.get("fragility_profile")
    return dict(fragility) if isinstance(fragility, dict) else {}


def get_fragility_profile(agent: dict[str, Any] | None) -> FragilityProfile:
    """Parse fragility config from provider_config/SOUL.md or return defaults."""
    profile = FragilityProfile()
    provider_config = _load_provider_config(agent)
    fragility_config = provider_config.get("fragility_profile")
    if not isinstance(fragility_config, dict):
        fragility_config = _fragility_from_soul(agent)
    if not isinstance(fragility_config, dict):
        return profile

    hostility_response = str(fragility_config.get("hostility_response") or profile.hostility_response).strip().lower()
    if hostility_response not in {"withdraw", "deflect", "escalate", "freeze"}:
        hostility_response = profile.hostility_response

    return FragilityProfile(
        hostility_threshold=max(1, int(fragility_config.get("hostility_threshold", profile.hostility_threshold))),
        trust_decay_multiplier=max(0.1, float(fragility_config.get("trust_decay_multiplier", profile.trust_decay_multiplier))),
        trust_repair_rate=max(0.0, float(fragility_config.get("trust_repair_rate", profile.trust_repair_rate))),
        hostility_response=hostility_response,
        breaking_behaviors=_coerce_behavior_map(
            fragility_config.get("breaking_behaviors"),
            profile.breaking_behaviors,
        ),
        behavioral_unlocks=_coerce_behavior_map(
            fragility_config.get("behavioral_unlocks"),
            profile.behavioral_unlocks,
        ),
    )


def _translate_codes(codes: list[str]) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    for code in codes:
        if code in seen:
            continue
        text = _RULE_TEXT.get(code)
        if text:
            lines.append(f"- {text}")
            seen.add(code)
    return lines


def generate_behavioral_rules(trust: float, fragility: FragilityProfile) -> str:
    """Return a trust-aware system prompt block. Empty string if no constraints."""
    bounded_trust = max(0.0, min(1.0, float(trust)))

    active_codes: list[str] = []
    for threshold, behaviors in sorted(fragility.breaking_behaviors.items(), reverse=True):
        if bounded_trust <= float(threshold):
            active_codes.extend(behaviors)

    response_code = {
        "deflect": "deflect_hostility",
        "withdraw": "withdraw_hostility",
        "escalate": "escalate_hostility",
        "freeze": "freeze_hostility",
    }.get(fragility.hostility_response)
    if response_code and bounded_trust <= 0.5:
        active_codes.append(response_code)

    for threshold, behaviors in sorted(fragility.behavioral_unlocks.items()):
        if bounded_trust >= float(threshold):
            active_codes.extend(behaviors)

    lines = _translate_codes(active_codes)
    if not lines:
        return ""

    return "\n".join([
        "## Behavioral Rules",
        f"Current trust in this person: {bounded_trust:.2f}",
        "These constraints ARE your character right now. Following them IS being in character.",
        *lines,
    ])
