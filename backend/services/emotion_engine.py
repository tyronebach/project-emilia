"""
Emotional Engine — Core logic for persistent emotional state.

Processes triggers, applies decay, and computes behavior levers for LLM injection.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar, Optional
import json
import logging
import math
import re
import threading
import time as _time

# Lazy import httpx - only needed for LLM trigger detection
try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

logger = logging.getLogger(__name__)

def _load_moods_from_db() -> tuple[list[str], dict[str, tuple[float, float]]]:
    """Load mood list and valence/arousal map from the moods DB table."""
    from db.repositories import MoodRepository
    rows = MoodRepository.get_all()
    moods = []
    va_map = {}
    for row in rows:
        mood_id = row["id"]
        moods.append(mood_id)
        va_map[mood_id] = (row["valence"], row["arousal"])
    return moods, va_map


# Populated on first access (lazy) so DB is ready before we query.
# Thread-safe via lock to prevent duplicate init under concurrent access.
_moods_lock = threading.Lock()
_moods_cache: tuple[list[str], dict[str, tuple[float, float]]] | None = None


def _get_moods() -> tuple[list[str], dict[str, tuple[float, float]]]:
    global _moods_cache
    if _moods_cache is None:
        with _moods_lock:
            if _moods_cache is None:  # double-checked locking
                _moods_cache = _load_moods_from_db()
    return _moods_cache


def get_mood_list() -> list[str]:
    """Get the list of all mood IDs."""
    return _get_moods()[0]


def get_mood_valence_arousal() -> dict[str, tuple[float, float]]:
    """Get mood -> (valence, arousal) mapping."""
    return _get_moods()[1]


@dataclass
class EmotionalState:
    """Snapshot of emotional state."""
    valence: float = 0.0      # -1 (negative) to +1 (positive)
    arousal: float = 0.0      # -1 (calm) to +1 (activated)
    dominance: float = 0.0    # -1 (submissive) to +1 (dominant)
    trust: float = 0.5        # 0 to 1
    attachment: float = 0.3   # 0 to 1
    familiarity: float = 0.0  # 0 to 1
    mood_weights: dict = field(default_factory=dict)

    # V2: Relationship dimensions
    intimacy: float = 0.2
    playfulness_safety: float = 0.5
    conflict_tolerance: float = 0.7

    # V2: Per-trigger calibration (trigger_type -> ContextualTriggerCalibration or dict)
    trigger_calibration: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            'valence': self.valence,
            'arousal': self.arousal,
            'dominance': self.dominance,
            'trust': self.trust,
            'attachment': self.attachment,
            'familiarity': self.familiarity,
            'mood_weights': self.mood_weights,
            'intimacy': self.intimacy,
            'playfulness_safety': self.playfulness_safety,
            'conflict_tolerance': self.conflict_tolerance,
        }

    @classmethod
    def from_dict(cls, d: dict) -> 'EmotionalState':
        return cls(
            valence=d.get('valence', 0.0),
            arousal=d.get('arousal', 0.0),
            dominance=d.get('dominance', 0.0),
            trust=d.get('trust', 0.5),
            attachment=d.get('attachment', 0.3),
            familiarity=d.get('familiarity', 0.0),
            mood_weights=d.get('mood_weights', {}),
            intimacy=d.get('intimacy', 0.2),
            playfulness_safety=d.get('playfulness_safety', 0.5),
            conflict_tolerance=d.get('conflict_tolerance', 0.7),
        )

    @classmethod
    def from_db_row(cls, row: dict, calibrations: dict | None = None,
                    mood_weights: dict | None = None) -> 'EmotionalState':
        """Build EmotionalState from a DB row, handling None without clobbering 0.0.

        Unlike `or` which treats 0.0 as falsy, this uses the dataclass defaults
        only when the DB value is actually None (column missing or NULL).
        """
        def _v(key: str, default: float) -> float:
            val = row.get(key)
            return val if val is not None else default

        return cls(
            valence=_v('valence', 0.0),
            arousal=_v('arousal', 0.0),
            dominance=_v('dominance', 0.0),
            trust=_v('trust', 0.5),
            attachment=_v('attachment', 0.3),
            familiarity=_v('familiarity', 0.0),
            mood_weights=mood_weights if mood_weights is not None else (row.get('mood_weights') or {}),
            intimacy=_v('intimacy', 0.2),
            playfulness_safety=_v('playfulness_safety', 0.5),
            conflict_tolerance=_v('conflict_tolerance', 0.7),
            trigger_calibration=calibrations or {},
        )


@dataclass
class AgentProfile:
    """Agent's emotional personality configuration."""
    # Baseline axes (from agents table columns)
    baseline_valence: float = 0.2
    baseline_arousal: float = 0.0
    baseline_dominance: float = 0.0
    emotional_volatility: float = 0.5   # Multiplier on incoming deltas
    emotional_recovery: float = 0.1     # Decay speed toward baseline
    
    # Extended config (from emotional_profile JSON)
    decay_rates: dict = field(default_factory=lambda: {
        'valence': 0.1, 'arousal': 0.12, 'trust': 0.02, 'attachment': 0.01
    })
    trust_gain_multiplier: float = 1.0
    trust_loss_multiplier: float = 1.0
    attachment_ceiling: float = 1.0
    trigger_multipliers: dict = field(default_factory=dict)
    trigger_responses: dict = field(default_factory=dict)
    play_trust_threshold: float = 0.7
    mood_baseline: dict = field(default_factory=dict)
    mood_decay_rate: float = 0.3
    
    @classmethod
    def from_db(cls, agent_row: dict, profile_json: dict) -> 'AgentProfile':
        """Build profile from agents table row + parsed JSON profile."""
        def _v(key: str, default: float) -> float:
            val = agent_row.get(key)
            return val if val is not None else default

        return cls(
            baseline_valence=_v('baseline_valence', 0.2),
            baseline_arousal=_v('baseline_arousal', 0.0),
            baseline_dominance=_v('baseline_dominance', 0.0),
            emotional_volatility=_v('emotional_volatility', 0.5),
            emotional_recovery=_v('emotional_recovery', 0.1),
            decay_rates=profile_json.get('decay_rates', {
                'valence': 0.1, 'arousal': 0.12, 'trust': 0.02, 'attachment': 0.01
            }),
            trust_gain_multiplier=profile_json.get('trust_gain_multiplier', 1.0),
            trust_loss_multiplier=profile_json.get('trust_loss_multiplier', 1.0),
            attachment_ceiling=profile_json.get('attachment_ceiling', 1.0),
            trigger_multipliers=profile_json.get('trigger_multipliers', {}),
            trigger_responses=profile_json.get('trigger_responses', {}),
            play_trust_threshold=profile_json.get('play_trust_threshold', 0.7),
            mood_baseline=profile_json.get('mood_baseline', {}),
            mood_decay_rate=profile_json.get('mood_decay_rate', 0.3),
        )

    def get_trigger_deltas(self, trigger: str) -> dict[str, float]:
        """Get effective per-axis deltas for a trigger.

        Fallback chain:
        1. trigger_responses[trigger] → use per-axis overrides directly
        2. trigger_multipliers[trigger] → scale DEFAULT_TRIGGER_DELTAS
        3. DEFAULT_TRIGGER_DELTAS as-is (multiplier = 1.0)
        """
        from services.emotion_engine import EmotionEngine

        if trigger in self.trigger_responses:
            return {k: v for k, v in self.trigger_responses[trigger].items()
                    if k != 'preset'}

        mult = self.trigger_multipliers.get(trigger, 1.0)
        base = EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(trigger, {})
        return {axis: delta * mult for axis, delta in base.items()}


