"""Tests for the EmotionEngine service."""
import pytest
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile


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
    """Tests for trigger pattern detection."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_detect_compliment(self, engine):
        triggers = engine.detect_triggers("You're so amazing!")
        trigger_names = [t[0] for t in triggers]
        assert 'compliment' in trigger_names
    
    def test_detect_gratitude(self, engine):
        triggers = engine.detect_triggers("Thank you so much")
        trigger_names = [t[0] for t in triggers]
        assert 'gratitude' in trigger_names
    
    def test_detect_teasing(self, engine):
        triggers = engine.detect_triggers("haha you're such a dummy")
        trigger_names = [t[0] for t in triggers]
        assert 'teasing' in trigger_names
    
    def test_detect_conflict(self, engine):
        triggers = engine.detect_triggers("I'm so angry at you right now")
        trigger_names = [t[0] for t in triggers]
        assert 'conflict' in trigger_names
    
    def test_detect_multiple_triggers(self, engine):
        triggers = engine.detect_triggers("Thank you, you're amazing!")
        trigger_names = [t[0] for t in triggers]
        assert 'gratitude' in trigger_names
        assert 'compliment' in trigger_names
    
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


class TestEmotionEngineTriggerApplication:
    """Tests for applying triggers to emotional state."""
    
    @pytest.fixture
    def engine(self):
        return EmotionEngine(AgentProfile())
    
    def test_compliment_increases_valence(self, engine):
        state = EmotionalState()
        initial = state.valence
        
        engine.apply_trigger(state, 'compliment', 0.8)
        
        assert state.valence > initial
    
    def test_rejection_decreases_valence(self, engine):
        state = EmotionalState(valence=0.5)
        initial = state.valence
        
        engine.apply_trigger(state, 'rejection', 0.8)
        
        assert state.valence < initial
    
    def test_conflict_increases_arousal(self, engine):
        state = EmotionalState()
        initial = state.arousal
        
        engine.apply_trigger(state, 'conflict', 0.8)
        
        assert state.arousal > initial
    
    def test_comfort_decreases_arousal(self, engine):
        state = EmotionalState(arousal=0.5)
        initial = state.arousal
        
        engine.apply_trigger(state, 'comfort', 0.8)
        
        assert state.arousal < initial
    
    def test_trigger_affects_trust(self, engine):
        state = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state, 'compliment', 0.8)
        
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
        
        # Test with compliment (positive trust) and conflict (negative trust)
        state_pos = EmotionalState(trust=0.5)
        state_neg = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state_pos, 'compliment', 0.8)  # +0.02 base
        engine.apply_trigger(state_neg, 'conflict', 0.8)    # -0.10 base
        
        positive_delta = state_pos.trust - 0.5
        negative_delta = 0.5 - state_neg.trust
        
        # Negative change should be larger magnitude
        assert negative_delta > positive_delta
    
    def test_trust_gain_multiplier(self):
        profile = AgentProfile(trust_gain_multiplier=2.0)
        engine = EmotionEngine(profile)
        state = EmotionalState(trust=0.5)
        
        engine.apply_trigger(state, 'compliment', 0.8)
        
        # With 2x multiplier, trust should increase more
        assert state.trust > 0.5


class TestVolatilityScaling:
    """Tests for emotional volatility affecting delta magnitude."""
    
    def test_high_volatility_larger_changes(self):
        low_vol = AgentProfile(emotional_volatility=0.5)
        high_vol = AgentProfile(emotional_volatility=1.5)
        
        state_low = EmotionalState()
        state_high = EmotionalState()
        
        EmotionEngine(low_vol).apply_trigger(state_low, 'compliment', 0.8)
        EmotionEngine(high_vol).apply_trigger(state_high, 'compliment', 0.8)
        
        assert state_high.valence > state_low.valence


class TestPlayContext:
    """Tests for play context (teasing behavior)."""
    
    def test_teasing_positive_at_high_trust(self):
        profile = AgentProfile(play_trust_threshold=0.6)
        engine = EmotionEngine(profile)
        
        state = EmotionalState(trust=0.8, valence=0.0)
        engine.apply_trigger(state, 'teasing', 0.7)
        
        # High trust: teasing should be positive
        assert state.valence > 0
    
    def test_teasing_negative_at_low_trust(self):
        profile = AgentProfile(play_trust_threshold=0.6)
        engine = EmotionEngine(profile)
        
        state = EmotionalState(trust=0.3, valence=0.0)
        engine.apply_trigger(state, 'teasing', 0.7)
        
        # Low trust: teasing should be slightly negative or neutral
        # Due to the flipped intensity, effect is reduced
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
        assert 'warmth:' in block
        assert 'playfulness:' in block
        assert 'guardedness:' in block
        assert 'Trust level:' in block
        assert "don't mention these numbers" in block


class TestStateBounds:
    """Tests for value clamping and bounds."""
    
    def test_valence_clamped(self):
        engine = EmotionEngine(AgentProfile(emotional_volatility=5.0))
        state = EmotionalState(valence=0.9)
        
        # Apply many positive triggers
        for _ in range(10):
            engine.apply_trigger(state, 'compliment', 1.0)
        
        assert state.valence <= 1.0
    
    def test_trust_clamped(self):
        engine = EmotionEngine(AgentProfile(emotional_volatility=5.0))
        state = EmotionalState(trust=0.1)
        
        # Apply many negative triggers
        for _ in range(10):
            engine.apply_trigger(state, 'conflict', 1.0)
        
        assert state.trust >= 0.0
    
    def test_attachment_ceiling_respected(self):
        profile = AgentProfile(attachment_ceiling=0.7)
        engine = EmotionEngine(profile)
        state = EmotionalState(attachment=0.5)
        
        # Apply triggers that increase attachment
        for _ in range(20):
            engine.apply_trigger(state, 'shared_joy', 1.0)
        
        assert state.attachment <= 0.7
