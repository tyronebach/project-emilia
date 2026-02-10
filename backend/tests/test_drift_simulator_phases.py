from services.drift_simulator import DriftSimulationConfig, DriftSimulator, ARCHETYPES


def test_phase_weights_switch_by_day():
    config = DriftSimulationConfig(
        agent_id="emilia-thai",
        user_id="sim-user",
        archetype="rough_day_then_recover",
        duration_days=3,
        sessions_per_day=1,
        messages_per_session=1,
        seed=1,
    )

    sim = DriftSimulator.__new__(DriftSimulator)
    sim.archetype = ARCHETYPES["rough_day_then_recover"]

    first_phase = sim._get_phase_weights(0, "trigger_weights")
    second_phase = sim._get_phase_weights(2, "trigger_weights")

    assert first_phase is not None
    assert second_phase is not None
    assert first_phase != second_phase


def test_phase_weights_cycle():
    sim = DriftSimulator.__new__(DriftSimulator)
    sim.archetype = ARCHETYPES["moody_week"]

    day0 = sim._get_phase_weights(0, "trigger_weights")
    day7 = sim._get_phase_weights(7, "trigger_weights")

    assert day0 == day7
