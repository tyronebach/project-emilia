from unittest.mock import patch

from services.emotion_engine import AgentProfile, EmotionalState, EmotionEngine


def test_injected_moods_low_volatility_is_deterministic():
    profile = AgentProfile(emotional_volatility=0.2)
    engine = EmotionEngine(profile)
    engine.mood_injection_settings = {
        "top_k": 3,
        "volatility_threshold": 0.3,
        "min_margin": 0.15,
        "random_strength": 0.7,
        "max_random_chance": 0.85,
    }
    state = EmotionalState(
        mood_weights={
            "sassy": 8.0,
            "sarcastic": 7.5,
            "whimsical": 6.0,
        }
    )

    moods = engine.get_injected_moods(state, top_n=2)
    assert moods[0][0] == "sassy"
    assert moods[1][0] == "sarcastic"


def test_injected_moods_high_volatility_can_sample_non_top_primary():
    profile = AgentProfile(emotional_volatility=1.5)
    engine = EmotionEngine(profile)
    engine.mood_injection_settings = {
        "top_k": 3,
        "volatility_threshold": 0.3,
        "min_margin": 0.15,
        "random_strength": 0.7,
        "max_random_chance": 0.85,
    }
    state = EmotionalState(
        mood_weights={
            "sassy": 8.0,
            "sarcastic": 7.5,
            "whimsical": 6.0,
        }
    )

    # Force sampling branch and choose second-ranked mood as primary.
    with patch("services.emotion_engine.random.random", return_value=0.0):
        with patch("services.emotion_engine.random.choices", return_value=[("sarcastic", 7.5)]):
            moods = engine.get_injected_moods(state, top_n=2)

    assert moods[0][0] == "sarcastic"
    assert moods[1][0] == "sassy"
