# P003: Emotion Drift Simulator

**Status:** Proposed
**Created:** 2026-02-09
**Author:** Beatrice (for Thai)

## Goal

Build a simulation system to test how an agent's emotional state evolves when exposed to different user personality types over extended time periods (1 week to 1 month to 1 year).

## Problem

Current `/designer-v2` Simulator only tests single messages. Designers can't predict:
- How an agent will drift emotionally over many interactions
- Whether an agent becomes too negative with aggressive users
- Whether trust/intimacy builds appropriately with supportive users
- If decay rates are properly tuned

## Solution

**Drift Simulator** — Run deterministic simulations of extended conversations using the emotion engine math (no LLM calls).

---

## Architecture

### 1. User Archetypes

Predefined patterns of user behavior with trigger distributions:

```python
ARCHETYPES = {
    "aggressive": {
        "name": "Aggressive",
        "description": "Demanding, critical, impatient user",
        "trigger_weights": {
            "criticism": 0.25,
            "demands": 0.20,
            "impatience": 0.15,
            "conflict": 0.15,
            "rejection": 0.10,
            "neutral": 0.10,
            "gratitude": 0.03,
            "affection": 0.02,
        },
        "outcome_weights": {
            "negative": 0.60,  # Agent pushes back
            "neutral": 0.30,
            "positive": 0.10,
        },
    },
    "supportive": {
        "name": "Supportive",
        "description": "Encouraging, grateful, empathetic user",
        "trigger_weights": {
            "gratitude": 0.30,
            "encouragement": 0.25,
            "affection": 0.20,
            "empathy": 0.10,
            "neutral": 0.10,
            "teasing": 0.05,
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
            "teasing": 0.30,
            "humor": 0.25,
            "shared_joy": 0.20,
            "affection": 0.10,
            "neutral": 0.10,
            "vulnerability": 0.05,
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
            "affection": 0.30,
            "intimacy": 0.25,
            "compliments": 0.20,
            "teasing": 0.10,
            "vulnerability": 0.10,
            "neutral": 0.05,
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
            "neutral": 0.50,
            "gratitude": 0.15,
            "curiosity": 0.15,
            "small_talk": 0.10,
            "affection": 0.05,
            "teasing": 0.05,
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
        "trigger_weights": "uniform",  # Equal weight to all triggers
        "outcome_weights": {
            "positive": 0.33,
            "neutral": 0.34,
            "negative": 0.33,
        },
    },
}
```

### 2. Simulation Config

```python
@dataclass
class DriftSimulationConfig:
    agent_id: str
    user_id: str               # Use existing bond or create temporary
    archetype: str             # Key from ARCHETYPES
    duration_days: int         # 7, 30, 90, etc.
    sessions_per_day: int      # 1-3
    messages_per_session: int  # 10-50
    session_gap_hours: float   # Hours between sessions in a day (default 8)
    overnight_gap_hours: float # Hours between last session and next day (default 12)
    seed: int | None           # For reproducibility
```

### 3. Simulation Result

```python
@dataclass
class DriftSimulationResult:
    config: DriftSimulationConfig

    # Timeline data (for charts)
    timeline: list[TimelinePoint]  # Per-message snapshots
    daily_summaries: list[DaySummary]

    # Start/end comparison
    start_state: dict   # Emotional state snapshot at start
    end_state: dict     # Emotional state snapshot at end

    # Analysis
    drift_vector: dict[str, float]  # Net change per dimension
    mood_distribution: dict[str, float]  # % time in each mood
    trigger_stats: list[TriggerStat]  # Count + avg impact per trigger
    stability_score: float  # 0-1, low variance = stable
    recovery_rate: float    # How fast agent bounces back from negative

    # Notable events
    significant_events: list[Event]  # Threshold crossings, mood flips

@dataclass
class TimelinePoint:
    day: int
    session: int
    message: int
    elapsed_hours: float  # Since simulation start
    trigger: str
    intensity: float
    outcome: str  # positive/neutral/negative
    state: dict   # Full emotional state snapshot
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
```

### 4. Simulation Engine