# ============================================================
# V2: Consolidated trigger taxonomy (15 triggers in 5 categories)
# ============================================================

TRIGGER_TAXONOMY = {
    "play": ["teasing", "banter", "flirting"],
    "care": ["comfort", "praise", "affirmation"],
    "friction": ["criticism", "rejection", "boundary", "dismissal"],
    "repair": ["apology", "accountability", "reconnection"],
    "vulnerability": ["disclosure", "trust_signal"],
}

ALL_TRIGGERS = [t for triggers in TRIGGER_TAXONOMY.values() for t in triggers]

# ============================================================
# Mood groups for UI organization + dot product projection
# ============================================================

MOOD_GROUPS = {
    "warm":    {"moods": ["supportive", "euphoric", "vulnerable", "zen"], "color": "#4ade80", "label": "Warm & Caring"},
    "playful": {"moods": ["sassy", "whimsical", "flirty", "bashful"], "color": "#facc15", "label": "Playful & Light"},
    "sharp":   {"moods": ["snarky", "sarcastic", "defiant"], "color": "#f97316", "label": "Sharp & Edgy"},
    "dark":    {"moods": ["melancholic", "suspicious", "enraged"], "color": "#ef4444", "label": "Dark & Intense"},
    "wild":    {"moods": ["seductive", "erratic"], "color": "#a855f7", "label": "Wild & Unpredictable"},
}


_normalized_mood_vectors: dict[str, tuple[float, float]] | None = None


def _get_normalized_mood_vectors() -> dict[str, tuple[float, float]]:
    """Get unit vectors for each mood's (V,A) position. Cached after first call."""
    global _normalized_mood_vectors
    if _normalized_mood_vectors is not None:
        return _normalized_mood_vectors

    import math
    va_map = get_mood_valence_arousal()
    result = {}
    for mood, (v, a) in va_map.items():
        magnitude = math.sqrt(v * v + a * a)
        if magnitude > 0.001:
            result[mood] = (v / magnitude, a / magnitude)
        else:
            result[mood] = (0.0, 0.0)
    _normalized_mood_vectors = result
    return result

TRIGGER_ALIASES = {
    "compliment": "praise",
    "gratitude": "praise",
    "insult": "criticism",
    "conflict": "boundary",
    "betrayal": "rejection",
    "abandonment": "rejection",
    "argument": "boundary",
    "accusation": "criticism",
    "explanation": "accountability",
    "repair": "reconnection",
    "vulnerability": "disclosure",
    "confession": "disclosure",
    "secret": "disclosure",
    "shared_joy": "affirmation",
    "greeting": None,
    "farewell": None,
    "question": None,
    "curiosity": None,
    "empathy_needed": None,
}


def normalize_trigger(trigger: str) -> str | None:
    """Convert legacy trigger to consolidated taxonomy. Returns None for unrecognized."""
    if trigger in ALL_TRIGGERS:
        return trigger
    return TRIGGER_ALIASES.get(trigger)


# ============================================================
# V2: Trigger calibration with Bayesian smoothing
# ============================================================

@dataclass
class TriggerCalibration:
    """Per-trigger learned response profile with Bayesian smoothing."""

    trigger_type: str

    positive_weight: float = 0.0
    negative_weight: float = 0.0
    neutral_weight: float = 0.0
    occurrence_count: int = 0

    PRIOR_POSITIVE: ClassVar[float] = 10.0
    PRIOR_NEGATIVE: ClassVar[float] = 10.0
    PRIOR_TOTAL: ClassVar[float] = 20.0
    MIN_SAMPLES: ClassVar[int] = 30

    learned_multiplier: float = 1.0
    last_occurrence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "trigger_type": self.trigger_type,
            "positive_weight": self.positive_weight,
            "negative_weight": self.negative_weight,
            "neutral_weight": self.neutral_weight,
            "occurrence_count": self.occurrence_count,
            "learned_multiplier": self.learned_multiplier,
            "last_occurrence": self.last_occurrence,
        }

    @classmethod
    def from_dict(cls, d: dict) -> TriggerCalibration:
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        cal.positive_weight = d.get("positive_weight", 0.0)
        cal.negative_weight = d.get("negative_weight", 0.0)
        cal.neutral_weight = d.get("neutral_weight", 0.0)
        cal.occurrence_count = d.get("occurrence_count", 0)
        cal.learned_multiplier = d.get("learned_multiplier", 1.0)
        cal.last_occurrence = d.get("last_occurrence", 0.0)
        return cal

    def update(self, outcome: str, confidence: float) -> None:
        """Update calibration with new observation, weighted by confidence."""
        self.occurrence_count += 1
        self.last_occurrence = _time.time()

        if outcome == "positive":
            self.positive_weight += confidence
        elif outcome == "negative":
            self.negative_weight += confidence
        else:
            self.neutral_weight += confidence * 0.5

        self.recompute_multiplier()

    def recompute_multiplier(self) -> None:
        """Compute multiplier using Bayesian estimate with priors."""
        pos = self.positive_weight + self.PRIOR_POSITIVE
        neg = self.negative_weight + self.PRIOR_NEGATIVE
        total = pos + neg

        rate = pos / total  # 0 (all negative) to 1 (all positive)

        # Map to multiplier: rate=0 -> 0.75, rate=0.5 -> 1.0, rate=1 -> 1.25
        raw_multiplier = 0.75 + 0.5 * rate

        # Confidence scaling: blend toward 1.0 until enough samples
        if self.occurrence_count < self.MIN_SAMPLES:
            blend = self.occurrence_count / self.MIN_SAMPLES
            self.learned_multiplier = 1.0 + (raw_multiplier - 1.0) * blend
        else:
            self.learned_multiplier = raw_multiplier

        self.learned_multiplier = max(0.5, min(1.5, self.learned_multiplier))


