# Agent Designer — Frontend Specification

**Date:** 2026-02-08  
**Status:** Planning  
**URL:** designer.emiliaproject.com (separate app)

---

## Overview

A dedicated admin UI for designing, tuning, and testing AI agent emotional profiles. Separate from the main webapp to keep concerns isolated.

**Users:** Thai, Beatrice, advanced users  
**Purpose:** Create/edit agents without touching config files

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite (same as webapp) |
| UI | Tailwind + shadcn/ui or Flowbite |
| State | Zustand or TanStack Query |
| Charts | Chart.js or Recharts |
| Backend | Same FastAPI backend (new `/api/designer/*` routes) |
| Auth | Same auth as webapp |

---

## Core Features

### 1. Agent Profile Editor

**Baseline Tab**
- Name, description
- Baseline valence/arousal/dominance sliders (-1 to +1)
- Volatility slider (0.1 to 2.0)
- Recovery rate slider
- Decay rates per axis

**Mood Baseline Tab**
- 16 mood sliders (0-10 scale)
- Visual "mood shape" radar chart
- Presets: "Devoted", "Stoic", "Tsundere", etc.
- Copy from existing agent

**Trigger Multipliers Tab**
- Per-trigger multiplier (0.0 to 2.0)
- E.g., "compliment: 1.5x", "rejection: 1.3x"

### 2. Relationship Mapping Editor

**Per-relationship tab (Friend / Romantic)**
- Trigger → Mood matrix editor
- Each trigger shows mood weights (-4 to +4)
- Visual heatmap of trigger×mood effects
- Copy mappings between relationships

**Agent Overrides**
- Override specific trigger→mood for this agent
- E.g., "Ram + romantic: compliment → bashful:1 instead of euphoric:3"

### 3. Simulator

**Chat Simulator**
- Input test messages
- See trigger detection (regex + LLM side-by-side)
- See mood changes in real-time
- Dominant mood display
- LLM context preview

**Dialogue Runner**
- Load dialogue scenarios
- Step through or auto-run
- Mood trajectory chart over time
- Compare agents side-by-side

**A/B Testing**
- Run same dialogue with two different profiles
- Compare emotional trajectories
- Identify tuning differences

### 4. Visualizations

**Mood Radar Chart**
- Current mood weights as radar/spider chart
- Baseline shape vs current shape overlay

**Emotion Timeline**
- Time series of valence/arousal/trust
- Annotated with triggers
- Decay curves visible

**Trigger Heatmap**
- Matrix of triggers × moods
- Color-coded by weight
- Per-relationship tabs

### 5. Import/Export

- Export profile as JSON
- Import from JSON
- Sync to database
- Version history (optional)

---

## API Endpoints (New)

```
GET    /api/designer/agents              # List all agents
GET    /api/designer/agents/:id          # Get agent profile
PUT    /api/designer/agents/:id          # Update agent profile
POST   /api/designer/agents              # Create new agent

GET    /api/designer/relationships       # List relationship configs
GET    /api/designer/relationships/:type # Get relationship config
PUT    /api/designer/relationships/:type # Update relationship config

POST   /api/designer/simulate            # Run simulation
{
  "agent_id": "rem",
  "relationship": "romantic",
  "messages": ["Hello", "I love you"],
  "use_llm_detection": false
}

POST   /api/designer/detect-triggers     # Test trigger detection
{
  "message": "You're amazing!",
  "method": "both"  // "regex" | "llm" | "both"
}

GET    /api/designer/dialogues           # List dialogue scenarios
POST   /api/designer/run-dialogue        # Run dialogue scenario
```

---

## Page Structure

```
/                     → Dashboard (agent list, quick stats)
/agents/:id           → Agent editor (tabs: baseline, moods, triggers)
/agents/:id/mappings  → Relationship mapping editor
/simulator            → Chat simulator
/dialogues            → Dialogue scenario runner
/compare              → A/B comparison tool
/settings             → App settings
```

---

## Wireframes

