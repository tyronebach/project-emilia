"""Tests for the EmotionEngine service."""
import math
import pytest
import services.emotion_engine as emotion_engine_module
from services.emotion_engine import (
    EmotionEngine, EmotionalState, AgentProfile,
    normalize_trigger, infer_outcome_multisignal,
    TriggerCalibration, ContextualTriggerCalibration, ContextBucket,
    TRIGGER_TAXONOMY, ALL_TRIGGERS, MOOD_GROUPS,
)


class _StubTriggerClassifier:
    """Deterministic classifier stub for emotion engine tests."""

    confidence_threshold = 0.25
    low_confidence_threshold = 0.15

    def classify(self, text: str) -> list[tuple[str, float]]:
        lowered = (text or "").lower()
        if "mixed sarcasm" in lowered:
            return [("gratitude", 0.90), ("annoyance", 0.72)]
        if "bright thank you" in lowered:
            return [("gratitude", 0.90)]
        if "small thanks" in lowered:
            return [("gratitude", 0.35)]
        if "amazing" in lowered or "incredible" in lowered:
            return [("admiration", 0.92)]
        if "thank you" in lowered or "thanks" in lowered:
            return [("gratitude", 0.87)]
        if "haha" in lowered or "hilarious" in lowered:
            return [("amusement", 0.83)]
        if "angry" in lowered or "furious" in lowered:
            return [("anger", 0.91)]
        if "love" in lowered and "scared" in lowered:
            return [("love", 0.79), ("fear", 0.68)]
        if "love" in lowered:
            return [("love", 0.90)]
        if "weather" in lowered:
            return []
        if "curious" in lowered:
            return [("curiosity", 0.78)]
        return []

    def get_max_confidence(self, text: str) -> float:
        return max((score for _label, score in self.classify(text)), default=0.0)

    def is_low_confidence(self, text: str) -> bool:
        return self.get_max_confidence(text) < self.low_confidence_threshold


@pytest.fixture(autouse=True)
def _mock_trigger_classifier(monkeypatch):
    monkeypatch.setenv("SARCASM_MITIGATION_ENABLED", "1")
    monkeypatch.setenv("SARCASM_POSITIVE_DAMPEN_FACTOR", "0.35")
    monkeypatch.setenv("SARCASM_RECENT_NEGATIVE_DAMPEN_FACTOR", "0.6")
    monkeypatch.setenv("SARCASM_RECENT_POSITIVE_THRESHOLD", "0.45")
    stub = _StubTriggerClassifier()
    monkeypatch.setattr(emotion_engine_module, "get_trigger_classifier", lambda: stub)
    yield


class TestEmotionalState:
    """Tests for EmotionalState dataclass."""
    
    def test_default_values(self):
        state = EmotionalState()
        assert state.valence == 0.0
        assert state.arousal == 0.0
        assert state.trust == 0.5
        assert state.attachment == 0.3
    
    def test_to_dict(self):
        state = EmotionalState(valence=0.5, trust=0.8)
        d = state.to_dict()
        assert d['valence'] == 0.5
        assert d['trust'] == 0.8
    
    def test_from_dict(self):
        d = {'valence': 0.7, 'arousal': -0.3, 'trust': 0.9}
        state = EmotionalState.from_dict(d)
        assert state.valence == 0.7
        assert state.arousal == -0.3
        assert state.trust == 0.9


class TestAgentProfile:
    """Tests for AgentProfile configuration."""
    
    def test_default_values(self):
        profile = AgentProfile()
        assert profile.baseline_valence == 0.2
        assert profile.emotional_volatility == 0.5
        assert profile.trust_gain_multiplier == 1.0
    
    def test_from_db(self):
        agent_row = {
            'baseline_valence': 0.3,
            'baseline_arousal': 0.1,
            'emotional_volatility': 1.2,
            'emotional_recovery': 0.15,
        }
        profile_json = {
            'trust_gain_multiplier': 1.5,
            'trigger_multipliers': {'compliment': 1.3},
        }
        profile = AgentProfile.from_db(agent_row, profile_json)
        assert profile.baseline_valence == 0.3
        assert profile.emotional_volatility == 1.2
        assert profile.trust_gain_multiplier == 1.5
        assert profile.trigger_multipliers['compliment'] == 1.3