# ============================================================
# V2: Context-bucketed calibration
# ============================================================

@dataclass
class ContextBucket:
    """Context state for bucketed calibration."""
    trust_level: str      # "low" | "mid" | "high"
    arousal_level: str    # "calm" | "activated"
    recent_conflict: bool

    @classmethod
    def from_state(cls, state: EmotionalState) -> ContextBucket:
        return cls(
            trust_level="low" if state.trust < 0.4 else "high" if state.trust > 0.7 else "mid",
            arousal_level="calm" if state.arousal < 0.3 else "activated",
            recent_conflict=getattr(state, 'conflict_tolerance', 0.7) < 0.5,
        )

    def key(self) -> str:
        return f"{self.trust_level}_{self.arousal_level}_{'conflict' if self.recent_conflict else 'ok'}"


class ContextualTriggerCalibration:
    """Calibration that varies by relationship context."""

    def __init__(self, trigger_type: str):
        self.trigger_type = trigger_type
        self.buckets: dict[str, TriggerCalibration] = {}
        self.global_cal = TriggerCalibration(trigger_type=trigger_type)

    def get_multiplier(self, context: ContextBucket) -> float:
        """Get multiplier for current context, with fallback to global."""
        key = context.key()
        if key in self.buckets and self.buckets[key].occurrence_count >= 10:
            return self.buckets[key].learned_multiplier
        return self.global_cal.learned_multiplier

    def update(self, context: ContextBucket, outcome: str, confidence: float) -> None:
        """Update both global and context-specific calibration."""
        key = context.key()
        self.global_cal.update(outcome, confidence)
        if key not in self.buckets:
            self.buckets[key] = TriggerCalibration(trigger_type=self.trigger_type)
        self.buckets[key].update(outcome, confidence)

    def to_dict(self) -> dict:
        return {
            "trigger_type": self.trigger_type,
            "global": self.global_cal.to_dict(),
            "buckets": {k: v.to_dict() for k, v in self.buckets.items()},
        }

    @classmethod
    def from_dict(cls, d: dict) -> ContextualTriggerCalibration:
        cal = cls(trigger_type=d.get("trigger_type", "unknown"))
        if "global" in d:
            cal.global_cal = TriggerCalibration.from_dict(d["global"])
        if "buckets" in d:
            cal.buckets = {k: TriggerCalibration.from_dict(v) for k, v in d["buckets"].items()}
        return cal


# ============================================================
# V2: Outcome inference (multi-signal)
# ============================================================

@dataclass
class OutcomeSignal:
    """A single signal contributing to outcome inference."""
    source: str
    direction: str   # "positive", "negative", "neutral"
    weight: float
    confidence: float


POSITIVE_EXPLICIT = {"lol", "\U0001f602", "haha", "hehe", "love that", "perfect", "yes!",
                     "\u2764\ufe0f", "\U0001f970", "\U0001f60d", "amazing", "thank you", "thanks"}
NEGATIVE_EXPLICIT = {"stop", "don't", "that hurt", "not funny", "rude", "wtf",
                     "\U0001f622", "\U0001f620", "ugh", "annoying", "shut up", "go away"}

CONFIDENCE_THRESHOLD = 0.5


def infer_outcome_multisignal(
    next_user_message: str | None,
    agent_behavior: dict,
    response_latency_ms: int | None = None,
) -> tuple[str, float]:
    """
    Infer outcome from multiple signals.

    Returns (outcome, confidence). Only update calibration if confidence >= CONFIDENCE_THRESHOLD.
    """
    signals: list[OutcomeSignal] = []

    if next_user_message:
        msg_lower = next_user_message.lower()
        for phrase in POSITIVE_EXPLICIT:
            if phrase in msg_lower:
                signals.append(OutcomeSignal("user_explicit", "positive", 0.9, 0.85))
                break
        for phrase in NEGATIVE_EXPLICIT:
            if phrase in msg_lower:
                signals.append(OutcomeSignal("user_explicit", "negative", 0.9, 0.85))
                break

    if response_latency_ms is not None:
        if response_latency_ms < 5000:
            signals.append(OutcomeSignal("user_behavior", "positive", 0.3, 0.6))
        elif response_latency_ms > 120000:
            signals.append(OutcomeSignal("user_behavior", "negative", 0.3, 0.5))

    mood = agent_behavior.get("mood", "").lower()
    # Derive mood sentiment from MOOD_GROUPS (matches actual DB mood IDs)
    _positive_groups = {"warm", "playful"}
    _negative_groups = {"sharp", "dark"}
    positive_moods = {m for g, info in MOOD_GROUPS.items() if g in _positive_groups for m in info["moods"]}
    negative_moods = {m for g, info in MOOD_GROUPS.items() if g in _negative_groups for m in info["moods"]}

    if mood in positive_moods:
        signals.append(OutcomeSignal("agent_tag", "positive", 0.4, 0.5))
    elif mood in negative_moods:
        signals.append(OutcomeSignal("agent_tag", "negative", 0.4, 0.5))

    if not signals:
        return ("neutral", 0.3)

    pos_score = sum(s.weight * s.confidence for s in signals if s.direction == "positive")
    neg_score = sum(s.weight * s.confidence for s in signals if s.direction == "negative")

    if pos_score > neg_score * 1.2:
        confidence = min(0.95, pos_score / (pos_score + neg_score + 0.1))
        return ("positive", confidence)
    elif neg_score > pos_score * 1.2:
        confidence = min(0.95, neg_score / (pos_score + neg_score + 0.1))
        return ("negative", confidence)

    return ("neutral", 0.4)