```python
class DriftSimulator:
    def __init__(self, config: DriftSimulationConfig):
        self.config = config
        self.rng = Random(config.seed)
        self.archetype = ARCHETYPES[config.archetype]

        # Load agent profile
        agent = AgentRepository.get_by_id(config.agent_id)
        profile_data = EmotionalStateRepository.get_agent_profile(config.agent_id)
        self.profile = AgentProfile.from_db(agent, profile_data)
        self.engine = EmotionEngine(self.profile)

        # Initialize state from agent baseline (fresh start)
        self.state = EmotionalState.from_baseline(self.profile)

    def run(self) -> DriftSimulationResult:
        timeline = []
        daily_summaries = []
        start_state = self.state.snapshot()

        elapsed_hours = 0.0

        for day in range(self.config.duration_days):
            day_points = []

            for session in range(self.config.sessions_per_day):
                # Apply decay since last session
                if day > 0 or session > 0:
                    gap = self._calculate_gap(day, session)
                    self.state = self.engine.apply_decay(self.state, gap * 3600)
                    self.engine.apply_mood_decay(self.state, gap * 3600)
                    elapsed_hours += gap

                for msg in range(self.config.messages_per_session):
                    # Sample trigger from archetype distribution
                    trigger = self._sample_trigger()
                    intensity = self.rng.uniform(0.3, 1.0)

                    # Apply trigger
                    self.engine.apply_trigger(self.state, trigger, intensity)

                    # Sample and apply outcome
                    outcome = self._sample_outcome()
                    self._apply_outcome(outcome)

                    # Record point
                    point = TimelinePoint(
                        day=day,
                        session=session,
                        message=msg,
                        elapsed_hours=elapsed_hours,
                        trigger=trigger,
                        intensity=intensity,
                        outcome=outcome,
                        state=self.state.snapshot(),
                        dominant_mood=self._get_dominant_mood(),
                    )
                    timeline.append(point)
                    day_points.append(point)

            # Daily summary
            daily_summaries.append(self._summarize_day(day, day_points))

        return DriftSimulationResult(
            config=self.config,
            timeline=timeline,
            daily_summaries=daily_summaries,
            start_state=start_state,
            end_state=self.state.snapshot(),
            drift_vector=self._calculate_drift(start_state),
            mood_distribution=self._calculate_mood_distribution(timeline),
            trigger_stats=self._calculate_trigger_stats(timeline),
            stability_score=self._calculate_stability(timeline),
            recovery_rate=self._calculate_recovery_rate(timeline),
            significant_events=self._find_significant_events(timeline),
        )

    def _sample_trigger(self) -> str:
        weights = self.archetype["trigger_weights"]
        if weights == "uniform":
            return self.rng.choice(ALL_TRIGGERS)
        triggers, probs = zip(*weights.items())
        return self.rng.choices(triggers, weights=probs)[0]

    def _sample_outcome(self) -> str:
        weights = self.archetype["outcome_weights"]
        outcomes, probs = zip(*weights.items())
        return self.rng.choices(outcomes, weights=probs)[0]

    def _apply_outcome(self, outcome: str):
        # Simulate post-LLM outcome effect
        if outcome == "positive":
            self.state.valence = min(1.0, self.state.valence + 0.02)
            self.state.trust = min(1.0, self.state.trust + 0.005)
        elif outcome == "negative":
            self.state.valence = max(-1.0, self.state.valence - 0.02)
            self.state.trust = max(0.0, self.state.trust - 0.003)
        # neutral: no additional effect

    def _calculate_gap(self, day: int, session: int) -> float:
        if session == 0 and day > 0:
            return self.config.overnight_gap_hours
        return self.config.session_gap_hours
```

---

## API Endpoints

### `GET /api/designer/v2/archetypes`

List available user archetypes.

```json
{
  "archetypes": [
    {
      "id": "aggressive",
      "name": "Aggressive",
      "description": "Demanding, critical, impatient user",
      "trigger_preview": ["criticism", "demands", "impatience"]
    },
    ...
  ]
}
```

### `POST /api/designer/v2/drift-simulate`

Run a drift simulation.

**Request:**
```json
{
  "agent_id": "emilia",
  "user_id": "test-user",
  "archetype": "aggressive",
  "duration_days": 30,
  "sessions_per_day": 2,
  "messages_per_session": 20,
  "session_gap_hours": 8,
  "overnight_gap_hours": 12,
  "seed": 42
}
```

**Response:**
```json
{
  "config": { ... },
  "timeline": [ ... ],  // Condensed or paginated for large sims
  "daily_summaries": [
    {
      "day": 0,
      "avg_valence": 0.15,
      "avg_arousal": 0.08,
      "avg_trust": 0.48,
      "avg_intimacy": 0.22,
      "dominant_moods": ["content", "neutral"],
      "trigger_counts": { "criticism": 5, "demands": 4, ... }
    },
    ...
  ],
  "start_state": { "valence": 0.2, "arousal": 0.0, "trust": 0.5, ... },
  "end_state": { "valence": -0.4, "arousal": 0.3, "trust": 0.2, ... },
  "drift_vector": { "valence": -0.6, "arousal": 0.3, "trust": -0.3, "intimacy": -0.1 },
  "mood_distribution": { "angry": 0.25, "sad": 0.15, "neutral": 0.30, ... },
  "trigger_stats": [
    { "trigger": "criticism", "count": 150, "avg_valence_delta": -0.08 },
    ...
  ],
  "stability_score": 0.35,
  "recovery_rate": 0.42,
  "significant_events": [
    { "day": 5, "event": "trust_threshold", "details": "Trust dropped below 0.3" },
    ...
  ]
}
```

