"""Emotion taxonomy and shared constants."""
from __future__ import annotations

TRIGGER_TAXONOMY = {
    "positive": [
        "admiration",
        "amusement",
        "approval",
        "caring",
        "excitement",
        "gratitude",
        "joy",
        "love",
        "optimism",
        "pride",
        "relief",
    ],
    "negative": [
        "anger",
        "annoyance",
        "disappointment",
        "disapproval",
        "disgust",
        "fear",
        "grief",
        "sadness",
    ],
    "self_conscious": [
        "embarrassment",
        "nervousness",
        "remorse",
    ],
    "neutral": [
        "confusion",
        "curiosity",
        "realization",
        "surprise",
    ],
    "intimate": [
        "desire",
        "love",
        "caring",
    ],
}

SARCASM_POSITIVE_TRIGGERS = {
    "admiration",
    "approval",
    "gratitude",
    "joy",
    "love",
    "optimism",
    "pride",
    "relief",
}

SARCASM_NEGATIVE_TRIGGERS = {
    "anger",
    "annoyance",
    "disappointment",
    "disapproval",
    "disgust",
    "fear",
}

ALL_TRIGGERS: list[str] = []
for _group in TRIGGER_TAXONOMY.values():
    for _trigger in _group:
        if _trigger not in ALL_TRIGGERS:
            ALL_TRIGGERS.append(_trigger)
if "neutral" not in ALL_TRIGGERS:
    ALL_TRIGGERS.append("neutral")

TRIGGER_PRESET_MULTIPLIERS = {
    "threatening": -1.5,
    "uncomfortable": -0.5,
    "neutral": 0.0,
    "muted": 0.5,
    "normal": 1.0,
    "amplified": 1.5,
    "intense": 2.0,
}

DEFAULT_MOOD_INJECTION_SETTINGS = {
    "top_k": 3,
    "volatility_threshold": 0.3,
    "min_margin": 0.15,
    "random_strength": 0.7,
    "max_random_chance": 0.85,
}


def clamp_injection_settings(raw: dict | None) -> dict:
    """Clamp mood injection settings to safe runtime bounds."""
    merged = {**DEFAULT_MOOD_INJECTION_SETTINGS, **(raw or {})}

    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    def _as_int(value, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _as_float(value, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    return {
        "top_k": int(max(1, min(6, _as_int(merged.get("top_k"), DEFAULT_MOOD_INJECTION_SETTINGS["top_k"])))),
        "volatility_threshold": _clamp(
            _as_float(merged.get("volatility_threshold"), DEFAULT_MOOD_INJECTION_SETTINGS["volatility_threshold"]),
            0.0,
            1.0,
        ),
        "min_margin": _clamp(
            _as_float(merged.get("min_margin"), DEFAULT_MOOD_INJECTION_SETTINGS["min_margin"]),
            0.0,
            1.0,
        ),
        "random_strength": _clamp(
            _as_float(merged.get("random_strength"), DEFAULT_MOOD_INJECTION_SETTINGS["random_strength"]),
            0.0,
            2.0,
        ),
        "max_random_chance": _clamp(
            _as_float(merged.get("max_random_chance"), DEFAULT_MOOD_INJECTION_SETTINGS["max_random_chance"]),
            0.0,
            1.0,
        ),
    }


MOOD_GROUPS = {
    "warm":    {"moods": ["supportive", "euphoric", "vulnerable", "zen"], "color": "#4ade80", "label": "Warm & Caring"},
    "playful": {"moods": ["sassy", "whimsical", "flirty", "bashful"], "color": "#facc15", "label": "Playful & Light"},
    "sharp":   {"moods": ["snarky", "sarcastic", "defiant"], "color": "#f97316", "label": "Sharp & Edgy"},
    "dark":    {"moods": ["melancholic", "suspicious", "enraged"], "color": "#ef4444", "label": "Dark & Intense"},
    "wild":    {"moods": ["seductive", "erratic"], "color": "#a855f7", "label": "Wild & Unpredictable"},
}


LEGACY_TRIGGER_ALIASES = {
    "praise": "admiration",
    "compliment": "love",
    "gratitude": "gratitude",
    "affirmation": "approval",
    "comfort": "caring",
    "teasing": "amusement",
    "banter": "amusement",
    "flirting": "desire",
    "criticism": "disapproval",
    "rejection": "disgust",
    "boundary": "fear",
    "dismissal": "disappointment",
    "conflict": "anger",
    "apology": "remorse",
    "accountability": "remorse",
    "reconnection": "relief",
    "disclosure": "nervousness",
    "trust_signal": "love",
    "vulnerability": "embarrassment",
    "greeting": "joy",
    "farewell": "sadness",
    "curiosity": "curiosity",
    "shared_joy": "excitement",
    "insult": "disapproval",
    "betrayal": "disgust",
    "abandonment": "disgust",
    "argument": "anger",
    "accusation": "disapproval",
    "explanation": "realization",
    "repair": "relief",
    "confession": "nervousness",
    "secret": "nervousness",
    "question": "curiosity",
    "empathy_needed": "sadness",
}


def normalize_trigger(trigger: str) -> str | None:
    """Normalize trigger names to GoEmotions labels."""
    normalized = (trigger or "").strip().lower()
    if not normalized:
        return None
    if normalized in ALL_TRIGGERS:
        return normalized
    return LEGACY_TRIGGER_ALIASES.get(normalized)