# ============================================================
# V2: Calibration recovery (reversibility hooks)
# ============================================================

class CalibrationRecovery:
    """Mechanisms to prevent irreversible calibration drift."""

    REPAIR_WINDOW_HOURS: float = 24.0
    REPAIR_BOOST: float = 1.5
    DECAY_RATE_PER_WEEK: float = 0.05

    @staticmethod
    def apply_repair_boost(confidence: float, state: EmotionalState, outcome: str) -> float:
        """Boost positive outcomes during repair window (after conflict)."""
        if outcome != "positive":
            return confidence
        if getattr(state, 'conflict_tolerance', 0.7) < 0.5:
            return confidence * CalibrationRecovery.REPAIR_BOOST
        return confidence

    @staticmethod
    def apply_decay_to_neutral(calibration: TriggerCalibration, hours_since_last: float) -> None:
        """Decay calibration toward 1.0 if unused for weeks."""
        if hours_since_last < 24 * 7:
            return
        weeks_inactive = hours_since_last / (24 * 7)
        decay = min(0.3, CalibrationRecovery.DECAY_RATE_PER_WEEK * weeks_inactive)
        calibration.learned_multiplier = (
            calibration.learned_multiplier * (1 - decay) + 1.0 * decay
        )


# ============================================================
# V2: Relationship dimension update rules
# ============================================================

DIMENSION_UPDATES: dict[str, dict[tuple[str, str], float]] = {
    "trust": {
        ("praise", "positive"):       +0.02,
        ("affirmation", "positive"):  +0.02,
        ("accountability", "positive"): +0.04,
        ("disclosure", "positive"):   +0.03,
        ("rejection", "any"):         -0.08,
        ("dismissal", "any"):         -0.05,
        ("boundary", "negative"):     -0.06,
    },
    "intimacy": {
        ("disclosure", "positive"):   +0.05,
        ("comfort", "positive"):      +0.02,
        ("trust_signal", "positive"): +0.03,
        ("disclosure", "negative"):   -0.04,
        ("rejection", "any"):         -0.03,
    },
    "playfulness_safety": {
        ("teasing", "positive"):      +0.04,
        ("banter", "positive"):       +0.03,
        ("flirting", "positive"):     +0.02,
        ("teasing", "negative"):      -0.06,
        ("banter", "negative"):       -0.04,
        ("flirting", "negative"):     -0.03,
    },
    "conflict_tolerance": {
        ("apology", "positive"):      +0.03,
        ("accountability", "positive"): +0.04,
        ("reconnection", "positive"): +0.05,
        ("criticism", "any"):         -0.03,
        ("boundary", "any"):          -0.04,
        ("rejection", "any"):         -0.05,
    },
}


