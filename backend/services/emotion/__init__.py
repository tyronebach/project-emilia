"""Emotion subsystem modules (taxonomy, calibration, inference)."""

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

__all__ = [
    "CalibrationRecovery",
    "ContextBucket",
    "ContextualTriggerCalibration",
    "TriggerCalibration",
    "CONFIDENCE_THRESHOLD",
    "OutcomeSignal",
    "infer_outcome_multisignal",
    "ALL_TRIGGERS",
    "DEFAULT_MOOD_INJECTION_SETTINGS",
    "LEGACY_TRIGGER_ALIASES",
    "MOOD_GROUPS",
    "SARCASM_NEGATIVE_TRIGGERS",
    "SARCASM_POSITIVE_TRIGGERS",
    "TRIGGER_PRESET_MULTIPLIERS",
    "TRIGGER_TAXONOMY",
    "clamp_injection_settings",
    "normalize_trigger",
]
