"""DEPRECATED — use dream system.

Drift Simulator — deterministic long-horizon simulation using EmotionEngine math.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Any, Literal
import statistics

from db.repositories import AgentRepository, ArchetypeRepository, EmotionalStateRepository
from services.emotion_engine import EmotionEngine, EmotionalState, AgentProfile, normalize_trigger


VALID_REPLAY_MODES = {"sequential", "random"}


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
    replay_mode: Literal["sequential", "random"] = "sequential"


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
    primary_mood: str
    secondary_mood: str | None
    triggers: list[dict[str, str | float]] = field(default_factory=list)


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

        if config.replay_mode not in VALID_REPLAY_MODES:
            raise ValueError(f"Invalid replay_mode: {config.replay_mode}")

        archetype = ArchetypeRepository.get(config.archetype)
        if not archetype:
            raise ValueError(f"Unknown archetype: {config.archetype}")

        self.archetype = archetype
        self.message_triggers = self._normalize_message_triggers(archetype.get("message_triggers"))
        if not self.message_triggers:
            raise ValueError(f"Archetype '{config.archetype}' has no replay data")

        self.outcome_weights = ArchetypeRepository.normalize_outcome_weights(
            archetype.get("outcome_weights")
        )
        self._message_index = 0

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
                    trigger_set = self._get_next_trigger_set()

                    total_va_delta = {"valence": 0.0, "arousal": 0.0}
                    for trigger, intensity in trigger_set:
                        deltas = self.engine.apply_trigger(self.state, trigger, intensity)
                        total_va_delta["valence"] += deltas.get("valence", 0.0)
                        total_va_delta["arousal"] += deltas.get("arousal", 0.0)
                        self._track_trigger(trigger_agg, trigger, intensity, deltas)

                    if trigger_set:
                        mood_deltas = self.engine.calculate_mood_deltas_from_va(total_va_delta)
                        if mood_deltas:
                            self.engine.apply_mood_deltas(self.state, mood_deltas)

                    outcome = self._sample_outcome()
                    self._apply_outcome(outcome)

                    injected = self.engine.get_injected_moods(self.state, top_n=2)
                    primary_mood = injected[0][0] if injected else "neutral"
                    secondary_mood = injected[1][0] if len(injected) > 1 else None

                    trigger_rows = [
                        {"trigger": trigger, "intensity": float(f"{intensity:.4f}")}
                        for trigger, intensity in trigger_set
                    ]
                    legacy_trigger = trigger_rows[0]["trigger"] if trigger_rows else "none"
                    legacy_intensity = float(trigger_rows[0]["intensity"]) if trigger_rows else 0.0

                    point = TimelinePoint(
                        day=day,
                        session=session,
                        message=msg,
                        elapsed_hours=elapsed_hours,
                        trigger=str(legacy_trigger),
                        intensity=float(f"{legacy_intensity:.4f}"),
                        outcome=outcome,
                        state=self._snapshot_state(),
                        dominant_mood=primary_mood,
                        primary_mood=primary_mood,
                        secondary_mood=secondary_mood,
                        triggers=trigger_rows,
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

    def _get_next_trigger_set(self) -> list[tuple[str, float]]:
        if self.config.replay_mode == "random":
            selected = self.rng.choice(self.message_triggers)
            return [(trigger, intensity) for trigger, intensity in selected]

        idx = self._message_index % len(self.message_triggers)
        self._message_index += 1
        selected = self.message_triggers[idx]
        return [(trigger, intensity) for trigger, intensity in selected]

    def _sample_outcome(self) -> str:
        outcomes, probs = zip(*self.outcome_weights.items())
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
        for point in points:
            if point.triggers:
                for trigger_row in point.triggers:
                    trigger = str(trigger_row.get("trigger") or "").strip()
                    if trigger:
                        trigger_counts[trigger] = trigger_counts.get(trigger, 0) + 1
            elif point.trigger and point.trigger != "none":
                trigger_counts[point.trigger] = trigger_counts.get(point.trigger, 0) + 1
            mood_counts[point.dominant_mood] = mood_counts.get(point.dominant_mood, 0) + 1

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

        # Aggregate all mood weights (normalized per point) so the distribution
        # reflects the full emotional mix, not only the top mood label.
        weights_sum: dict[str, float] = {}
        for point in timeline:
            mood_weights = point.state.get("mood_weights")
            if not isinstance(mood_weights, dict) or not mood_weights:
                mood = point.dominant_mood or "neutral"
                weights_sum[mood] = weights_sum.get(mood, 0.0) + 1.0
                continue

            positive_weights = {
                mood: max(0.0, float(weight))
                for mood, weight in mood_weights.items()
            }
            total = sum(positive_weights.values())
            if total <= 0:
                mood = point.dominant_mood or "neutral"
                weights_sum[mood] = weights_sum.get(mood, 0.0) + 1.0
                continue

            for mood, weight in positive_weights.items():
                if weight <= 0:
                    continue
                weights_sum[mood] = weights_sum.get(mood, 0.0) + (weight / total)

        grand_total = sum(weights_sum.values()) or 1.0
        distribution = {m: round(w / grand_total, 4) for m, w in weights_sum.items()}
        return dict(sorted(distribution.items(), key=lambda item: item[1], reverse=True))

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

    @staticmethod
    def _normalize_message_triggers(raw: Any) -> list[list[tuple[str, float]]]:
        if not isinstance(raw, list):
            return []

        normalized: list[list[tuple[str, float]]] = []
        for item in raw:
            if not isinstance(item, list):
                continue

            trigger_map: dict[str, float] = {}
            for pair in item:
                if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                    continue
                trigger_raw, intensity_raw = pair
                trigger = normalize_trigger(str(trigger_raw).strip().lower()) or str(trigger_raw).strip().lower()
                if trigger not in EmotionEngine.DEFAULT_TRIGGER_DELTAS:
                    continue
                try:
                    intensity = float(intensity_raw)
                except (TypeError, ValueError):
                    continue
                intensity = max(0.0, min(1.0, intensity))
                if trigger not in trigger_map or intensity > trigger_map[trigger]:
                    trigger_map[trigger] = intensity

            ordered = sorted(trigger_map.items(), key=lambda x: x[1], reverse=True)
            normalized.append([(trigger, float(f"{intensity:.4f}")) for trigger, intensity in ordered])

        return normalized