class EmotionEngine:
    """
    Core emotional processing engine.

    Handles trigger detection, delta application, decay, and behavior lever computation.
    """
    
    # Default trigger -> delta mappings
    DEFAULT_TRIGGER_DELTAS: dict[str, dict[str, float]] = {
        'compliment': {'valence': 0.15, 'arousal': 0.05, 'trust': 0.02},
        'affirmation': {'valence': 0.10, 'arousal': 0.03, 'trust': 0.03},
        'rejection': {'valence': -0.20, 'arousal': 0.10, 'trust': -0.05},
        'teasing': {'valence': 0.05, 'arousal': 0.10, 'trust': 0.01},
        'conflict': {'valence': -0.25, 'arousal': 0.30, 'trust': -0.10},
        'criticism': {'valence': -0.12, 'arousal': 0.08, 'trust': -0.03},
        'comfort': {'valence': 0.20, 'arousal': -0.10, 'trust': 0.05},
        'gratitude': {'valence': 0.12, 'arousal': 0.05, 'trust': 0.02},
        'apology': {'valence': 0.08, 'arousal': -0.05, 'trust': 0.03},
        'repair': {'valence': 0.10, 'arousal': -0.05, 'trust': 0.02},
        'dismissal': {'valence': -0.10, 'arousal': -0.05, 'trust': -0.02},
        'curiosity': {'valence': 0.05, 'arousal': 0.08, 'trust': 0.01},
        'shared_joy': {'valence': 0.18, 'arousal': 0.15, 'trust': 0.02, 'attachment': 0.02},
        'vulnerability': {'valence': 0.05, 'arousal': 0.05, 'trust': 0.05, 'attachment': 0.03},
        'greeting': {'valence': 0.08, 'arousal': 0.05, 'trust': 0.01},
        'farewell': {'valence': 0.02, 'arousal': -0.05, 'attachment': 0.01},
        # V2 taxonomy triggers (complete coverage)
        'banter': {'valence': 0.08, 'arousal': 0.12, 'trust': 0.02},
        'flirting': {'valence': 0.12, 'arousal': 0.15, 'trust': 0.02, 'intimacy': 0.03},
        'praise': {'valence': 0.15, 'arousal': 0.05, 'trust': 0.02},
        'boundary': {'valence': -0.10, 'arousal': 0.15, 'trust': -0.04},
        'accountability': {'valence': 0.05, 'arousal': -0.03, 'trust': 0.04},
        'reconnection': {'valence': 0.10, 'arousal': -0.05, 'trust': 0.02},
        'trust_signal': {'valence': 0.08, 'arousal': -0.05, 'trust': 0.06, 'intimacy': 0.02},
        'disclosure': {'valence': 0.05, 'arousal': 0.05, 'trust': 0.05, 'attachment': 0.03},
    }
    
    # Pattern-based trigger detection
    TRIGGER_PATTERNS: dict[str, list[str]] = {
        'compliment': [
            r'\b(amazing|wonderful|great|awesome|incredible|fantastic)\b',
            r'\b(love you|adore you|proud of you)\b',
            r'\b(you.re|you are) (so |really )?(smart|kind|sweet|beautiful|cute|talented)\b',
            r'\b(best|favorite)\b.{0,20}\b(ever|always)\b',
        ],
        'gratitude': [
            r'\b(thank you|thanks|thx|ty|appreciate)\b',
            r'\b(grateful|thankful)\b',
        ],
        'teasing': [
            r'\b(haha|hehe|lol|lmao|rofl)\b',
            r'\b(just kidding|jk|joking)\b',
            r'\b(silly|dummy|dork|nerd)\b',
        ],
        'comfort': [
            r'\b(it.s okay|it.s ok|it.s alright|don.t worry)\b',
            r'\b(i.m here|here for you|got you)\b',
            r'\b(there there|it.ll be)\b',
        ],
        'conflict': [
            r'\b(angry|furious|upset|mad) (at|with) (you|me)\b',
            r'\b(hate|can.t stand)\b',
            r'\b(how could you|why did you|what.s wrong with you)\b',
        ],
        'criticism': [
            r'\b(not what i asked|wrong|incorrect|mistake)\b',
            r'\b(you (always|never)|that.s not|that wasn.t)\b',
            r'\b(disappointed|let me down|could.ve been better)\b',
            r'\b(useless|unhelpful|pointless)\b',
        ],
        'dismissal': [
            r'\b(don.t need you|don.t need your|don.t want your)\b',
            r'\b(i.m fine|i.ll handle it|i.ll do it myself)\b',
            r'\b(not now|maybe later|another time)\b',
        ],
        'repair': [
            r'\b(come back|wait|hold on|sorry i)\b',
            r'\b(didn.t mean|that came out wrong|let me explain)\b',
            r'\b(can we talk|let.s talk|work this out)\b',
        ],
        'rejection': [
            r'\b(don.t care|go away|leave me alone|shut up)\b',
            r'\b(whatever|who cares|doesn.t matter)\b',
        ],
        'apology': [
            r'\b(i.m sorry|my bad|my fault|forgive me)\b',
            r'\b(apologize|apologies)\b',
        ],
        'greeting': [
            r'^(hi|hey|hello|yo|sup|hiya|good morning|good evening)\b',
        ],
        'farewell': [
            r'\b(bye|goodbye|good night|see you|later|gotta go)\b',
        ],
        'curiosity': [
            r'\b(tell me about|what.s your|how do you feel|what do you think)\b',
            r'\b(curious|wondering|interested)\b',
        ],
        'vulnerability': [
            r'\b(i trust you|only you|between us|secret)\b',
            r'\b(never told anyone|first time telling)\b',
        ],
    }
    
    # Compile patterns for efficiency
    _compiled_patterns: dict[str, list[re.Pattern]] = {}
    
    def __init__(self, profile: AgentProfile):
        self.profile = profile
        self._compile_patterns()
    
    def _compile_patterns(self) -> None:
        """Compile regex patterns once."""
        if not EmotionEngine._compiled_patterns:
            for trigger, patterns in self.TRIGGER_PATTERNS.items():
                EmotionEngine._compiled_patterns[trigger] = [
                    re.compile(p, re.IGNORECASE) for p in patterns
                ]
    
    def apply_decay(self, state: EmotionalState, elapsed_seconds: float) -> EmotionalState:
        """
        Apply temporal decay toward baseline using exponential decay.

        Formula: new = baseline + (current - baseline) * exp(-rate * recovery * hours)
        This guarantees monotonic convergence without overshooting the baseline.
        """
        if elapsed_seconds <= 0:
            return state

        hours = elapsed_seconds / 3600.0

        # Get per-axis decay rates
        rates = self.profile.decay_rates
        recovery = self.profile.emotional_recovery

        # Exponential decay: always converges, never overshoots
        def decay_axis(current: float, baseline: float, rate: float) -> float:
            return baseline + (current - baseline) * math.exp(-rate * recovery * hours)

        state.valence = self._clamp(
            decay_axis(state.valence, self.profile.baseline_valence, rates.get('valence', 0.1)),
            -1.0, 1.0
        )
        state.arousal = self._clamp(
            decay_axis(state.arousal, self.profile.baseline_arousal, rates.get('arousal', 0.12)),
            -1.0, 1.0
        )
        state.dominance = self._clamp(
            decay_axis(state.dominance, self.profile.baseline_dominance, rates.get('dominance', 0.1)),
            -1.0, 1.0
        )

        # Trust/attachment decay very slowly (toward baseline 0.5/0.3)
        state.trust = self._clamp(
            decay_axis(state.trust, 0.5, rates.get('trust', 0.02)),
            0.0, 1.0
        )
        state.attachment = self._clamp(
            decay_axis(state.attachment, 0.3, rates.get('attachment', 0.01)),
            0.0, self.profile.attachment_ceiling
        )

        return state
    
    def detect_triggers(self, text: str) -> list[tuple[str, float]]:
        """
        Detect emotional triggers from text.
        
        Returns list of (trigger_name, intensity) tuples.
        """
        if not text:
            return []
        
        triggers = []
        text_lower = text.lower()
        
        for trigger, patterns in EmotionEngine._compiled_patterns.items():
            for pattern in patterns:
                match = pattern.search(text_lower)
                if match:
                    # Base intensity 0.7, could be refined later
                    intensity = 0.7
                    triggers.append((trigger, intensity))
                    break  # One match per trigger type
        
        return triggers

    async def detect_triggers_llm(self, text: str) -> list[tuple[str, float]]:
        """
        Detect emotional triggers using LLM classification.

        Sends the user message to the LLM with a structured prompt asking it
        to identify emotional triggers and their intensities. Falls back to
        regex-based detection on any failure.

        Returns list of (trigger_name, intensity) tuples.
        """
        if not text or not text.strip():
            return []

        from config import settings

        valid_triggers = list(self.DEFAULT_TRIGGER_DELTAS.keys())

        prompt = (
            "Classify the emotional triggers in this user message. "
            f"Valid triggers: {', '.join(valid_triggers)}. "
            "Return a JSON array of objects with 'trigger' (string) and "
            "'intensity' (float 0.0-1.0). Return [] if no triggers found. "
            "Only return the JSON array, nothing else."
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.compact_model,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": text},
                        ],
                        "temperature": 0.0,
                        "max_tokens": 256,
                    },
                )
                response.raise_for_status()

            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = json.loads(content)

            if not isinstance(parsed, list):
                logger.warning("[EmotionLLM] Expected list, got %s", type(parsed).__name__)
                return self.detect_triggers(text)

            triggers = []
            for item in parsed:
                trigger = item.get("trigger", "")
                intensity = float(item.get("intensity", 0.7))
                if trigger in self.DEFAULT_TRIGGER_DELTAS:
                    intensity = max(0.0, min(1.0, intensity))
                    triggers.append((trigger, intensity))
                else:
                    logger.debug("[EmotionLLM] Ignoring unknown trigger: %s", trigger)

            logger.info("[EmotionLLM] Detected triggers: %s", triggers)
            return triggers

        except Exception:
            logger.exception("[EmotionLLM] LLM trigger detection failed, falling back to regex")
            return self.detect_triggers(text)

    async def detect_triggers_llm_batch(self, messages: list[str]) -> list[tuple[str, float]]:
        """
        Detect emotional triggers from multiple messages in a single LLM call.
        
        More efficient than calling detect_triggers_llm for each message.
        Returns combined list of (trigger_name, intensity) tuples.
        """
        if not messages:
            return []

        # Filter empty messages
        messages = [m for m in messages if m and m.strip()]
        if not messages:
            return []

        from config import settings

        valid_triggers = list(self.DEFAULT_TRIGGER_DELTAS.keys())
        
        # Format messages with numbers for clarity
        numbered_messages = "\n".join(f"{i+1}. {m}" for i, m in enumerate(messages))

        prompt = (
            "Classify the emotional triggers in these user messages. "
            f"Valid triggers: {', '.join(valid_triggers)}. "
            "Return a JSON array of objects with 'trigger' (string) and "
            "'intensity' (float 0.0-1.0). Combine triggers across all messages. "
            "If the same trigger appears multiple times, average the intensities. "
            "Return [] if no triggers found. Only return the JSON array."
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{settings.clawdbot_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.clawdbot_token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.compact_model,
                        "messages": [
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": numbered_messages},
                        ],
                        "temperature": 0.0,
                        "max_tokens": 512,
                    },
                )
                response.raise_for_status()

            result = response.json()
            content = result["choices"][0]["message"]["content"].strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = json.loads(content)

            if not isinstance(parsed, list):
                logger.warning("[EmotionLLM-Batch] Expected list, got %s", type(parsed).__name__)
                return []

            triggers = []
            for item in parsed:
                trigger = item.get("trigger", "")
                intensity = float(item.get("intensity", 0.7))
                if trigger in self.DEFAULT_TRIGGER_DELTAS:
                    intensity = max(0.0, min(1.0, intensity))
                    triggers.append((trigger, intensity))

            logger.info("[EmotionLLM-Batch] Detected triggers from %d messages: %s", 
                       len(messages), triggers)
            return triggers

        except Exception:
            logger.exception("[EmotionLLM-Batch] Batch trigger detection failed")
            return []

    def apply_trigger(self, state: EmotionalState, trigger: str, intensity: float = 0.7) -> dict[str, float]:
        """
        Apply a trigger's emotional deltas to state.

        Returns dict of deltas that were applied.
        """
        # Get base deltas (respects trigger_responses > trigger_multipliers > defaults)
        base_deltas = self.profile.get_trigger_deltas(trigger)
        if not base_deltas:
            return {}

        # Check play/vulnerability context modulation
        intensity = self._check_category_context(trigger, state, intensity)

        # Calculate effective deltas
        volatility = self.profile.emotional_volatility
        applied_deltas = {}

        for axis, raw_delta in base_deltas.items():
            effective_delta = raw_delta * intensity * volatility
            
            # Special handling for trust (asymmetric)
            if axis == 'trust':
                effective_delta = self._apply_trust_delta_modifier(effective_delta)
            
            applied_deltas[axis] = effective_delta
            
            # Apply to state
            current = getattr(state, axis)
            new_value = current + effective_delta
            
            # Clamp based on axis type
            if axis in ('valence', 'arousal', 'dominance'):
                new_value = self._clamp(new_value, -1.0, 1.0)
            elif axis == 'attachment':
                new_value = self._clamp(new_value, 0.0, self.profile.attachment_ceiling)
            else:
                new_value = self._clamp(new_value, 0.0, 1.0)
            
            setattr(state, axis, new_value)
        
        # Increment familiarity slightly with each interaction
        state.familiarity = self._clamp(state.familiarity + 0.005, 0.0, 1.0)
        
        return applied_deltas
    
    # ============================================================
    # V2 Methods
    # ============================================================

    def compute_effective_delta(
        self,
        trigger: str,
        raw_intensity: float,
        state: EmotionalState,
        calibration: ContextualTriggerCalibration | None,
    ) -> float:
        """
        Compute final intensity with all three layers.

        delta = raw x DNA_sensitivity x bond_mod x user_multiplier
        """
        # Layer 1: DNA sensitivity (personality)
        # When trigger_responses exist, the direction is baked in so sensitivity is 1.0
        if trigger in self.profile.trigger_responses:
            dna_sensitivity = 1.0
        else:
            dna_sensitivity = self.profile.trigger_multipliers.get(trigger, 1.0)

        # Layer 2: Bond modifier (relationship state)
        base_deltas = self.profile.get_trigger_deltas(trigger)
        is_positive_trigger = base_deltas.get("valence", 0) > 0

        if is_positive_trigger:
            bond_mod = 0.7 + (state.trust * 0.6)  # 0.7 to 1.3
        else:
            bond_mod = 1.3 - (state.trust * 0.6)  # 1.3 to 0.7

        # Intimacy amplifies vulnerability triggers
        if trigger in ("disclosure", "comfort", "trust_signal"):
            intimacy = getattr(state, 'intimacy', 0.2)
            bond_mod *= 0.8 + (intimacy * 0.4)

        # Layer 3: User calibration (context-aware)
        if calibration:
            context = ContextBucket.from_state(state)
            user_multiplier = calibration.get_multiplier(context)
        else:
            user_multiplier = 1.0

        effective = raw_intensity * dna_sensitivity * bond_mod * user_multiplier
        return max(0.1, min(3.0, effective))

    def apply_trigger_calibrated(
        self,
        state: EmotionalState,
        trigger: str,
        raw_intensity: float,
        calibration: ContextualTriggerCalibration | None = None,
    ) -> dict[str, float]:
        """Apply trigger with full three-layer scaling."""
        effective_intensity = self.compute_effective_delta(
            trigger, raw_intensity, state, calibration
        )
        return self.apply_trigger(state, trigger, effective_intensity)

    def learn_from_outcome(
        self,
        state: EmotionalState,
        triggers: list[tuple[str, float]],
        outcome: str,
        confidence: float,
    ) -> dict[str, ContextualTriggerCalibration]:
        """
        Update trigger calibrations based on interaction outcome.

        Only updates if confidence >= CONFIDENCE_THRESHOLD.
        Returns updated calibrations for persistence.
        """
        updated: dict[str, ContextualTriggerCalibration] = {}

        if confidence < CONFIDENCE_THRESHOLD:
            logger.debug("[Learn] Skipping update, confidence %.2f < %.2f",
                         confidence, CONFIDENCE_THRESHOLD)
            return updated

        # Apply repair boost
        confidence = CalibrationRecovery.apply_repair_boost(confidence, state, outcome)

        context = ContextBucket.from_state(state)

        for trigger_type, _intensity in triggers:
            # Normalize to V2 taxonomy
            canonical = normalize_trigger(trigger_type)
            if not canonical:
                continue

            # Get or create calibration
            if canonical not in state.trigger_calibration:
                state.trigger_calibration[canonical] = ContextualTriggerCalibration(canonical)

            cal = state.trigger_calibration[canonical]
            if isinstance(cal, dict):
                cal = ContextualTriggerCalibration.from_dict(cal)
                state.trigger_calibration[canonical] = cal

            cal.update(context, outcome, confidence)
            updated[canonical] = cal

            logger.info("[Learn] %s: %s (conf=%.2f) -> multiplier=%.2f",
                        canonical, outcome, confidence, cal.global_cal.learned_multiplier)

        return updated

    def update_relationship_dimensions(
        self,
        state: EmotionalState,
        triggers: list[tuple[str, float]],
        outcome: str,
    ) -> dict[str, float]:
        """Update relationship dimensions with crisp trigger-based rules."""
        deltas: dict[str, float] = {}

        for trigger, intensity in triggers:
            canonical = normalize_trigger(trigger)
            if not canonical:
                continue

            for dimension, rules in DIMENSION_UPDATES.items():
                key = (canonical, outcome)
                if key in rules:
                    delta = rules[key] * intensity
                elif (canonical, "any") in rules:
                    delta = rules[(canonical, "any")] * intensity
                else:
                    continue

                # Apply personality modifiers for trust
                if dimension == "trust":
                    if delta > 0:
                        delta *= self.profile.trust_gain_multiplier
                    else:
                        delta *= self.profile.trust_loss_multiplier

                current = getattr(state, dimension, 0.5)
                new_value = max(0.0, min(1.0, current + delta))
                setattr(state, dimension, new_value)

                deltas[dimension] = deltas.get(dimension, 0) + delta

        return deltas

    def _apply_trust_delta_modifier(self, delta: float) -> float:
        """Apply asymmetric trust change (negative changes are larger)."""
        if delta > 0:
            # Positive trust change: slow, reduced
            return delta * 0.3 * self.profile.trust_gain_multiplier
        else:
            # Negative trust change: faster, amplified
            return delta * 1.5 * self.profile.trust_loss_multiplier
    
    def _check_category_context(self, trigger: str, state: EmotionalState, intensity: float) -> float:
        """Adjust trigger intensity based on relationship context.

        Play triggers: trust-gated modulation.
        Vulnerability triggers: intimacy-gated modulation.
        """
        # Play triggers: trust-gated (clamped to >= 0 to prevent negative spiral)
        if trigger in ('teasing', 'banter', 'flirting'):
            if state.trust >= self.profile.play_trust_threshold:
                return abs(intensity) * 0.8   # safe: bonding
            elif state.trust >= 0.4:
                return abs(intensity) * 0.2   # cautious
            else:
                return 0.0  # too risky: suppress entirely (prevents trust spiral)

        # Vulnerability triggers: intimacy-gated
        if trigger in ('disclosure', 'trust_signal'):
            intimacy = getattr(state, 'intimacy', 0.2)
            if intimacy > 0.6:
                return abs(intensity) * 1.2   # safe to be vulnerable
            elif intimacy > 0.3:
                return abs(intensity) * 0.6   # cautious opening
            else:
                return abs(intensity) * 0.3   # too early, dampened

        return intensity
    
    def calculate_mood_deltas_from_va(self, va_delta: dict[str, float]) -> dict[str, float]:
        """Derive mood weight shifts from V/A deltas using dot product projection.

        For each mood, computes dot(delta_vector, mood_unit_vector).
        Positive dot = mood aligns with the delta direction → weight increases.
        Negative dot = mood opposes → weight decreases.
        """
        dv = va_delta.get('valence', 0.0)
        da = va_delta.get('arousal', 0.0)
        if abs(dv) < 0.001 and abs(da) < 0.001:
            return {}

        vectors = _get_normalized_mood_vectors()
        mood_deltas: dict[str, float] = {}
        for mood, (uv, ua) in vectors.items():
            dot = dv * uv + da * ua
            if abs(dot) > 0.001:
                mood_deltas[mood] = dot
        return mood_deltas

    def calculate_mood_deltas(
        self,
        triggers: list[tuple[str, float]],
        trigger_mood_map: dict,
    ) -> dict[str, float]:
        """Calculate mood weight changes from triggers.

        DEPRECATED: Use calculate_mood_deltas_from_va() instead.
        This method used the old trigger_mood_map config surface which is no longer needed.
        """
        all_moods = get_mood_list()
        mood_deltas = {mood: 0.0 for mood in all_moods}

        for trigger, intensity in triggers:
            if trigger in trigger_mood_map:
                for mood, weight in trigger_mood_map[trigger].items():
                    if mood in all_moods:
                        mood_deltas[mood] += weight * intensity

        return mood_deltas

    def apply_mood_deltas(self, state: EmotionalState, mood_deltas: dict) -> None:
        """Apply mood deltas with volatility scaling.

        V/A is now driven by triggers directly, not back-derived from moods.
        """
        if not state.mood_weights:
            state.mood_weights = {mood: self.profile.mood_baseline.get(mood, 0) for mood in get_mood_list()}

        for mood, delta in mood_deltas.items():
            effective_delta = delta * self.profile.emotional_volatility
            current = state.mood_weights.get(mood, 0)
            state.mood_weights[mood] = self._clamp(current + effective_delta, -10, 20)

    def _update_valence_arousal_from_moods(self, state: EmotionalState) -> None:
        """Derive valence/arousal from mood weights."""
        total_weight = sum(max(0, w) for w in state.mood_weights.values()) or 1

        va_map = get_mood_valence_arousal()
        valence = sum(
            va_map.get(mood, (0, 0))[0] * max(0, weight)
            for mood, weight in state.mood_weights.items()
        ) / total_weight

        arousal = sum(
            va_map.get(mood, (0, 0))[1] * max(0, weight)
            for mood, weight in state.mood_weights.items()
        ) / total_weight

        # Blend with existing (don't completely override)
        state.valence = self._clamp(state.valence * 0.3 + valence * 0.7, -1, 1)
        state.arousal = self._clamp(state.arousal * 0.3 + arousal * 0.7, -1, 1)

    def apply_mood_decay(self, state: EmotionalState, elapsed_seconds: float) -> None:
        """Decay mood weights toward baseline."""
        if not state.mood_weights:
            return

        hours = elapsed_seconds / 3600
        decay_rate = self.profile.mood_decay_rate
        baseline = self.profile.mood_baseline

        for mood in get_mood_list():
            current = state.mood_weights.get(mood, 0)
            target = baseline.get(mood, 0)
            state.mood_weights[mood] = target + (current - target) * math.exp(-decay_rate * hours)

    def get_dominant_moods(self, state: EmotionalState, top_n: int = 3) -> list[tuple[str, float]]:
        """Get top N moods by current weight."""
        if not state.mood_weights:
            return []

        sorted_moods = sorted(
            state.mood_weights.items(),
            key=lambda x: x[1],
            reverse=True,
        )
        return [(m, w) for m, w in sorted_moods[:top_n] if w > 0]

    def get_behavior_levers(self, state: EmotionalState) -> dict[str, float]:
        """
        Convert emotional state to LLM-injectable behavior levers.
        
        Returns warmth, playfulness, guardedness (0-1 scale).
        """
        # Warmth: positive valence + trust
        warmth = ((state.valence + 1) / 2) * state.trust
        warmth = self._clamp(warmth, 0.0, 1.0)
        
        # Guardedness: inverse of trust + negative valence effect
        guardedness = (1 - state.trust) * 0.5 + max(0, -state.valence) * 0.3
        guardedness = self._clamp(guardedness, 0.0, 1.0)
        
        # Playfulness: positive arousal + low guardedness
        playfulness = max(0, (state.arousal + 0.5) / 1.5) * (1 - guardedness * 0.5)
        playfulness = self._clamp(playfulness, 0.0, 1.0)
        
        return {
            'warmth': round(warmth, 2),
            'playfulness': round(playfulness, 2),
            'guardedness': round(guardedness, 2),
        }
    
    def generate_context_block(self, state: EmotionalState) -> str:
        """Generate rich emotional context block for LLM prompt injection."""
        # Dominant moods
        dominant = self.get_dominant_moods(state, top_n=2)
        if dominant:
            primary, weight = dominant[0]
            intensity = "strongly" if weight > 10 else "somewhat" if weight > 5 else "slightly"
            mood_desc = f"{intensity} {primary}"
            if len(dominant) > 1:
                mood_desc += f", with hints of {dominant[1][0]}"
        else:
            mood_desc = "emotionally neutral"

        # Trust description
        if state.trust > 0.8:
            trust_desc = "deeply bonded, would share anything"
        elif state.trust > 0.6:
            trust_desc = "comfortable and safe"
        elif state.trust > 0.4:
            trust_desc = "warming up, cautiously open"
        elif state.trust > 0.2:
            trust_desc = "guarded, testing the waters"
        else:
            trust_desc = "wary, walls up"

        # Intimacy description
        intimacy = getattr(state, 'intimacy', 0.2)
        if intimacy > 0.7:
            intimacy_desc = "emotionally close"
        elif intimacy > 0.4:
            intimacy_desc = "growing closer"
        else:
            intimacy_desc = "still surface-level"

        # Playfulness
        play = getattr(state, 'playfulness_safety', 0.5)
        if play > 0.7:
            play_desc = "teasing is safe and bonding"
        elif play > 0.4:
            play_desc = "light teasing is okay"
        else:
            play_desc = "be careful with teasing"

        trigger_hints = self._get_trigger_personality_hints()

        block = f"""[EMOTIONAL_STATE]
You're feeling {mood_desc}.

Valence: {state.valence:+.0%} | Energy: {abs(state.arousal):.0%} {"high" if state.arousal > 0.3 else "calm"}
Trust: {state.trust:.0%} — {trust_desc}
Intimacy: {intimacy:.0%} — {intimacy_desc}
Dynamic: {play_desc}"""

        if trigger_hints:
            block += f"\nTrigger personality: {trigger_hints}"

        block += "\n\nLet this color your tone naturally — don't mention these explicitly.\n[/EMOTIONAL_STATE]"
        return block

    def _get_trigger_personality_hints(self) -> str:
        """Generate natural-language hints about non-default trigger responses."""
        if not self.profile.trigger_responses:
            return ""

        PRESET_FEELINGS = {
            'threatening': 'feels threatening',
            'uncomfortable': 'feels uncomfortable',
            'neutral': 'has no effect',
            'muted': 'barely registers',
            'normal': None,  # default, skip
            'amplified': 'feels strongly',
            'intense': 'feels very intensely',
        }

        hints = []
        for trigger, resp in self.profile.trigger_responses.items():
            preset = resp.get('preset', '')
            label = trigger.replace('_', ' ')
            if preset and preset in PRESET_FEELINGS:
                feeling = PRESET_FEELINGS[preset]
                if feeling:
                    hints.append(f"{label} {feeling}")
            else:
                # Custom: describe by valence direction
                valence = resp.get('valence', 0)
                if valence > 0.1:
                    hints.append(f"{label} feels exciting and welcome")
                elif valence < -0.1:
                    hints.append(f"{label} feels threatening or hurtful")
                elif abs(valence) < 0.02:
                    hints.append(f"{label} barely registers")

        return ', '.join(hints) if hints else ""

    @staticmethod
    def _lever_description(value: float, descriptions: list[str]) -> str:
        """Map a 0-1 value to a description from a list."""
        idx = min(int(value * len(descriptions)), len(descriptions) - 1)
        return descriptions[idx]
    
    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp value to range."""
        return max(min_val, min(max_val, value))