class TestEmotionEngineDecay:
    """Tests for emotional decay toward baseline."""
    
    @pytest.fixture
    def default_engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_decay_toward_baseline(self, default_engine):
        """State should decay toward baseline over time."""
        state = EmotionalState(valence=0.8, arousal=0.5)
        
        # Decay for 1 hour
        state = default_engine.apply_decay(state, 3600)
        
        # Should be closer to baseline (0.2 valence, 0.0 arousal)
        assert state.valence < 0.8
        assert state.arousal < 0.5
        assert state.valence > default_engine.profile.baseline_valence
    
    def test_no_decay_at_baseline(self, default_engine):
        """No change when already at baseline."""
        baseline_v = default_engine.profile.baseline_valence
        baseline_a = default_engine.profile.baseline_arousal
        state = EmotionalState(valence=baseline_v, arousal=baseline_a)
        
        state = default_engine.apply_decay(state, 3600)
        
        assert abs(state.valence - baseline_v) < 0.01
        assert abs(state.arousal - baseline_a) < 0.01
    
    def test_no_decay_with_zero_time(self, default_engine):
        """No decay when no time has passed."""
        state = EmotionalState(valence=0.8)
        original = state.valence
        
        state = default_engine.apply_decay(state, 0)
        
        assert state.valence == original
    
    def test_decay_from_negative(self, default_engine):
        """Negative values should decay toward baseline too."""
        state = EmotionalState(valence=-0.5, arousal=-0.3)
        
        state = default_engine.apply_decay(state, 3600)
        
        # Should move toward baseline (0.2, 0.0)
        assert state.valence > -0.5
        assert state.arousal > -0.3


class TestEmotionEngineTriggerDetection:
    """Tests for GoEmotions classifier-based trigger detection."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_detect_admiration(self, engine):
        triggers = engine.detect_triggers("You're so amazing!")
        trigger_names = [t[0] for t in triggers]
        assert "admiration" in trigger_names
    
    def test_detect_gratitude(self, engine):
        triggers = engine.detect_triggers("Thank you so much")
        trigger_names = [t[0] for t in triggers]
        assert "gratitude" in trigger_names
    
    def test_detect_amusement(self, engine):
        triggers = engine.detect_triggers("haha you're such a dummy")
        trigger_names = [t[0] for t in triggers]
        assert "amusement" in trigger_names
    
    def test_detect_anger(self, engine):
        triggers = engine.detect_triggers("I'm so angry at you right now")
        trigger_names = [t[0] for t in triggers]
        assert "anger" in trigger_names
    
    def test_detect_multiple_triggers(self, engine):
        triggers = engine.detect_triggers("I love you but I'm scared")
        trigger_names = [t[0] for t in triggers]
        assert "love" in trigger_names
        assert "fear" in trigger_names

    def test_no_triggers_in_neutral_text(self, engine):
        triggers = engine.detect_triggers("The weather is nice today")
        assert len(triggers) == 0
    
    def test_empty_text(self, engine):
        triggers = engine.detect_triggers("")
        assert len(triggers) == 0
    
    def test_case_insensitive(self, engine):
        triggers1 = engine.detect_triggers("THANK YOU")
        triggers2 = engine.detect_triggers("thank you")
        assert len(triggers1) == len(triggers2)

    def test_detect_triggers_returns_valid_goemotions_labels(self, engine):
        triggers = engine.detect_triggers("You're amazing and thank you")
        for trigger, intensity in triggers:
            assert trigger in engine.DEFAULT_TRIGGER_DELTAS
            assert 0.0 <= intensity <= 1.0

    def test_cooccurrence_dampens_positive_when_negative_present(self, engine):
        triggers = dict(engine.detect_triggers("mixed sarcasm"))
        assert "annoyance" in triggers
        assert "gratitude" in triggers
        assert triggers["gratitude"] < 0.40
        assert triggers["gratitude"] >= 0.25

    def test_recent_negative_context_dampens_strong_positive(self, engine):
        no_context = dict(engine.detect_triggers("bright thank you"))
        with_context = dict(
            engine.detect_triggers(
                "bright thank you",
                recent_context_triggers=["anger"],
            )
        )
        assert no_context["gratitude"] > with_context["gratitude"]
        assert with_context["gratitude"] > 0.45

    def test_recent_negative_context_skips_low_confidence_positive(self, engine):
        triggers = dict(
            engine.detect_triggers(
                "small thanks",
                recent_context_triggers=["disapproval"],
            )
        )
        assert triggers["gratitude"] == pytest.approx(0.35)

    def test_classifier_integration_positive_emotion_increases_valence(self, engine):
        state = EmotionalState()
        for trigger, intensity in engine.detect_triggers("You're amazing!"):
            engine.apply_trigger(state, trigger, intensity)
        assert state.valence > 0

    def test_classifier_integration_negative_emotion_decreases_valence(self, engine):
        state = EmotionalState()
        for trigger, intensity in engine.detect_triggers("I'm furious right now"):
            engine.apply_trigger(state, trigger, intensity)
        assert state.valence < 0


class TestEmotionEngineTriggerApplication:
    """Tests for applying triggers to emotional state."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_admiration_increases_valence(self, engine):
        state = EmotionalState()
        initial = state.valence
        
        engine.apply_trigger(state, "admiration", 0.8)
        
        assert state.valence > initial
    
    def test_disgust_decreases_valence(self, engine):
        state = EmotionalState(valence=0.5)
        initial = state.valence
        
        engine.apply_trigger(state, "disgust", 0.8)
        
        assert state.valence < initial
    
    def test_anger_increases_arousal(self, engine):
        state = EmotionalState()
        initial = state.arousal
        
        engine.apply_trigger(state, "anger", 0.8)
        
        assert state.arousal > initial
    
    def test_caring_decreases_arousal(self, engine):
        state = EmotionalState(arousal=0.5)
        initial = state.arousal
        
        engine.apply_trigger(state, "caring", 0.8)
        
        assert state.arousal < initial
    
    def test_trigger_affects_trust(self, engine):
        state = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state, "admiration", 0.8)
        
        # Trust should increase (slowly due to asymmetry)
        assert state.trust > 0.5
    
    def test_unknown_trigger_no_effect(self, engine):
        state = EmotionalState()
        initial_dict = state.to_dict()
        
        deltas = engine.apply_trigger(state, 'unknown_trigger', 0.8)
        
        assert deltas == {}
        # Unknown triggers have no effect at all
        assert state.familiarity == initial_dict['familiarity']


