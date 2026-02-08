# Development Scripts

## Quick Start

Run each in a separate terminal:

```bash
# Terminal 1: Backend API (port 8080)
./scripts/dev-backend-local.sh

# Terminal 2: Game frontend (port 3443) 
./scripts/dev-frontend.sh

# Terminal 3: Agent Designer (port 3002)
./scripts/dev-designer.sh
```

## Scripts

| Script | Description | Port |
|--------|-------------|------|
| `dev.sh` | Show all options | - |
| `dev-backend-local.sh` | Run backend locally (Python) | 8080 |
| `dev-backend.sh` | Run backend via Docker | 8080 |
| `dev-frontend.sh` | Run game frontend | 3443 |
| `dev-designer.sh` | Run Agent Designer UI | 3002 |
| `check-backend.sh` | Type-check backend | - |
| `check-frontend.sh` | Type-check frontend | - |
| `check-all.sh` | Type-check everything | - |
| `test-scenarios.sh` | Run emotion scenarios | - |

## URLs

- **Game:** https://localhost:3443
- **Agent Designer:** http://localhost:3002  
- **API Health:** http://localhost:8080/api/health
- **API Docs:** http://localhost:8080/docs

## Environment

Backend requires `CLAWDBOT_TOKEN` for LLM features:

```bash
export CLAWDBOT_TOKEN=your_token_here
./scripts/dev-backend-local.sh
```

## Testing Emotion Engine

```bash
# Run unit tests
cd backend && python -m pytest tests/test_emotion_engine.py -v

# Run dialogue scenarios
./scripts/test-scenarios.sh

# Interactive tuning lab
cd backend && python ../scripts/emotion-lab.py
```
