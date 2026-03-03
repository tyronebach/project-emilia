from services.behavioral_rules import FragilityProfile, generate_behavioral_rules, get_fragility_profile


def test_generate_behavioral_rules_applies_low_trust_constraints() -> None:
    rules = generate_behavioral_rules(0.12, FragilityProfile())

    assert "## Behavioral Rules" in rules
    assert "Do not ask them questions" in rules
    assert "Do not use pet names" in rules
    assert "pull back emotionally" in rules


def test_generate_behavioral_rules_unlocks_positive_behaviors() -> None:
    rules = generate_behavioral_rules(0.9, FragilityProfile())

    assert "genuine vulnerability" in rules.lower() or "show genuine vulnerability" in rules.lower()
    assert "real intimacy" in rules.lower() or "speak with real intimacy" in rules.lower()


def test_get_fragility_profile_parses_provider_config() -> None:
    profile = get_fragility_profile({
        "provider_config": {
            "fragility_profile": {
                "hostility_threshold": 3,
                "trust_decay_multiplier": 1.4,
                "trust_repair_rate": 0.02,
                "hostility_response": "escalate",
                "breaking_behaviors": {"0.4": ["shorter_responses"]},
            }
        }
    })

    assert profile.hostility_threshold == 3
    assert profile.trust_decay_multiplier == 1.4
    assert profile.trust_repair_rate == 0.02
    assert profile.hostility_response == "escalate"
    assert profile.breaking_behaviors[0.4] == ["shorter_responses"]
