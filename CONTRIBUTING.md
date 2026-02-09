# Contributing to Emilia Webapp

Emilia is a trusted household LLM avatar chat app with a FastAPI backend (connecting to an OpenClaw gateway) and a React + Three.js frontend that renders interactive VRM avatars. This guide covers how to set up the project, follow our conventions, and submit changes.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Running the App](#running-the-app)
- [Coding Guidelines](#coding-guidelines)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)
- [Project-Specific Rules](#project-specific-rules)

---

## Getting Started

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd emilia-webapp
   ```

2. Read these files first to understand the current state:
   - `CHANGELOG.md` — recent changes and version history
   - `AGENTS.md` — quick reference for project structure and commands
   - `docs/animation/ARCHITECTURE.md` — primary animation/avatar architecture doc

## Project Structure

```
emilia-webapp/
├── backend/                 # FastAPI (Python 3.11+)
│   ├── main.py              # App setup, router registration, health endpoint
│   ├── config.py            # Environment-based settings (Settings class)
│   ├── dependencies.py      # FastAPI Depends() for auth & header extraction
│   ├── routers/             # API route modules (8 routers)
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # External API clients (ElevenLabs, EmotionEngine)
│   ├── db/
│   │   ├── connection.py    # SQLite connection, schema, migrations
│   │   └── repositories/    # Static-method CRUD classes (no ORM)
│   ├── core/exceptions.py   # Custom exception hierarchy
│   └── tests/               # pytest test suite
│
├── frontend/                # React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── routes/          # TanStack Router file-based pages
│   │   ├── components/      # React UI components
│   │   ├── avatar/          # Three.js + VRM avatar subsystems
│   │   ├── store/           # Zustand state stores
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions (API client, helpers)
│   │   ├── types/           # TypeScript type definitions
│   │   └── components/ui/   # shadcn/ui base components
│   ├── public/              # Static assets (VRM models, animations)
│   └── eslint.config.js     # ESLint 9 flat config
│
├── data/                    # SQLite database (emilia.db)
├── docs/                    # Documentation
│   ├── animation/           # Animation pipeline docs (primary reference)
│   └── archive/             # Historical design docs
├── scripts/                 # Dev helper scripts
├── docker-compose.yml       # Backend container orchestration
└── nginx.conf               # Frontend proxy config
```

## Development Setup

### Prerequisites

- **Python 3.11+**
- **Node.js 20+** and npm
- **Docker** (optional, for containerized backend)
- Access to an OpenClaw gateway instance

### Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Required environment variables (set in your shell or source from a `.env` file):

| Variable | Description |
|----------|-------------|
| `CLAWDBOT_TOKEN` | OpenClaw gateway auth token |
| `AUTH_TOKEN` | API bearer token for client auth |
| `AUTH_ALLOW_DEV_TOKEN` | Set to `1` to enable the dev token in development |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `CLAWDBOT_URL` | OpenClaw gateway URL (default: `http://127.0.0.1:18789`) |
| `STT_SERVICE_URL` | Speech-to-text service URL |

Secrets are sourced from `~/.openclaw/secrets.env` in the Docker setup.

### Frontend

```bash
cd frontend
npm install
```

The dev server requires HTTPS certificates for voice features. Place self-signed certs at:
- `frontend/certs/selfsigned.key`
- `frontend/certs/selfsigned.crt`

Generate them if needed:
```bash
mkdir -p frontend/certs
openssl req -x509 -newkey rsa:2048 -keyout frontend/certs/selfsigned.key \
  -out frontend/certs/selfsigned.crt -days 365 -nodes -subj '/CN=localhost'
```

## Running the App

### Full stack with Docker

```bash
docker compose up -d --build
docker compose logs -f backend
```

### Local development (recommended for active development)

**Backend** (terminal 1):
```bash
./scripts/dev-backend-local.sh    # Starts uvicorn on :8080 with --reload
```

**Frontend** (terminal 2):
```bash
./scripts/dev-frontend.sh         # Starts Vite on https://localhost:3443
```

The Vite dev server proxies `/api` requests to the backend on port 8080.

### Service URLs

| Service | URL |
|---------|-----|
| Frontend | https://localhost:3443 |
| Backend API | http://localhost:8080 |
| Swagger docs | http://localhost:8080/docs |

---

## Coding Guidelines

### Python (Backend)

**Style:**
- `snake_case` for functions, variables, and database columns
- `PascalCase` for classes
- `SCREAMING_SNAKE_CASE` for constants
- Python 3.11+ syntax: use `str | None` instead of `Optional[str]`
- Keep dependencies minimal — prefer stdlib where possible

**Imports** — group with a blank line between each section:
```python
# 1. Standard library
import asyncio
import json
import logging

# 2. Third-party
import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

# 3. Local
from config import settings
from core.exceptions import not_found, forbidden
from db.repositories import UserRepository
```

**API patterns:**
- All route handlers are `async def`
- Use dependency injection from `dependencies.py`: `Depends(get_user_id)`, `Depends(get_agent_id)`, etc.
- Request/response models go in `schemas/requests.py` and `schemas/responses.py`
- Use Pydantic `Field(...)` for validation constraints
- Raise exception factory functions from `core/exceptions.py` (`not_found()`, `forbidden()`, `bad_request()`) — don't construct `HTTPException` directly
- Services raise domain exceptions (e.g., `TTSError`); the global handler converts `ServiceException` to 503

**Database:**
- Direct SQL with parameterized queries (no ORM)
- Repository pattern: static methods on classes, one per entity
- Use `with get_db() as conn:` context manager for all DB access
- Add new tables/columns via idempotent migrations in `db/connection.py`

**Adding a new endpoint:**
1. Create or update a router in `backend/routers/`
2. Add request/response models in `backend/schemas/`
3. Register the router in `backend/main.py` via `app.include_router()`

### TypeScript / React (Frontend)

**Style:**
- `PascalCase` for React components and type/interface names
- `camelCase` for functions, variables, hooks, and store names
- `UPPER_SNAKE_CASE` for constants
- Use the `@/` path alias for all imports from `src/` (configured in `tsconfig.json` and `vite.config.ts`)
- TypeScript strict mode is enabled — all code must type-check

**Imports** — group in this order:
```typescript
// 1. React and router
import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

// 2. Third-party libraries
import { Settings } from 'lucide-react';

// 3. Local imports
import { useAppStore } from '@/store';
import { fetchWithAuth } from '@/utils/api';
import type { Message } from '@/types';
```

**Component patterns:**
- Functional components only — no class components
- Props defined as TypeScript interfaces
- Use `export default` for page/route components; named exports for utilities and hooks
- Custom hooks go in `src/hooks/`; prefix with `use`

**State management:**
- **Zustand** for global client state (stores in `src/store/`)
- **TanStack Query** for server/API state
- **Local `useState`** for UI-only state (modals, drawers)
- Use Zustand selectors to pick only the state you need:
  ```typescript
  const status = useAppStore((s) => s.status);
  ```

**Styling:**
- TailwindCSS v4 utility classes
- `cn()` helper (from `@/lib/utils`) for conditional class merging
- shadcn/ui components in `src/components/ui/`
- Theme colors defined as CSS custom properties in `src/index.css`

**Linting:**
- ESLint 9 flat config with `typescript-eslint` and `react-hooks` plugins
- Unused variables must be prefixed with `_` (for parameters) or be UPPER_CASE
- Run `npm run lint` before submitting

**Adding a new page:**
1. Create a route file in `frontend/src/routes/` following TanStack Router naming
2. Run `npm run routes` to regenerate `routeTree.gen.ts`

**Adding a debug section:**
1. Create the section file in `src/components/debug/hud/` or `debug/avatar/`
2. Add one entry to the sections array in the corresponding `index.ts`

---

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Every commit message should have this format:

```
<type>(<scope>): <description>
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Code restructuring with no behavior change |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, or dependency updates |

### Scope (optional)

Use the area of the codebase affected: `debug`, `chat`, `avatar`, `designer_v2`, `emotion`, `tts`, etc.

### Examples

```
feat(debug): modular debug panels with toggle persistence
fix: resolve remaining code review findings
perf: async batched LLM trigger detection
feat(designer_v2): reset baseline mood for all users
docs: add dev scripts for Designer + local backend
```

Keep the subject line under ~72 characters. Use the body for additional detail when needed.

---

## Pull Request Process

1. **Branch off `master`** — create a descriptive branch name:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Run all checks before pushing:**
   ```bash
   ./scripts/check-all.sh
   ```
   This runs backend tests, frontend tests, ESLint, and a production build.

3. **Keep PRs focused** — one feature or fix per PR. If a change spans both backend and frontend, that's fine, but avoid bundling unrelated changes.

4. **Write a clear PR description** — summarize what changed and why. Include a test plan.

5. **Do not push directly to `master`** — always open a PR and get review.

6. **Do not force-push** unless you have a good reason and have communicated it.

---

## Testing

### Backend

```bash
# Run all tests (prefers Docker, falls back to venv)
./backend/scripts/run-tests.sh

# Run directly with venv
cd backend && .venv/bin/python -m pytest tests/ -v

# Run a specific test file
cd backend && .venv/bin/python -m pytest tests/test_parse_chat.py -v
```

Tests use `pytest` with `anyio` for async support. Key patterns:
- Fixtures in `tests/conftest.py` provide `test_client`, `auth_headers`, and mocked httpx
- Tests use an isolated SQLite DB at `/tmp/emilia-test.db`
- External service calls (OpenClaw, ElevenLabs) must be mocked

### Frontend

```bash
cd frontend

npm test                  # Run all tests once
npm run test:watch        # Watch mode
npm run test:ui           # Visual test explorer
npm run test:coverage     # Coverage report
```

Tests use Vitest + Testing Library. Key patterns:
- Test files are co-located with source: `foo.ts` / `foo.test.ts`
- Global test setup in `src/test/setup.ts` (jest-dom matchers, mocks)
- Zustand stores should be reset in `beforeEach`
- jsdom environment for DOM testing

### What to test

- **New API endpoints**: at minimum, test auth requirements and happy path
- **Business logic**: parse functions, state transformations, utilities
- **Stores**: state mutations and derived values
- All existing tests must pass before merging

---

## Documentation

- **Primary architecture doc**: `docs/animation/ARCHITECTURE.md` — update when changing avatar or animation systems
- **API reference**: auto-generated Swagger at `/docs` when the backend is running
- **CHANGELOG.md**: update with notable changes for each version
- **AGENTS.md**: keep in sync when project structure changes
- Historical docs live in `docs/archive/` — don't delete them, they serve as reference

When adding a new subsystem or significantly changing an existing one, add or update the relevant doc in `docs/`.

---

## Project-Specific Rules

### Do not change without approval

- **LLM model configuration** — agents use specific models configured in OpenClaw; don't change model IDs
- **Gateway configuration** — `~/.openclaw/openclaw.json` is managed separately
- **Production deployments** — always coordinate before deploying

### Security

- Never commit secrets, API keys, or `.env` files (they're in `.gitignore`)
- Backend auth uses a bearer token plus `X-User-Id` / `X-Agent-Id` headers — all new endpoints must use the existing `Depends()` auth chain from `dependencies.py`
- Validate all user input through Pydantic models on the backend and Zod schemas on the frontend
- Use parameterized SQL queries — never interpolate user input into SQL strings

### Avatar system

- VRM animations use **normalized humanoid bones** via `vrm.humanoid.getNormalizedBoneNode()` — never access raw bones directly
- Expression changes must route through `ExpressionMixer` for priority-based blending — don't write to VRM expressions directly
- Behavior tags (`[MOOD:X]`, `[INTENT:X]`, `[ENERGY:X]`) are parsed in `backend/parse_chat.py` and stripped in the frontend before display
- All avatar commands route through `handleIntent()` in `AnimationController`

### Dependencies

- Keep backend dependencies minimal — the backend currently has only 5 direct dependencies
- Frontend dependencies should be discussed before adding (especially anything that increases bundle size)
- Pin exact versions in `requirements.txt`; use caret ranges in `package.json`

### Database

- SQLite is the database — there is no migration framework. Add new columns/tables via idempotent `ALTER TABLE` statements in `db/connection.py`
- `DeleteResponse.deleted` is always `int` (count of deleted rows), not `bool`