class TestTrustAsymmetry:
    """Tests for asymmetric trust changes."""
    
    def test_negative_trust_change_larger(self):
        engine = EmotionEngine(AgentProfile())
        
        # Test with admiration (positive trust) and anger (negative trust)
        state_pos = EmotionalState(trust=0.5)
        state_neg = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state_pos, "admiration", 0.8)
        engine.apply_trigger(state_neg, "anger", 0.8)
        
        positive_delta = state_pos.trust - 0.5
        negative_delta = 0.5 - state_neg.trust
        
        # Negative change should be larger magnitude
        assert negative_delta > positive_delta
    
    def test_trust_gain_multiplier(self):
        profile = AgentProfile(trust_gain_multiplier=2.0)
        engine = EmotionEngine(profile)
        state = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state, "admiration", 0.8)
        
        # With 2x multiplier, trust should increase more
        assert state.trust > 0.5


class TestVolatilityScaling:
    """Tests for emotional volatility affecting delta magnitude."""
    
    def test_high_volatility_larger_changes(self):
        low_vol = AgentProfile(emotional_volatility=0.5)
        high_vol = AgentProfile(emotional_volatility=1.5)
        
        state_low = EmotionalState()
        state_high = EmotionalState()
        
        EmotionEngine(low_vol).apply_trigger(state_low, "admiration", 0.8)
        EmotionEngine(high_vol).apply_trigger(state_high, "admiration", 0.8)
        
        assert state_high.valence > state_low.valence