### `POST /api/designer/v2/drift-compare`

Run multiple archetypes and compare.

**Request:**
```json
{
  "agent_id": "emilia",
  "archetypes": ["aggressive", "supportive", "neutral"],
  "duration_days": 7,
  "sessions_per_day": 2,
  "messages_per_session": 20
}
```

**Response:**
```json
{
  "comparisons": [
    { "archetype": "aggressive", "result": { ... } },
    { "archetype": "supportive", "result": { ... } },
    { "archetype": "neutral", "result": { ... } }
  ]
}
```

---

## Frontend UI

### New Tab: "Drift Simulator"

Add a new tab in `/designer-v2` alongside existing tabs.

### Configuration Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DRIFT SIMULATOR                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Agent: [Emilia ▼]              User Archetype: [Aggressive ▼]          │
│                                                                          │
│  Duration                                                                │
│  ○ 1 Week   ● 1 Month   ○ Custom [___] days                             │
│                                                                          │
│  Session Parameters                                                      │
│  Sessions/Day: [2] ─────●───────  Messages/Session: [20] ───●─────      │
│                                                                          │
│  ☐ Compare multiple archetypes                                          │
│    [✓] Aggressive  [✓] Supportive  [✓] Neutral  [ ] Playful  [ ] Flirty │
│                                                                          │
│  [▶ Run Simulation]                          Seed: [______] (optional)  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Results View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  RESULTS: Emilia × Aggressive User (30 days)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📈 Emotional Trajectory                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │           [Line chart: valence, arousal, trust, intimacy vs days]   ││
│  │    ───── Valence    ───── Arousal    ───── Trust    ───── Intimacy  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  🎭 Mood Distribution       │  │  📊 Drift Summary                │  │
│  │  ┌────────────────────────┐ │  │                                  │  │
│  │  │ [Pie/donut chart]      │ │  │  Dimension    Start → End       │  │
│  │  │  Angry 25%             │ │  │  ─────────────────────────────  │  │
│  │  │  Sad 15%               │ │  │  Valence     +0.20 → -0.40  ⬇   │  │
│  │  │  Neutral 30%           │ │  │  Arousal     +0.00 → +0.30  ⬆   │  │
│  │  │  Annoyed 12%           │ │  │  Trust        0.50 →  0.20  ⬇   │  │
│  │  │  Other 18%             │ │  │  Intimacy     0.20 →  0.10  ⬇   │  │
│  │  └────────────────────────┘ │  │                                  │  │
│  └─────────────────────────────┘  │  Stability: ⚠️ Low (0.35)        │  │
│                                   │  Recovery:  Slow (0.42)          │  │
│                                   └──────────────────────────────────┘  │
│                                                                          │
│  🎯 Trigger Impact (Top 5)                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Trigger      Count   Avg ΔVal   Avg ΔAro   Avg ΔTrust              ││
│  │ ─────────────────────────────────────────────────────               ││
│  │ criticism    150     -0.08      +0.04      -0.02                   ││
│  │ demands       96     -0.05      +0.06      -0.01                   ││
│  │ impatience    72     -0.04      +0.05      -0.01                   ││
│  │ conflict      45     -0.10      +0.08      -0.03                   ││
│  │ rejection     30     -0.12      +0.02      -0.04                   ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ⚡ Significant Events                                                   │
│  • Day 5: Trust dropped below 0.3                                        │
│  • Day 12: Dominant mood shifted to "angry"                              │
│  • Day 18: Valence reached floor (-0.6)                                  │
│                                                                          │
│  [Export JSON]  [Compare Archetypes]  [Run Again]  [Reset]              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Comparison View (when multiple archetypes selected)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COMPARISON: Emilia × 3 Archetypes (7 days)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  📈 Valence Over Time                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  [Multi-line chart: one line per archetype]                         ││
│  │  ───── Aggressive  ───── Supportive  ───── Neutral                  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  📊 Final State Comparison                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Archetype      Valence   Arousal   Trust   Intimacy   Stability    ││
│  │ ────────────────────────────────────────────────────────────────    ││
│  │ Aggressive     -0.40     +0.30     0.20    0.10       Low ⚠️       ││
│  │ Supportive     +0.60     +0.15     0.85    0.55       High ✓       ││
│  │ Neutral        +0.10     +0.05     0.52    0.28       Med          ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
backend/
  services/
    drift_simulator.py        # NEW: DriftSimulator class, archetypes
  routers/
    designer_v2.py            # ADD: /drift-simulate, /drift-compare, /archetypes

