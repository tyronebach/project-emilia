"""
Emotional Engine — Core logic for persistent emotional state.

Processes triggers, applies decay, and computes behavior levers for LLM injection.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import logging
import math
import random
import threading

from config import settings
from services.emotion.calibration import (
    CalibrationRecovery,
    ContextBucket,
    ContextualTriggerCalibration,
    TriggerCalibration,
)
from services.emotion.inference import (
    CONFIDENCE_THRESHOLD,
    OutcomeSignal,
    infer_outcome_multisignal,
)
from services.emotion.taxonomy import (
    ALL_TRIGGERS,
    DEFAULT_MOOD_INJECTION_SETTINGS,
    LEGACY_TRIGGER_ALIASES,
    MOOD_GROUPS,
    SARCASM_NEGATIVE_TRIGGERS,
    SARCASM_POSITIVE_TRIGGERS,
    TRIGGER_PRESET_MULTIPLIERS,
    TRIGGER_TAXONOMY,
    clamp_injection_settings,
    normalize_trigger,
)

logger = logging.getLogger(__name__)


def get_trigger_classifier():
    """
    Resolve trigger classifier singleton for both package and direct-file imports.

    scripts/emotion-lab.py loads this module via importlib from file path, so
    absolute package imports may be unavailable in that execution mode.
    """
    try:
        from services.trigger_classifier import get_trigger_classifier as getter
        return getter()
    except Exception:
        try:
            from trigger_classifier import get_trigger_classifier as getter  # type: ignore
            return getter()
        except Exception:
            import importlib.util
            from pathlib import Path

            module_path = Path(__file__).with_name("trigger_classifier.py")
            spec = importlib.util.spec_from_file_location(
                "trigger_classifier_fallback",
                module_path,
            )
            if not spec or not spec.loader:
                raise RuntimeError("Failed to load trigger_classifier.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module.get_trigger_classifier()

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


def clear_mood_cache() -> None:
    """Clear the cached mood data. Call when mood definitions change at runtime."""
    global _moods_cache
    with _moods_lock:
        _moods_cache = None


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
    valence_gain_multiplier: float = 0.95
    valence_loss_multiplier: float = 1.1
    attachment_ceiling: float = 1.0
    bond_gain_multiplier: float = 0.95
    bond_loss_multiplier: float = 1.1
    trigger_multipliers: dict = field(default_factory=dict)
    trigger_responses: dict = field(default_factory=dict)
    play_trust_threshold: float = 0.7
    mood_baseline: dict = field(default_factory=dict)
    mood_decay_rate: float = 0.3
    mood_gain_multiplier: float = 0.9
    mood_loss_multiplier: float = 1.1
    
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
            valence_gain_multiplier=profile_json.get('valence_gain_multiplier', 0.95),
            valence_loss_multiplier=profile_json.get('valence_loss_multiplier', 1.1),
            attachment_ceiling=profile_json.get('attachment_ceiling', 1.0),
            bond_gain_multiplier=profile_json.get('bond_gain_multiplier', 0.95),
            bond_loss_multiplier=profile_json.get('bond_loss_multiplier', 1.1),
            trigger_multipliers=profile_json.get('trigger_multipliers', {}),
            trigger_responses=profile_json.get('trigger_responses', {}),
            play_trust_threshold=profile_json.get('play_trust_threshold', 0.7),
            mood_baseline=profile_json.get('mood_baseline', {}),
            mood_decay_rate=profile_json.get('mood_decay_rate', 0.3),
            mood_gain_multiplier=profile_json.get('mood_gain_multiplier', 0.9),
            mood_loss_multiplier=profile_json.get('mood_loss_multiplier', 1.1),
        )

    def get_trigger_deltas(self, trigger: str) -> dict[str, float]:
        """Get effective per-axis deltas for a trigger.

        Fallback chain:
        1. trigger_responses[trigger] → use per-axis overrides directly
        2. trigger_multipliers[trigger] → scale DEFAULT_TRIGGER_DELTAS
        3. DEFAULT_TRIGGER_DELTAS as-is (multiplier = 1.0)
        """
        # Support canonical fallback so legacy runtime triggers map to
        # GoEmotions labels (for example compliment -> love).
        canonical = normalize_trigger(trigger)
        lookup_order: list[str] = []
        for key in (trigger, canonical):
            if key and key not in lookup_order:
                lookup_order.append(key)

        # Also check any legacy aliases that map to the canonical trigger.
        # This keeps older agent profiles working even when classifier output
        # is now canonical GoEmotions labels.
        if canonical:
            for legacy, mapped in LEGACY_TRIGGER_ALIASES.items():
                if mapped == canonical and legacy not in lookup_order:
                    lookup_order.append(legacy)

        response_key = next((k for k in lookup_order if k in self.trigger_responses), None)
        if response_key:
            response = self.trigger_responses[response_key]
            preset = response.get("preset") if isinstance(response, dict) else None
            response_canonical = normalize_trigger(response_key)
            base = (
                EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(response_key)
                or EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(response_canonical or "")
                or EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(canonical or "")
                or EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(trigger, {})
            )

            if preset in TRIGGER_PRESET_MULTIPLIERS and base:
                mult = TRIGGER_PRESET_MULTIPLIERS[preset]
                computed = {axis: delta * mult for axis, delta in base.items()}
            else:
                computed = {}

            overrides = {
                k: v for k, v in response.items()
                if k != "preset" and isinstance(v, (int, float))
            } if isinstance(response, dict) else {}

            if computed:
                computed.update(overrides)
                return computed

            return overrides

        multiplier_key = next((k for k in lookup_order if k in self.trigger_multipliers), None)
        mult = self.trigger_multipliers.get(multiplier_key, 1.0) if multiplier_key else 1.0
        base_key = multiplier_key or canonical or trigger
        base = (
            EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(base_key)
            or EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(canonical or "", {})
            or EmotionEngine.DEFAULT_TRIGGER_DELTAS.get(trigger, {})
        )
        return {axis: delta * mult for axis, delta in base.items()}


class EmotionEngine:
    """
    Core emotional processing engine.

    Handles trigger detection, delta application, decay, and behavior lever computation.
    """
    
    # Canonical GoEmotions trigger -> delta mappings.
    DEFAULT_TRIGGER_DELTAS: dict[str, dict[str, float]] = {
        # Positive
        "admiration": {
            "valence": 0.12,
            "arousal": 0.06,
            "trust": 0.03,
            "attachment": 0.01,
        },
        "amusement": {
            "valence": 0.08,
            "arousal": 0.10,
            "trust": 0.015,
        },
        "approval": {
            "valence": 0.07,
            "arousal": 0.02,
            "trust": 0.025,
        },
        "caring": {
            "valence": 0.12,
            "arousal": -0.10,
            "trust": 0.04,
            "intimacy": 0.02,
        },
        "excitement": {
            "valence": 0.14,
            "arousal": 0.16,
            "trust": 0.02,
            "attachment": 0.01,
        },
        "gratitude": {
            "valence": 0.10,
            "arousal": 0.02,
            "trust": 0.04,
            "attachment": 0.015,
        },
        "joy": {
            "valence": 0.12,
            "arousal": 0.08,
            "trust": 0.02,
        },
        "love": {
            "valence": 0.15,
            "arousal": 0.06,
            "trust": 0.05,
            "attachment": 0.03,
            "intimacy": 0.04,
        },
        "optimism": {
            "valence": 0.08,
            "arousal": 0.04,
            "trust": 0.02,
        },
        "pride": {
            "valence": 0.10,
            "arousal": 0.08,
            "trust": 0.02,
            "dominance": 0.03,
        },
        "relief": {
            "valence": 0.08,
            "arousal": -0.12,
            "trust": 0.02,
        },
        # Negative
        "anger": {
            "valence": -0.20,
            "arousal": 0.22,
            "trust": -0.08,
            "dominance": 0.05,
        },
        "annoyance": {
            "valence": -0.10,
            "arousal": 0.08,
            "trust": -0.03,
        },
        "disappointment": {
            "valence": -0.14,
            "arousal": -0.06,
            "trust": -0.04,
            "attachment": -0.01,
        },
        "disapproval": {
            "valence": -0.12,
            "arousal": 0.06,
            "trust": -0.035,
        },
        "disgust": {
            "valence": -0.18,
            "arousal": 0.10,
            "trust": -0.06,
        },
        "fear": {
            "valence": -0.16,
            "arousal": 0.20,
            "trust": -0.05,
            "dominance": -0.08,
        },
        "grief": {
            "valence": -0.22,
            "arousal": -0.10,
            "trust": 0.0,
            "attachment": 0.02,
        },
        "sadness": {
            "valence": -0.14,
            "arousal": -0.08,
            "trust": 0.0,
            "attachment": 0.01,
        },
        # Self-conscious
        "embarrassment": {
            "valence": -0.08,
            "arousal": 0.12,
            "trust": 0.02,
            "dominance": -0.06,
            "intimacy": 0.015,
        },
        "nervousness": {
            "valence": -0.06,
            "arousal": 0.14,
            "trust": 0.03,
            "intimacy": 0.02,
        },
        "remorse": {
            "valence": -0.08,
            "arousal": -0.04,
            "trust": 0.04,
            "dominance": -0.04,
        },
        # Neutral/cognitive
        "confusion": {
            "valence": -0.02,
            "arousal": 0.06,
            "trust": 0.0,
        },
        "curiosity": {
            "valence": 0.04,
            "arousal": 0.08,
            "trust": 0.01,
            "intimacy": 0.01,
        },
        "realization": {
            "valence": 0.03,
            "arousal": 0.10,
            "trust": 0.005,
        },
        "surprise": {
            "valence": 0.02,
            "arousal": 0.14,
            "trust": 0.0,
        },
        # Intimate (already represented in other categories except desire)
        "desire": {
            "valence": 0.10,
            "arousal": 0.14,
            "trust": 0.02,
            "intimacy": 0.04,
            "attachment": 0.02,
        },
        # Neutral label kept for completeness; classifier filters it out.
        "neutral": {
            "valence": 0.0,
            "arousal": 0.0,
            "trust": 0.0,
        },
    }

    def __init__(self, profile: AgentProfile):
        self.profile = profile
        self.mood_injection_settings = self._load_mood_injection_settings()
        self._trigger_classifier_enabled = settings.trigger_classifier_enabled
        self._sarcasm_mitigation_enabled = settings.sarcasm_mitigation_enabled
        self._sarcasm_positive_dampen = settings.sarcasm_positive_dampen_factor
        self._sarcasm_recent_negative_dampen = settings.sarcasm_recent_negative_dampen_factor
        self._sarcasm_recent_positive_threshold = settings.sarcasm_recent_positive_threshold
        self._trigger_classifier = None
        if self._trigger_classifier_enabled:
            self._trigger_classifier = get_trigger_classifier()
            configured_threshold = settings.trigger_classifier_confidence
            self._trigger_classifier.confidence_threshold = self._clamp(configured_threshold, 0.0, 1.0)

    def _load_mood_injection_settings(self) -> dict:
        from db.repositories import AppSettingsRepository

        raw = AppSettingsRepository.get_json(
            "mood_injection_settings",
            DEFAULT_MOOD_INJECTION_SETTINGS,
        )
        return clamp_injection_settings(raw)
    
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

        # Relationship dimensions (trust/attachment/etc) are persistent and updated
        # by interaction outcomes/dreams, not passive weather decay.
        return state
    
    def detect_triggers(
        self,
        text: str,
        recent_context_triggers: list[str] | None = None,
    ) -> list[tuple[str, float]]:
        """
        Detect emotional triggers from text using GoEmotions classifier.
        
        Returns list of (trigger_name, intensity) tuples.
        """
        if not text or not text.strip():
            return []

        if not self._trigger_classifier_enabled or not self._trigger_classifier:
            return []

        trigger_map: dict[str, float] = {}
        for trigger, confidence in self._trigger_classifier.classify(text):
            canonical = normalize_trigger(trigger) or trigger
            if canonical not in self.DEFAULT_TRIGGER_DELTAS:
                continue
            if canonical == "neutral":
                continue
            if canonical not in trigger_map or confidence > trigger_map[canonical]:
                trigger_map[canonical] = confidence

        if self._sarcasm_mitigation_enabled and trigger_map:
            trigger_map = self._apply_sarcasm_cooccurrence_dampening(
                trigger_map,
                recent_context_triggers or [],
            )

            confidence_floor = self._clamp(
                float(getattr(self._trigger_classifier, "confidence_threshold", 0.0)),
                0.0,
                1.0,
            )
            trigger_map = {
                trigger: confidence
                for trigger, confidence in trigger_map.items()
                if confidence >= confidence_floor
            }

        return sorted(trigger_map.items(), key=lambda x: -x[1])

    def _apply_sarcasm_cooccurrence_dampening(
        self,
        trigger_map: dict[str, float],
        recent_context_triggers: list[str],
    ) -> dict[str, float]:
        """Dampen positive triggers when current or recent context looks negative."""
        result = dict(trigger_map)
        has_negative_now = any(trigger in SARCASM_NEGATIVE_TRIGGERS for trigger in result)
        has_positive_now = any(trigger in SARCASM_POSITIVE_TRIGGERS for trigger in result)
        if not has_positive_now:
            return result

        recent_negative = False
        for trigger in recent_context_triggers:
            canonical = normalize_trigger(trigger) or (trigger or "").strip().lower()
            if canonical in SARCASM_NEGATIVE_TRIGGERS:
                recent_negative = True
                break

        dampen_factor: float | None = None
        reason = ""
        if has_negative_now:
            dampen_factor = self._sarcasm_positive_dampen
            reason = "mixed_current"
        elif recent_negative:
            dampen_factor = self._sarcasm_recent_negative_dampen
            reason = "recent_negative_context"

        if dampen_factor is None:
            return result

        changed = False
        for trigger, confidence in list(result.items()):
            if trigger not in SARCASM_POSITIVE_TRIGGERS:
                continue
            if (
                reason == "recent_negative_context"
                and confidence < self._sarcasm_recent_positive_threshold
            ):
                continue
            updated = confidence * dampen_factor
            if updated < confidence:
                result[trigger] = updated
                changed = True

        if changed:
            logger.debug(
                "[Emotion] Sarcasm cooccurrence dampening (%s): %s -> %s",
                reason,
                {k: round(v, 3) for k, v in trigger_map.items()},
                {k: round(v, 3) for k, v in result.items()},
            )

        return result

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
            elif axis == 'valence':
                effective_delta = self._apply_valence_delta_modifier(effective_delta)
            elif axis in ('attachment', 'intimacy'):
                effective_delta = self._apply_bond_delta_modifier(effective_delta)
            
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

        # Intimacy amplifies vulnerable/intimate triggers.
        if trigger in ("nervousness", "embarrassment", "caring", "love", "disclosure", "comfort", "trust_signal"):
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
        dimension_updates: dict[str, dict[tuple[str, str], float]] = {
            "trust": {
                ("admiration", "positive"): +0.02,
                ("approval", "positive"): +0.02,
                ("remorse", "positive"): +0.04,
                ("nervousness", "positive"): +0.03,
                ("disgust", "any"): -0.08,
                ("disappointment", "any"): -0.05,
                ("fear", "negative"): -0.06,
            },
            "intimacy": {
                ("nervousness", "positive"): +0.05,
                ("caring", "positive"): +0.02,
                ("love", "positive"): +0.03,
                ("nervousness", "negative"): -0.04,
                ("disgust", "any"): -0.03,
            },
            "playfulness_safety": {
                ("amusement", "positive"): +0.04,
                ("surprise", "positive"): +0.03,
                ("desire", "positive"): +0.02,
                ("amusement", "negative"): -0.06,
                ("surprise", "negative"): -0.04,
                ("desire", "negative"): -0.03,
            },
            "conflict_tolerance": {
                ("remorse", "positive"): +0.04,
                ("relief", "positive"): +0.05,
                ("disapproval", "any"): -0.03,
                ("fear", "any"): -0.04,
                ("disgust", "any"): -0.05,
            },
        }
        deltas: dict[str, float] = {}

        for trigger, intensity in triggers:
            canonical = normalize_trigger(trigger)
            if not canonical:
                continue

            for dimension, rules in dimension_updates.items():
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

    def _apply_valence_delta_modifier(self, delta: float) -> float:
        """Apply mild negativity bias to valence shifts."""
        if delta > 0:
            return delta * self.profile.valence_gain_multiplier
        if delta < 0:
            return delta * self.profile.valence_loss_multiplier
        return delta

    def _apply_bond_delta_modifier(self, delta: float) -> float:
        """Apply asymmetry for attachment/intimacy deltas."""
        if delta > 0:
            return delta * self.profile.bond_gain_multiplier
        if delta < 0:
            return delta * self.profile.bond_loss_multiplier
        return delta
    
    def _check_category_context(self, trigger: str, state: EmotionalState, intensity: float) -> float:
        """Adjust trigger intensity based on relationship context.

        Play triggers: trust-gated modulation.
        Vulnerability triggers: intimacy-gated modulation.
        """
        # Play-like triggers: trust-gated (clamped to >= 0 to prevent negative spiral)
        if trigger in ('teasing', 'banter', 'flirting', 'amusement', 'surprise', 'desire'):
            if state.trust >= self.profile.play_trust_threshold:
                return abs(intensity) * 0.8   # safe: bonding
            elif state.trust >= 0.4:
                return abs(intensity) * 0.2   # cautious
            else:
                return 0.0  # too risky: suppress entirely (prevents trust spiral)

        # Vulnerability/intimacy triggers: intimacy-gated
        if trigger in ('disclosure', 'trust_signal', 'nervousness', 'embarrassment', 'love'):
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

    def apply_mood_deltas(self, state: EmotionalState, mood_deltas: dict) -> None:
        """Apply mood deltas with volatility scaling.

        V/A is now driven by triggers directly, not back-derived from moods.
        """
        if not state.mood_weights:
            state.mood_weights = {mood: self.profile.mood_baseline.get(mood, 0) for mood in get_mood_list()}

        for mood, delta in mood_deltas.items():
            effective_delta = delta * self.profile.emotional_volatility
            if effective_delta > 0:
                effective_delta *= self.profile.mood_gain_multiplier
            elif effective_delta < 0:
                effective_delta *= self.profile.mood_loss_multiplier
            current = state.mood_weights.get(mood, 0)
            state.mood_weights[mood] = self._clamp(current + effective_delta, 0, 30)

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

    def get_injected_moods(self, state: EmotionalState, top_n: int = 2) -> list[tuple[str, float]]:
        """Get moods for LLM injection with volatility-aware variation.

        Low-volatility personas remain mostly deterministic (top moods).
        High-volatility personas occasionally sample from top candidates.
        """
        settings = self.mood_injection_settings
        candidate_k = max(top_n, int(settings["top_k"]))
        deterministic = self.get_dominant_moods(state, top_n=candidate_k)
        if not deterministic:
            return []
        if len(deterministic) <= 1:
            return deterministic[:top_n]

        # volatility is typically 0..3; normalize to 0..1-ish for selection dynamics
        vol = self._clamp(self.profile.emotional_volatility, 0.0, 3.0)
        vol_norm = self._clamp(vol / 1.5, 0.0, 1.0)
        volatility_threshold = float(settings["volatility_threshold"])
        if vol_norm < volatility_threshold:
            return deterministic[:top_n]

        top_k = min(candidate_k, len(deterministic))
        candidates = deterministic[:top_k]
        first_weight = candidates[0][1]
        second_weight = candidates[1][1]

        # If the top mood dominates strongly, stay deterministic.
        margin_ratio = 0.0
        if first_weight > 0:
            margin_ratio = self._clamp((first_weight - second_weight) / first_weight, 0.0, 1.0)
        min_margin = float(settings["min_margin"])
        if margin_ratio >= min_margin:
            return deterministic[:top_n]

        if volatility_threshold >= 1.0:
            vol_factor = 1.0
        else:
            vol_factor = self._clamp(
                (vol_norm - volatility_threshold) / (1.0 - volatility_threshold),
                0.0,
                1.0,
            )
        margin_factor = 1.0
        if min_margin > 0:
            margin_factor = self._clamp(1.0 - (margin_ratio / min_margin), 0.0, 1.0)
        random_chance = float(settings["random_strength"]) * vol_factor * margin_factor
        random_chance = self._clamp(random_chance, 0.0, float(settings["max_random_chance"]))
        if random.random() >= random_chance:
            return deterministic[:top_n]

        # High volatility flattens preference among top moods.
        # vol_norm=0.3 -> alpha~1.2 (more greedy), vol_norm=1 -> alpha~0.6 (flatter)
        alpha = 1.2 - (0.6 * (vol_norm - 0.3) / 0.7)
        alpha = self._clamp(alpha, 0.6, 1.2)
        weights = [max(0.0001, w) ** alpha for _, w in candidates]
        primary = random.choices(candidates, weights=weights, k=1)[0]

        if top_n <= 1:
            return [primary]

        secondary_candidates = [c for c in deterministic if c[0] != primary[0]]
        if not secondary_candidates:
            return [primary]
        return [primary, secondary_candidates[0]]

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
        dominant = self.get_injected_moods(state, top_n=2)
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
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp value to range."""
        return max(min_val, min(max_val, value))