### Dashboard
```
┌─────────────────────────────────────────────────────────┐
│  Agent Designer                            [+ New Agent]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │   Rem   │  │   Ram   │  │Beatrice │  │ + Add   │   │
│  │ ●●●●●○  │  │ ●●○○○○  │  │ ●●●○○○  │  │         │   │
│  │Devoted  │  │ Stoic   │  │Tsundere │  │         │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
│                                                         │
│  Quick Actions                                          │
│  [Run Simulator] [Compare Agents] [View Dialogues]     │
└─────────────────────────────────────────────────────────┘
```

### Agent Editor
```
┌─────────────────────────────────────────────────────────┐
│  ← Back    Rem                              [Save] [↗]  │
├─────────────────────────────────────────────────────────┤
│  [Baseline] [Mood Shape] [Triggers] [Relationships]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Mood Baseline                   Mood Radar             │
│  ┌─────────────────────┐        ┌─────────────────┐    │
│  │ supportive  ████████│ 8      │    supportive   │    │
│  │ vulnerable  ██████  │ 6      │   /    ╲        │    │
│  │ euphoric    █████   │ 5      │  /      ╲       │    │
│  │ bashful     ████    │ 4      │ ◆────────◆      │    │
│  │ flirty      ███     │ 3      │  ╲      /       │    │
│  │ zen         ██      │ 2      │   ╲    /        │    │
│  │ ...                 │        └─────────────────┘    │
│  └─────────────────────┘                               │
│                                                         │
│  Decay Rate: [====●====] 0.3                           │
└─────────────────────────────────────────────────────────┘
```

### Simulator
```
┌─────────────────────────────────────────────────────────┐
│  Simulator                                              │
├─────────────────────────────────────────────────────────┤
│  Agent: [Rem ▼]  Relationship: [Romantic ▼]            │
├───────────────────────┬─────────────────────────────────┤
│                       │  Emotional State                │
│  Chat Input           │  ┌─────────────────────────┐   │
│  ┌─────────────────┐  │  │ Valence:  [====●===] +0.4│   │
│  │ I love you      │  │  │ Trust:    [======●=] 0.7 │   │
│  │                 │  │  │ Dominant: supportive+vul │   │
│  └─────────────────┘  │  └─────────────────────────┘   │
│  [Send] [Detect Only] │                                 │
│                       │  Detected Triggers              │
│  History              │  ┌─────────────────────────┐   │
│  ┌─────────────────┐  │  │ Regex: affirmation:0.7  │   │
│  │ > Hello         │  │  │ LLM:   affirmation:0.9  │   │
│  │   greeting:0.7  │  │  │        vulnerability:0.6│   │
│  │ > I love you    │  │  └─────────────────────────┘   │
│  │   affirmation   │  │                                 │
│  └─────────────────┘  │  LLM Context Preview           │
│                       │  ┌─────────────────────────┐   │
│                       │  │ [EMOTIONAL_STATE]       │   │
│                       │  │ You're feeling strongly │   │
│                       │  │ supportive and vulner...│   │
│                       │  └─────────────────────────┘   │
└───────────────────────┴─────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Editor (MVP)
- Agent list/create/edit
- Baseline & mood editor
- JSON import/export
- Basic simulator (text input → triggers → state)

### Phase 2: Visualization
- Mood radar chart
- Emotion timeline
- Trigger heatmap

### Phase 3: Advanced Simulator
- Dialogue runner
- A/B comparison
- LLM vs regex toggle

### Phase 4: Polish
- Presets library
- Version history
- Multi-user collaboration

---

## Repository Structure

```
emilia-designer/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── AgentEditor.tsx
│   │   ├── Simulator.tsx
│   │   └── Dialogues.tsx
│   ├── components/
│   │   ├── MoodRadar.tsx
│   │   ├── TriggerMatrix.tsx
│   │   ├── EmotionTimeline.tsx
│   │   └── ...
│   ├── api/
│   │   └── designer.ts
│   └── stores/
│       └── agentStore.ts
├── package.json
└── vite.config.ts
```

---

## Next Steps

1. Create new repo: `emilia-designer`
2. Scaffold React + Vite project
3. Add designer API routes to backend
4. Implement Phase 1 (core editor)
5. Deploy to designer.emiliaproject.com

---

*This is a separate frontend from the main webapp, focused entirely on agent tuning and testing.*
