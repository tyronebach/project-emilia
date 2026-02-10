from services.emotion_engine import AgentProfile, EmotionEngine


def test_trigger_preset_to_deltas_with_override():
    profile = AgentProfile(
        trigger_responses={
            "praise": {"preset": "amplified"},
            "rejection": {"preset": "threatening"},
            "comfort": {"preset": "muted", "valence": 0.05},
        }
    )

    praise = profile.get_trigger_deltas("praise")
    rejection = profile.get_trigger_deltas("rejection")
    comfort = profile.get_trigger_deltas("comfort")

    base_praise = EmotionEngine.DEFAULT_TRIGGER_DELTAS["praise"]
    base_rejection = EmotionEngine.DEFAULT_TRIGGER_DELTAS["rejection"]
    base_comfort = EmotionEngine.DEFAULT_TRIGGER_DELTAS["comfort"]

    assert praise["valence"] == base_praise["valence"] * 1.5
    assert praise["arousal"] == base_praise["arousal"] * 1.5
    assert praise["trust"] == base_praise["trust"] * 1.5

    assert rejection["valence"] == base_rejection["valence"] * -1.5
    assert rejection["arousal"] == base_rejection["arousal"] * -1.5
    assert rejection["trust"] == base_rejection["trust"] * -1.5

    assert comfort["valence"] == 0.05
    assert comfort["arousal"] == base_comfort["arousal"] * 0.5
    assert comfort["trust"] == base_comfort["trust"] * 0.5


def test_canonical_preset_applies_to_legacy_alias_trigger():
    profile = AgentProfile(
        trigger_responses={
            "praise": {"preset": "uncomfortable"},
        }
    )

    canonical = profile.get_trigger_deltas("praise")
    alias = profile.get_trigger_deltas("compliment")

    assert canonical == alias
    assert canonical["valence"] < 0
