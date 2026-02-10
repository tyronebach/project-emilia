"""Drift Simulator — deterministic long-horizon simulation using EmotionEngine math."""
from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Any
import statistics

from db.repositories import AgentRepository, EmotionalStateRepository
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile, ALL_TRIGGERS


ARCHETYPES: dict[str, dict[str, Any]] = {
    "aggressive": {
        "name": "Aggressive",
        "description": "Demanding, critical, impatient user",
        "trigger_weights": {
            "criticism": 0.28,
            "boundary": 0.22,
            "dismissal": 0.18,
            "rejection": 0.14,
            "teasing": 0.08,
            "praise": 0.05,
            "affirmation": 0.05,
        },
        "outcome_weights": {
            "negative": 0.60,
            "neutral": 0.30,
            "positive": 0.10,
        },
    },
    "supportive": {
        "name": "Supportive",
        "description": "Encouraging, grateful, empathetic user",
        "trigger_weights": {
            "praise": 0.30,
            "affirmation": 0.25,
            "comfort": 0.20,
            "trust_signal": 0.10,
            "reconnection": 0.07,
            "teasing": 0.05,
            "disclosure": 0.03,
        },
        "outcome_weights": {
            "positive": 0.70,
            "neutral": 0.25,
            "negative": 0.05,
        },
    },
    "playful": {
        "name": "Playful",
        "description": "Joking, teasing, game-oriented user",
        "trigger_weights": {
            "teasing": 0.32,
            "banter": 0.28,
            "flirting": 0.15,
            "affirmation": 0.10,
            "praise": 0.07,
            "disclosure": 0.05,
            "trust_signal": 0.03,
        },
        "outcome_weights": {
            "positive": 0.50,
            "neutral": 0.40,
            "negative": 0.10,
        },
    },
    "flirty": {
        "name": "Flirty",
        "description": "Romantic, intimate, affectionate user",
        "trigger_weights": {
            "flirting": 0.30,
            "praise": 0.22,
            "disclosure": 0.16,
            "trust_signal": 0.12,
            "teasing": 0.10,
            "affirmation": 0.10,
        },
        "outcome_weights": {
            "positive": 0.55,
            "neutral": 0.35,
            "negative": 0.10,
        },
    },
    "neutral": {
        "name": "Neutral",
        "description": "Everyday conversation, tasks, small talk",
        "trigger_weights": {
            "affirmation": 0.22,
            "praise": 0.18,
            "comfort": 0.15,
            "disclosure": 0.12,
            "trust_signal": 0.10,
            "teasing": 0.08,
            "banter": 0.08,
            "reconnection": 0.07,
        },
        "outcome_weights": {
            "neutral": 0.60,
            "positive": 0.30,
            "negative": 0.10,
        },
    },
    "random": {
        "name": "Random",
        "description": "Unpredictable mix of all behaviors",
        "trigger_weights": "uniform",
        "outcome_weights": {
            "positive": 0.33,
            "neutral": 0.34,
            "negative": 0.33,
        },
    },
}


@dataclass
class DriftSimulationConfig:
    agent_id: str
    user_id: str
    archetype: str
    duration_days: int
    sessions_per_day: int
    messages_per_session: int
    session_gap_hours: float = 8.0
    overnight_gap_hours: float = 12.0
    seed: int | None = None


@dataclass
class TimelinePoint:
    day: int
    session: int
    message: int
    elapsed_hours: float
    trigger: str
    intensity: float
    outcome: str
    state: dict
    dominant_mood: str


@dataclass
class DaySummary:
    day: int
    avg_valence: float
    avg_arousal: float
    avg_trust: float
    avg_intimacy: float
    dominant_moods: list[str]
    trigger_counts: dict[str, int]


@dataclass
class TriggerStat:
    trigger: str
    count: int
    avg_intensity: float
    avg_valence_delta: float
    avg_arousal_delta: float
    avg_trust_delta: float


