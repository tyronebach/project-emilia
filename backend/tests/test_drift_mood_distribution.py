from services.drift_simulator import DriftSimulator, TimelinePoint


def test_mood_distribution_uses_weighted_mood_mix():
    sim = DriftSimulator.__new__(DriftSimulator)

    timeline = [
        TimelinePoint(
            day=0,
            session=0,
            message=0,
            elapsed_hours=0.0,
            trigger="admiration",
            intensity=0.8,
            outcome="positive",
            state={"mood_weights": {"supportive": 9.0, "bashful": 1.0}},
            dominant_mood="supportive",
            primary_mood="supportive",
            secondary_mood="bashful",
        ),
        TimelinePoint(
            day=0,
            session=0,
            message=1,
            elapsed_hours=0.1,
            trigger="admiration",
            intensity=0.8,
            outcome="positive",
            state={"mood_weights": {"supportive": 6.0, "bashful": 4.0}},
            dominant_mood="supportive",
            primary_mood="supportive",
            secondary_mood="bashful",
        ),
    ]

    distribution = sim._calculate_mood_distribution(timeline)

    assert "supportive" in distribution
    assert "bashful" in distribution
    assert distribution["supportive"] == 0.75
    assert distribution["bashful"] == 0.25