frontend/src/
  components/designer/
    DriftSimulatorTab.tsx     # NEW: Main drift simulator UI
    DriftConfigPanel.tsx      # NEW: Configuration form
    DriftResultsView.tsx      # NEW: Results display
    DriftComparisonView.tsx   # NEW: Multi-archetype comparison
    DriftChart.tsx            # NEW: Recharts line/pie charts
  types/
    designer.ts               # ADD: DriftSimulationConfig, DriftSimulationResult, etc.
  utils/
    designerApiV2.ts          # ADD: runDriftSimulation, getArchetypes, etc.
```

---

## Codex Prompt

```
Read P003-DRIFT-SIMULATOR.md in /home/tbach/Projects/emilia-project/emilia-webapp/docs/planning/

Implement the Drift Simulator for the emotion engine.

## Phase 1: Backend

### File: backend/services/drift_simulator.py (NEW)

Create this file with:

1. ARCHETYPES dict with these archetypes:
   - aggressive, supportive, playful, flirty, neutral, random
   - Each has: name, description, trigger_weights (dict), outcome_weights (dict)
   - Use triggers from emotion_engine.ALL_TRIGGERS

2. Dataclasses:
   - DriftSimulationConfig
   - DriftSimulationResult
   - TimelinePoint
   - DaySummary
   - TriggerStat

3. DriftSimulator class:
   - __init__(config): Load agent profile, create EmotionEngine, init state from baseline
   - run() -> DriftSimulationResult: Main simulation loop
   - Helper methods for sampling, gap calculation, analysis

Reference emotion_engine.py for:
- EmotionEngine, EmotionalState, AgentProfile imports
- apply_trigger(), apply_decay(), apply_mood_decay() usage
- ALL_TRIGGERS list

### File: backend/routers/designer_v2.py

Add these endpoints:

1. GET /archetypes - Return list of archetypes with id, name, description
2. POST /drift-simulate - Run single simulation, return DriftSimulationResult
3. POST /drift-compare - Run multiple archetypes, return comparison

Add imports for drift_simulator module.

## Phase 2: Frontend

### File: frontend/src/types/designer.ts

Add TypeScript types matching the backend dataclasses:
- DriftSimulationConfig
- DriftSimulationResult
- TimelinePoint
- DaySummary
- TriggerStat
- Archetype

### File: frontend/src/utils/designerApiV2.ts

Add API functions:
- getArchetypes(): Promise<Archetype[]>
- runDriftSimulation(config: DriftSimulationConfig): Promise<DriftSimulationResult>
- runDriftComparison(agentId, archetypes[], duration): Promise<ComparisonResult>

### File: frontend/src/components/designer/DriftSimulatorTab.tsx (NEW)

Create the drift simulator tab with:
1. Config panel (agent selector, archetype selector, duration, sessions/day, messages/session)
2. Run button
3. Results view with:
   - Line chart for emotional trajectory (use recharts or similar)
   - Mood distribution pie chart
   - Drift summary table
   - Trigger impact table
   - Significant events list
4. Loading and error states

Use existing UI patterns from SimulatorTab.tsx for styling.

### File: frontend/src/components/designer/DesignerPageV2.tsx

Add 'drift' tab option and render DriftSimulatorTab.

### File: frontend/src/components/designer/DesignerTabsV2.tsx

Add "Drift" tab button.

## Notes

- No LLM calls - simulation is purely mathematical using EmotionEngine
- Use seeded random for reproducibility (Python random.Random with seed)
- For charts, use recharts (already in project) or add lightweight charting lib
- Keep timeline data reasonable size (daily aggregates for charts, full data in JSON export)
- Simulation of 30 days × 2 sessions × 20 messages = 1200 points - should be fast (<1s)

## Testing

After implementation:
1. Go to /designer-v2, select Drift tab
2. Select an agent and "aggressive" archetype
3. Run 7-day simulation
4. Verify charts show declining valence/trust
5. Run comparison with aggressive vs supportive
6. Verify comparison shows divergent trajectories
```

---

## Dependencies

- **recharts** — Need to add: `cd frontend && npm install recharts`
- No additional backend dependencies needed

## Future Enhancements

1. **Custom archetypes** — Let designers define their own trigger distributions
2. **Scenario scripting** — Define specific trigger sequences (e.g., "honeymoon then betrayal")
3. **Export to CSV** — For external analysis
4. **Monte Carlo mode** — Run N simulations with different seeds, show confidence intervals