@dataclass
class DriftSimulationResult:
    config: DriftSimulationConfig
    timeline: list[TimelinePoint]
    daily_summaries: list[DaySummary]
    start_state: dict
    end_state: dict
    drift_vector: dict[str, float]
    mood_distribution: dict[str, float]
    trigger_stats: list[TriggerStat]
    stability_score: float
    recovery_rate: float
    significant_events: list[dict[str, Any]]


class DriftSimulator:
    def __init__(self, config: DriftSimulationConfig):
        self.config = config
        self.rng = Random(config.seed)

        if config.archetype not in ARCHETYPES:
            raise ValueError(f"Unknown archetype: {config.archetype}")

        self.archetype = ARCHETYPES[config.archetype]

        agent = AgentRepository.get_by_id(config.agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {config.agent_id}")

        profile_data = EmotionalStateRepository.get_agent_profile(config.agent_id)
        self.profile = AgentProfile.from_db(agent, profile_data)
        self.engine = EmotionEngine(self.profile)

        self.state = EmotionalState(
            valence=self.profile.baseline_valence,
            arousal=self.profile.baseline_arousal,
            dominance=self.profile.baseline_dominance,
            trust=0.5,
            attachment=0.3,
            familiarity=0.0,
            intimacy=0.2,
            playfulness_safety=0.5,
            conflict_tolerance=0.7,
            mood_weights=self.profile.mood_baseline.copy() if self.profile.mood_baseline else {},
        )

    def run(self) -> DriftSimulationResult:
        timeline: list[TimelinePoint] = []
        daily_summaries: list[DaySummary] = []
        start_state = self._snapshot_state()

        elapsed_hours = 0.0
        trigger_agg: dict[str, dict[str, float]] = {}

        for day in range(self.config.duration_days):
            day_points: list[TimelinePoint] = []

            for session in range(self.config.sessions_per_day):
                if day > 0 or session > 0:
                    gap = self._calculate_gap(day, session)
                    self.state = self.engine.apply_decay(self.state, gap * 3600)
                    self.engine.apply_mood_decay(self.state, gap * 3600)
                    elapsed_hours += gap

                for msg in range(self.config.messages_per_session):
                    trigger = self._sample_trigger()
                    intensity = self.rng.uniform(0.3, 1.0)

                    deltas = self.engine.apply_trigger(self.state, trigger, intensity)
                    mood_deltas = self.engine.calculate_mood_deltas_from_va({
                        "valence": deltas.get("valence", 0.0),
                        "arousal": deltas.get("arousal", 0.0),
                    })
                    if mood_deltas:
                        self.engine.apply_mood_deltas(self.state, mood_deltas)
                    self._track_trigger(trigger_agg, trigger, intensity, deltas)

                    outcome = self._sample_outcome()
                    self._apply_outcome(outcome)

                    point = TimelinePoint(
                        day=day,
                        session=session,
                        message=msg,
                        elapsed_hours=elapsed_hours,
                        trigger=trigger,
                        intensity=float(f"{intensity:.4f}"),
                        outcome=outcome,
                        state=self._snapshot_state(),
                        dominant_mood=self._get_dominant_mood(),
                    )
                    timeline.append(point)
                    day_points.append(point)

            daily_summaries.append(self._summarize_day(day, day_points))

        return DriftSimulationResult(
            config=self.config,
            timeline=timeline,
            daily_summaries=daily_summaries,
            start_state=start_state,
            end_state=self._snapshot_state(),
            drift_vector=self._calculate_drift(start_state, self.state.to_dict()),
            mood_distribution=self._calculate_mood_distribution(timeline),
            trigger_stats=self._calculate_trigger_stats(trigger_agg),
            stability_score=self._calculate_stability(timeline),
            recovery_rate=self._calculate_recovery_rate(timeline),
            significant_events=self._find_significant_events(timeline),
        )

    def _sample_trigger(self) -> str:
        weights = self.archetype["trigger_weights"]
        if weights == "uniform":
            return self.rng.choice(ALL_TRIGGERS)

        triggers, probs = zip(*weights.items())
        return self.rng.choices(triggers, weights=probs, k=1)[0]

    def _sample_outcome(self) -> str:
        weights = self.archetype["outcome_weights"]
        outcomes, probs = zip(*weights.items())
        return self.rng.choices(outcomes, weights=probs, k=1)[0]

    def _apply_outcome(self, outcome: str) -> None:
        if outcome == "positive":
            self.state.valence = min(1.0, self.state.valence + 0.02)
            self.state.trust = min(1.0, self.state.trust + 0.005)
        elif outcome == "negative":
            self.state.valence = max(-1.0, self.state.valence - 0.02)
            self.state.trust = max(0.0, self.state.trust - 0.003)

    def _calculate_gap(self, day: int, session: int) -> float:
        if session == 0 and day > 0:
            return self.config.overnight_gap_hours
        return self.config.session_gap_hours

    def _get_dominant_mood(self) -> str:
        moods = self.engine.get_dominant_moods(self.state, top_n=1)
        return moods[0][0] if moods else "neutral"

    def _snapshot_state(self) -> dict:
        snapshot = self.state.to_dict()
        if "mood_weights" in snapshot and isinstance(snapshot["mood_weights"], dict):
            snapshot["mood_weights"] = dict(snapshot["mood_weights"])
        return snapshot

    def _summarize_day(self, day: int, points: list[TimelinePoint]) -> DaySummary:
        if not points:
            return DaySummary(
                day=day,
                avg_valence=self.state.valence,
                avg_arousal=self.state.arousal,
                avg_trust=self.state.trust,
                avg_intimacy=self.state.intimacy,
                dominant_moods=[],
                trigger_counts={},
            )

        avg_valence = sum(p.state.get("valence", 0) for p in points) / len(points)
        avg_arousal = sum(p.state.get("arousal", 0) for p in points) / len(points)
        avg_trust = sum(p.state.get("trust", 0.5) for p in points) / len(points)
        avg_intimacy = sum(p.state.get("intimacy", 0.2) for p in points) / len(points)

        trigger_counts: dict[str, int] = {}
        mood_counts: dict[str, int] = {}
        for p in points:
            trigger_counts[p.trigger] = trigger_counts.get(p.trigger, 0) + 1
            mood_counts[p.dominant_mood] = mood_counts.get(p.dominant_mood, 0) + 1

        dominant_moods = [m for m, _ in sorted(mood_counts.items(), key=lambda x: x[1], reverse=True)[:3]]

        return DaySummary(
            day=day,
            avg_valence=round(avg_valence, 4),
            avg_arousal=round(avg_arousal, 4),
            avg_trust=round(avg_trust, 4),
            avg_intimacy=round(avg_intimacy, 4),
            dominant_moods=dominant_moods,
            trigger_counts=trigger_counts,
        )

    def _calculate_drift(self, start_state: dict, end_state: dict) -> dict[str, float]:
        keys = [
            "valence", "arousal", "dominance", "trust", "intimacy",
            "playfulness_safety", "conflict_tolerance", "attachment", "familiarity",
        ]
        return {
            key: round(float(end_state.get(key, 0)) - float(start_state.get(key, 0)), 4)
            for key in keys
        }

    def _calculate_mood_distribution(self, timeline: list[TimelinePoint]) -> dict[str, float]:
        if not timeline:
            return {}

        counts: dict[str, int] = {}
        for point in timeline:
            counts[point.dominant_mood] = counts.get(point.dominant_mood, 0) + 1

        total = len(timeline)
        return {m: round(c / total, 4) for m, c in counts.items()}

    def _track_trigger(
        self,
        agg: dict[str, dict[str, float]],
        trigger: str,
        intensity: float,
        deltas: dict[str, float],
    ) -> None:
        record = agg.setdefault(
            trigger,
            {
                "count": 0,
                "intensity_sum": 0.0,
                "valence_sum": 0.0,
                "arousal_sum": 0.0,
                "trust_sum": 0.0,
            },
        )

        record["count"] += 1
        record["intensity_sum"] += intensity
        record["valence_sum"] += deltas.get("valence", 0.0)
        record["arousal_sum"] += deltas.get("arousal", 0.0)
        record["trust_sum"] += deltas.get("trust", 0.0)

    def _calculate_trigger_stats(self, agg: dict[str, dict[str, float]]) -> list[TriggerStat]:
        stats: list[TriggerStat] = []
        for trigger, record in agg.items():
            count = int(record["count"])
            if count <= 0:
                continue
            stats.append(
                TriggerStat(
                    trigger=trigger,
                    count=count,
                    avg_intensity=round(record["intensity_sum"] / count, 4),
                    avg_valence_delta=round(record["valence_sum"] / count, 4),
                    avg_arousal_delta=round(record["arousal_sum"] / count, 4),
                    avg_trust_delta=round(record["trust_sum"] / count, 4),
                )
            )
        stats.sort(key=lambda s: s.count, reverse=True)
        return stats

    def _calculate_stability(self, timeline: list[TimelinePoint]) -> float:
        if len(timeline) < 2:
            return 1.0

        def _series(key: str) -> list[float]:
            return [float(p.state.get(key, 0.0)) for p in timeline]

        stds = [
            statistics.pstdev(_series("valence")),
            statistics.pstdev(_series("arousal")),
            statistics.pstdev(_series("trust")),
        ]
        avg_std = sum(stds) / len(stds)
        stability = 1.0 / (1.0 + avg_std * 2.5)
        return max(0.0, min(1.0, round(stability, 4)))

    def _calculate_recovery_rate(self, timeline: list[TimelinePoint]) -> float:
        if not timeline:
            return 1.0

        lengths: list[int] = []
        in_negative = False
        start_idx = 0

        for idx, point in enumerate(timeline):
            valence = float(point.state.get("valence", 0.0))
            if valence < -0.1 and not in_negative:
                in_negative = True
                start_idx = idx
            elif in_negative and valence >= -0.05:
                lengths.append(max(1, idx - start_idx))
                in_negative = False

        if in_negative:
            lengths.append(max(1, len(timeline) - start_idx))

        if not lengths:
            return 1.0

        avg_len = sum(lengths) / len(lengths)
        recovery = 1.0 / (1.0 + (avg_len / 20.0))
        return max(0.0, min(1.0, round(recovery, 4)))

    def _find_significant_events(self, timeline: list[TimelinePoint]) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if not timeline:
            return events

        last_mood = None
        last_trust = float(timeline[0].state.get("trust", 0.5))
        last_valence = float(timeline[0].state.get("valence", 0.0))

        for point in timeline:
            trust = float(point.state.get("trust", 0.5))
            valence = float(point.state.get("valence", 0.0))

            if trust < 0.3 <= last_trust:
                events.append({
                    "day": point.day,
                    "session": point.session,
                    "message": point.message,
                    "event": "trust_threshold",
                    "details": "Trust dropped below 0.3",
                })

            if valence < -0.5 <= last_valence:
                events.append({
                    "day": point.day,
                    "session": point.session,
                    "message": point.message,
                    "event": "valence_floor",
                    "details": "Valence dropped below -0.5",
                })

            if valence > 0.5 >= last_valence:
                events.append({
                    "day": point.day,
                    "session": point.session,
                    "message": point.message,
                    "event": "valence_peak",
                    "details": "Valence rose above 0.5",
                })

            if point.dominant_mood and point.dominant_mood != last_mood and point.dominant_mood != "neutral":
                if last_mood is not None:
                    events.append({
                        "day": point.day,
                        "session": point.session,
                        "message": point.message,
                        "event": "mood_shift",
                        "details": f"Dominant mood shifted to {point.dominant_mood}",
                    })
                last_mood = point.dominant_mood

            last_trust = trust
            last_valence = valence

        return events
