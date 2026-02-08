# Agent Designer

Admin UI for editing agent emotional profiles and relationship configs.

## Features

- **Agent Editor**: Tune 16-mood baselines per agent with visual sliders
- **Relationship Editor**: Configure trigger→mood mappings per relationship type
- **Real-time Preview**: See which moods are active and their intensities
- **Categories**: Moods grouped by positive/negative/neutral valence

## The 16 Moods

| Mood | Emoji | Category |
|------|-------|----------|
| bashful | 😊 | neutral |
| defiant | 😤 | negative |
| enraged | 🔥 | negative |
| erratic | 🌀 | neutral |
| euphoric | ✨ | positive |
| flirty | 😏 | neutral |
| melancholic | 😢 | negative |
| sarcastic | 😒 | neutral |
| sassy | 💅 | neutral |
| seductive | 💋 | neutral |
| snarky | 🙄 | neutral |
| supportive | 🤗 | positive |
| suspicious | 🤨 | negative |
| vulnerable | 🥺 | neutral |
| whimsical | 🦋 | positive |
| zen | 🧘 | positive |

## Setup

```bash
# Terminal 1: Backend (from emilia-webapp root)
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8080

# Terminal 2: Designer frontend
cd frontend/designer
npm install
npm run dev
# Opens on http://localhost:3002
```

## API Routes

The designer uses these endpoints (mounted on the existing FastAPI backend):

```
GET  /api/designer/moods              - List all 16 moods with metadata
GET  /api/designer/agents             - List all agents
GET  /api/designer/agents/:id         - Get agent config
PUT  /api/designer/agents/:id         - Update agent config
GET  /api/designer/relationships      - List relationship types  
GET  /api/designer/relationships/:type - Get relationship config
PUT  /api/designer/relationships/:type - Update relationship config
```

## Data Storage

### Agents: SQLite Database

Agent emotional profiles are stored in the `agents` table (`emotional_profile` JSON column).
This is the single source of truth for agent configuration.

### Relationships: JSON Files

Relationship templates are stored as JSON files:

```
configs/
├── moods.json              # Mood definitions (static)
└── relationships/
    ├── friend.json         # trigger_mood_map for friend
    └── romantic.json       # trigger_mood_map for romantic
```

## Tech Stack

- React 19
- TanStack Router (file-based routing)
- TanStack Query (data fetching)
- Tailwind CSS v4
- Radix UI (slider, tooltip)
- Vite