class TestAsymmetricDeltaBias:
    """Tests for non-trust asymmetry tuning."""

    def test_negative_valence_moves_farther_than_equal_positive(self):
        profile = AgentProfile(
            emotional_volatility=1.0,
            trigger_responses={
                "admiration": {"valence": 0.1},
                "disapproval": {"valence": -0.1},
            },
        )
        engine = EmotionEngine(profile)

        state_pos = EmotionalState()
        state_neg = EmotionalState()
        engine.apply_trigger(state_pos, "admiration", 1.0)
        engine.apply_trigger(state_neg, "disapproval", 1.0)

        positive_delta = state_pos.valence
        negative_delta = -state_neg.valence
        assert negative_delta > positive_delta

    def test_negative_mood_delta_stronger_than_equal_positive(self):
        engine = EmotionEngine(AgentProfile(emotional_volatility=1.0))
        state_pos = EmotionalState(mood_weights={"supportive": 10.0})
        state_neg = EmotionalState(mood_weights={"supportive": 10.0})

        engine.apply_mood_deltas(state_pos, {"supportive": 0.5})
        engine.apply_mood_deltas(state_neg, {"supportive": -0.5})

        positive_delta = state_pos.mood_weights["supportive"] - 10.0
        negative_delta = 10.0 - state_neg.mood_weights["supportive"]
        assert negative_delta > positive_delta


class TestPlayContext:
    """Tests for play context (amusement behavior)."""
    
    def test_amusement_positive_at_high_trust(self):
        profile = AgentProfile(play_trust_threshold=0.6)
        engine = EmotionEngine(profile)
        
        state = EmotionalState(trust=0.8, valence=0.0)
        engine.apply_trigger(state, "amusement", 0.7)
        
        # High trust: amusement should be positive.
        assert state.valence > 0
    
    def test_amusement_dampened_at_low_trust(self):
        profile = AgentProfile(play_trust_threshold=0.6)
        engine = EmotionEngine(profile)
        
        state = EmotionalState(trust=0.3, valence=0.0)
        engine.apply_trigger(state, "amusement", 0.7)
        
        # Low trust: effect is dampened by context gating.
        assert state.valence <= 0.05


class TestBehaviorLevers:
    """Tests for behavior lever computation."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_high_trust_high_warmth(self, engine):
        state = EmotionalState(valence=0.5, trust=0.9)
        levers = engine.get_behavior_levers(state)
        
        assert levers['warmth'] > 0.5
        assert levers['guardedness'] < 0.3
    
    def test_low_trust_high_guardedness(self, engine):
        state = EmotionalState(valence=0.0, trust=0.2)
        levers = engine.get_behavior_levers(state)
        
        assert levers['guardedness'] > 0.3
        assert levers['warmth'] < 0.3
    
    def test_high_arousal_playfulness(self, engine):
        state = EmotionalState(arousal=0.7, trust=0.7)
        levers = engine.get_behavior_levers(state)
        
        assert levers['playfulness'] > 0.4
    
    def test_levers_in_range(self, engine):
        # Test with extreme values
        state = EmotionalState(valence=1.0, arousal=1.0, trust=1.0)
        levers = engine.get_behavior_levers(state)
        
        for lever in levers.values():
            assert 0.0 <= lever <= 1.0
    
    def test_context_block_generation(self, engine):
        state = EmotionalState(valence=0.3, arousal=0.2, trust=0.7)
        block = engine.generate_context_block(state)

        assert '[EMOTIONAL_STATE]' in block
        assert 'Valence:' in block
        assert 'Trust:' in block
        assert 'Intimacy:' in block
        assert 'Dynamic:' in block
        assert "don't mention these explicitly" in block

    def test_context_block_with_moods(self, engine):
        state = EmotionalState(
            valence=0.3, arousal=0.2, trust=0.7,
            mood_weights={"supportive": 8, "zen": 3, "snarky": 0},
        )
        block = engine.generate_context_block(state)

        assert 'feeling somewhat supportive' in block
        assert '[EMOTIONAL_STATE]' in block

    def test_context_block_neutral_without_moods(self, engine):
        state = EmotionalState(valence=0.3, arousal=0.2, trust=0.7)
        block = engine.generate_context_block(state)

        assert 'feeling emotionally neutral' in block


class TestStateBounds:
    """Tests for value clamping and bounds."""
    
    def test_valence_clamped(self):
        engine = EmotionEngine(AgentProfile(emotional_volatility=5.0))
        state = EmotionalState(valence=0.9)
        
        # Apply many positive triggers
        for _ in range(10):
            engine.apply_trigger(state, "admiration", 1.0)
        
        assert state.valence <= 1.0
    
    def test_trust_clamped(self):
        engine = EmotionEngine(AgentProfile(emotional_volatility=5.0))
        state = EmotionalState(trust=0.1)
        
        # Apply many negative triggers
        for _ in range(10):
            engine.apply_trigger(state, "anger", 1.0)
        
        assert state.trust >= 0.0
    
    def test_attachment_ceiling_respected(self):
        profile = AgentProfile(attachment_ceiling=0.7)
        engine = EmotionEngine(profile)
        state = EmotionalState(attachment=0.5)
        
        # Apply triggers that increase attachment
        for _ in range(20):
            engine.apply_trigger(state, "excitement", 1.0)
        
        assert state.attachment <= 0.7


# ============================================================
# V2: Trigger normalization
# ============================================================

class TestNormalizeTrigger:
    """Tests for normalize_trigger V2 taxonomy."""

    def test_canonical_triggers_pass_through(self):
        for trigger in ALL_TRIGGERS:
            assert normalize_trigger(trigger) == trigger

    def test_alias_resolves(self):
        assert normalize_trigger("compliment") == "love"
        assert normalize_trigger("insult") == "disapproval"
        assert normalize_trigger("betrayal") == "disgust"

    def test_unrecognized_returns_none(self):
        assert normalize_trigger("totally_unknown_xyz") is None

    def test_social_aliases_resolve(self):
        assert normalize_trigger("greeting") == "joy"
        assert normalize_trigger("farewell") == "sadness"
        assert normalize_trigger("question") == "curiosity"


# ============================================================
# V2: TriggerCalibration
# ============================================================

class TestTriggerCalibration:
    """Tests for TriggerCalibration Bayesian learning."""

    def test_default_multiplier_is_one(self):
        cal = TriggerCalibration(trigger_type="admiration")
        assert cal.learned_multiplier == 1.0

    def test_positive_outcomes_increase_multiplier(self):
        cal = TriggerCalibration(trigger_type="admiration")
        for _ in range(40):
            cal.update("positive", 0.8)
        assert cal.learned_multiplier > 1.0

    def test_negative_outcomes_decrease_multiplier(self):
        cal = TriggerCalibration(trigger_type="disapproval")
        for _ in range(40):
            cal.update("negative", 0.8)
        assert cal.learned_multiplier < 1.0

    def test_multiplier_bounded(self):
        cal = TriggerCalibration(trigger_type="admiration")
        for _ in range(200):
            cal.update("positive", 1.0)
        assert 0.75 <= cal.learned_multiplier <= 1.25

    def test_roundtrip_to_dict(self):
        cal = TriggerCalibration(trigger_type="admiration")
        cal.update("positive", 0.9)
        d = cal.to_dict()
        restored = TriggerCalibration.from_dict(d)
        assert restored.trigger_type == "admiration"
        assert restored.occurrence_count == 1
        assert abs(restored.learned_multiplier - cal.learned_multiplier) < 0.001

    def test_confidence_scaling_below_min_samples(self):
        """With few samples, multiplier stays close to 1.0."""
        cal = TriggerCalibration(trigger_type="admiration")
        cal.update("positive", 0.9)
        # With only 1 sample (below MIN_SAMPLES=30), should be close to 1.0
        assert abs(cal.learned_multiplier - 1.0) < 0.05


# ============================================================
# V2: ContextualTriggerCalibration & ContextBucket
# ============================================================

class TestContextBucket:
    """Tests for ContextBucket derivation from state."""

    def test_high_trust_bucket(self):
        state = EmotionalState(trust=0.8)
        bucket = ContextBucket.from_state(state)
        assert bucket.trust_level == "high"

    def test_low_trust_bucket(self):
        state = EmotionalState(trust=0.2)
        bucket = ContextBucket.from_state(state)
        assert bucket.trust_level == "low"

    def test_mid_trust_bucket(self):
        state = EmotionalState(trust=0.5)
        bucket = ContextBucket.from_state(state)
        assert bucket.trust_level == "mid"

    def test_arousal_calm(self):
        state = EmotionalState(arousal=0.1)
        bucket = ContextBucket.from_state(state)
        assert bucket.arousal_level == "calm"

    def test_arousal_activated(self):
        state = EmotionalState(arousal=0.5)
        bucket = ContextBucket.from_state(state)
        assert bucket.arousal_level == "activated"


class TestContextualTriggerCalibration:
    """Tests for context-aware calibration."""

    def _bucket(self, trust: float = 0.5, arousal: float = 0.1) -> ContextBucket:
        return ContextBucket.from_state(EmotionalState(trust=trust, arousal=arousal))

    def test_roundtrip(self):
        cal = ContextualTriggerCalibration(trigger_type="admiration")
        cal.update(self._bucket(0.8), "positive", 0.8)
        d = cal.to_dict()
        restored = ContextualTriggerCalibration.from_dict(d)
        assert restored.trigger_type == "admiration"

    def test_context_specific_multiplier(self):
        cal = ContextualTriggerCalibration(trigger_type="admiration")
        high = self._bucket(0.8)
        low = self._bucket(0.2)
        for _ in range(40):
            cal.update(high, "positive", 0.8)
        for _ in range(40):
            cal.update(low, "negative", 0.8)
        # High trust context should yield higher multiplier than low trust
        assert cal.get_multiplier(high) > cal.get_multiplier(low)


# ============================================================
# V2: Outcome inference (multi-signal)
# ============================================================

class TestInferOutcomeMultisignal:
    """Tests for multi-signal outcome inference."""

    def test_positive_explicit_message(self):
        outcome, conf = infer_outcome_multisignal("haha love that!", {})
        assert outcome == "positive"
        assert conf > 0.5

    def test_negative_explicit_message(self):
        outcome, conf = infer_outcome_multisignal("stop that's rude", {})
        assert outcome == "negative"
        assert conf > 0.5

    def test_neutral_no_signals(self):
        outcome, conf = infer_outcome_multisignal(None, {})
        assert outcome == "neutral"

    def test_agent_mood_positive(self):
        # Moods from MOOD_GROUPS "warm" group
        outcome, conf = infer_outcome_multisignal(None, {"mood": "supportive"})
        assert outcome == "positive"

    def test_agent_mood_negative(self):
        # Moods from MOOD_GROUPS "dark" group
        outcome, conf = infer_outcome_multisignal(None, {"mood": "enraged"})
        assert outcome == "negative"

    def test_neutral_unknown_mood(self):
        outcome, conf = infer_outcome_multisignal(None, {"mood": "unknown_mood_xyz"})
        assert outcome == "neutral"


# ============================================================
# V2: Exponential decay (H4 fix verification)
# ============================================================

class TestExponentialDecay:
    """Verify decay never overshoots baseline."""

    def test_large_time_no_overshoot(self):
        engine = EmotionEngine(AgentProfile())
        baseline_v = engine.profile.baseline_valence  # 0.2
        state = EmotionalState(valence=1.0, arousal=1.0)

        # Decay for 10000 hours — should converge fully
        state = engine.apply_decay(state, 10000 * 3600)
        assert abs(state.valence - baseline_v) < 0.01
        assert abs(state.arousal - 0.0) < 0.01

    def test_monotonic_convergence(self):
        """Verify valence always moves toward baseline, never past it."""
        engine = EmotionEngine(AgentProfile())
        baseline_v = engine.profile.baseline_valence

        state = EmotionalState(valence=1.0)
        prev = state.valence
        for _ in range(100):
            state = engine.apply_decay(state, 3600)
            # Must always be between baseline and prev (monotonic)
            assert state.valence <= prev + 0.001
            assert state.valence >= baseline_v - 0.001
            prev = state.valence

    def test_negative_side_no_overshoot(self):
        """Negative values should monotonically approach baseline from below."""
        engine = EmotionEngine(AgentProfile())
        baseline_v = engine.profile.baseline_valence
        state = EmotionalState(valence=-1.0)

        prev = state.valence
        for _ in range(100):
            state = engine.apply_decay(state, 3600)
            assert state.valence >= prev - 0.001  # monotonically increasing
            assert state.valence <= baseline_v + 0.001  # never overshoot
            prev = state.valence

    def test_at_baseline_stays(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(
            valence=engine.profile.baseline_valence,
            arousal=engine.profile.baseline_arousal,
        )
        state = engine.apply_decay(state, 3600)
        assert abs(state.valence - engine.profile.baseline_valence) < 0.001


# ============================================================
# V2: compute_effective_delta
# ============================================================

class TestComputeEffectiveDelta:
    """Tests for the three-layer intensity calculation."""

    def test_base_intensity_passthrough(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        result = engine.compute_effective_delta("admiration", 1.0, state, None)
        assert result > 0

    def test_high_trust_amplifies_positive(self):
        engine = EmotionEngine(AgentProfile())
        low = engine.compute_effective_delta("admiration", 1.0, EmotionalState(trust=0.2), None)
        high = engine.compute_effective_delta("admiration", 1.0, EmotionalState(trust=0.9), None)
        assert high > low

    def test_calibration_scales_result(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        cal = ContextualTriggerCalibration(trigger_type="admiration")
        # Manually set a high multiplier
        cal.global_cal.learned_multiplier = 1.5
        result_cal = engine.compute_effective_delta("admiration", 1.0, state, cal)
        result_no_cal = engine.compute_effective_delta("admiration", 1.0, state, None)
        assert result_cal > result_no_cal


# ============================================================
# V2: learn_from_outcome
# ============================================================

class TestLearnFromOutcome:
    """Tests for outcome-based calibration learning."""

    def test_learns_from_positive(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        triggers = [("admiration", 0.8)]
        updated = engine.learn_from_outcome(state, triggers, "positive", 0.8)
        assert "admiration" in updated

    def test_skips_low_confidence(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        triggers = [("admiration", 0.8)]
        updated = engine.learn_from_outcome(state, triggers, "positive", 0.1)
        assert len(updated) == 0

    def test_skips_unrecognized_triggers(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        triggers = [("totally_unknown_xyz", 0.8)]
        updated = engine.learn_from_outcome(state, triggers, "positive", 0.8)
        assert len(updated) == 0


# ============================================================
# V2: update_relationship_dimensions
# ============================================================

class TestUpdateRelationshipDimensions:
    """Tests for trust/intimacy/etc dimension updates."""

    def test_admiration_positive_increases_trust(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        deltas = engine.update_relationship_dimensions(state, [("admiration", 0.8)], "positive")
        assert state.trust > 0.5

    def test_disgust_decreases_trust(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        engine.update_relationship_dimensions(state, [("disgust", 0.8)], "negative")
        assert state.trust < 0.5

    def test_dimensions_clamped(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.99)
        for _ in range(20):
            engine.update_relationship_dimensions(state, [("admiration", 1.0)], "positive")
        assert state.trust <= 1.0

    def test_unrecognized_trigger_no_effect(self):
        engine = EmotionEngine(AgentProfile())
        state = EmotionalState(trust=0.5)
        engine.update_relationship_dimensions(state, [("xyz_unknown", 0.8)], "positive")
        assert state.trust == 0.5


# ============================================================
# V2: EmotionalState.from_db_row (C1 fix verification)
# ============================================================

class TestFromDbRow:
    """Test from_db_row handles None vs 0.0 correctly."""

    def test_zero_trust_preserved(self):
        row = {"trust": 0.0, "valence": 0.0, "arousal": 0.0}
        state = EmotionalState.from_db_row(row)
        assert state.trust == 0.0  # NOT 0.5

    def test_none_trust_gets_default(self):
        row = {"trust": None}
        state = EmotionalState.from_db_row(row)
        assert state.trust == 0.5

    def test_missing_key_gets_default(self):
        row = {}
        state = EmotionalState.from_db_row(row)
        assert state.trust == 0.5
        assert state.intimacy == 0.2

    def test_zero_intimacy_preserved(self):
        row = {"intimacy": 0.0}
        state = EmotionalState.from_db_row(row)
        assert state.intimacy == 0.0  # NOT 0.2


# ============================================================
# V2: Trust spiral prevention (H2 fix verification)
# ============================================================

class TestTrustSpiralPrevention:
    """Verify amusement at low trust doesn't create negative spiral."""

    def test_amusement_at_low_trust_no_negative_effect(self):
        engine = EmotionEngine(AgentProfile(play_trust_threshold=0.6))
        state = EmotionalState(trust=0.2, valence=0.0)
        initial_trust = state.trust

        engine.apply_trigger(state, "amusement", 0.8)

        # Trust should NOT decrease from amusement at low trust (clamped to 0)
        assert state.trust >= initial_trust - 0.001
