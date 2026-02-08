# Coding Agent Optimization Guide

**Date:** 2026-02-02  
**Research by:** Beatrice 💗  
**Target:** Ram (and future coding agents)

---

## TL;DR

10x coding agents need:
1. **Rich TOOLS.md** — commands, environment, conventions
2. **Project docs in workspace** — architecture, key files, patterns
3. **Clean MEMORY.md** — curated, not cluttered
4. **Clear session starts** — read context, then act
5. **Fresh sessions for new tasks** — avoid context drift

---

## Research Findings

### From Anthropic / Claude Code Best Practices

**CLAUDE.md (equivalent to AGENTS.md) should document:**
- Common bash commands (build, test, lint)
- Core files and utility functions
- Code style guidelines
- Testing instructions
- Repository etiquette (branch naming, merge vs rebase)
- Developer environment setup
- Unexpected behaviors or warnings
- Any other info you want Claude to remember

**Keep it concise and human-readable.**

### From Prompt Learning Research

Key findings from optimizing Claude Code:
1. **Clear, precise prompts** improve contextual understanding
2. **Fresh sessions** reduce prompt-drift and context contamination
3. **Read docs first** — agent should read API refs, framework guides before coding
4. **Document findings** — maintain context across sessions
5. **Iterative testing** — test after every task, provide specific feedback

### From Agentic Coding Workflows

Best practices from production workflows:
1. **memory.md** — continuously updated project state
2. **Phase breakdown** — structured development stages
3. **Prompt feedback loop** — detail what went wrong, not just "fix this"
4. **Update documentation** — track progress in plan files

---

## Current State: Ram's Workspace

### ✅ Good
- SOUL.md is well-defined (persona, priorities, boundaries)
- AGENTS.md has session start instructions
- Basic MEMORY.md structure exists

### ⚠️ Needs Improvement

**TOOLS.md is empty:**
```markdown
# TOOLS.md - Ram's Local Notes
## Git
*(repos, remotes, conventions)*

## Dev Environment
*(languages, build tools, test runners)*
```

**MEMORY.md is sparse:**
- Only has basic project info
- Missing architecture decisions
- Missing common patterns/pitfalls

**No project-specific reference files:**
- No key files list
- No command cheatsheet
- No architecture diagram

---

## Recommendations

### 1. Enhance TOOLS.md

```markdown
# TOOLS.md - Ram's Local Notes

## Git
- Default branch: main
- Commit style: conventional commits
- PR workflow: feature branches → PR → squash merge

## Dev Environment
- Node: v22 (via nvm)
- Python: 3.11+ (venv per project)
- Docker: compose v2

## Common Commands

### Emilia Webapp
```bash
cd /home/tbach/clawd/emilia-project/emilia-webapp

# Backend
cd backend && source .venv/bin/activate && python main.py

# Frontend
cd frontend && npm run dev -- --host

# Docker
docker compose up -d --build

# Tests
cd backend && pytest -q
```

### Clawdbot
```bash
source ~/.clawdbot/secrets.env
clawdbot status
clawdbot gateway restart
clawdbot memory index
```

## Code Style
- TypeScript: strict mode, no any
- Python: type hints, black formatter
- React: functional components, hooks only

## Testing
- Backend: pytest
- Frontend: vitest (if configured)
- Always run tests before committing
```

### 2. Enhance MEMORY.md

Add sections for:
- **Architecture decisions** — why things are the way they are
- **Common patterns** — reusable solutions
- **Pitfalls** — things that broke before
- **Key file map** — where important code lives

```markdown
## Architecture Decisions

### 2026-02-01: React Rewrite
- Why: Vanilla JS was getting messy, needed proper state management
- Stack: React 19 + Vite + TanStack Router + Zustand
- Trade-off: More complexity, but better maintainability

### 2026-02-01: SQLite over Postgres
- Why: Household app, single server, no need for scaling
- Trade-off: Simpler, but no concurrent writes

## Common Patterns

### Clawdbot API Integration
- Always use x-clawdbot-agent-id header
- Bearer token from secrets.env
- Stream responses with SSE

### React State
- Zustand for global state
- React Query for server state
- Don't mix them

## Pitfalls

### Session State Bleed
- Problem: Switching users kept old chat state
- Solution: Use TanStack Router, clear state on route change

### Memory Dropdown
- Problem: Agent workspace path must be correct
- Solution: Use CLAWDBOT_AGENTS_DIR env var

## Key Files

### Emilia Webapp
| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI server, all endpoints |
| `backend/database.py` | SQLite models, session CRUD |
| `frontend/src/store/index.ts` | Zustand global state |
| `frontend/src/routes/` | TanStack Router routes |
| `data/avatars.json` | Agent voice/model config |
```

### 3. Add Project Reference Files

Create `/home/tbach/clawd-ram/projects/` with:
- `emilia-webapp.md` — current project context
- `clawdbot.md` — gateway/agent reference

These get loaded via memory_search when relevant.

### 4. Session Start Protocol

Update AGENTS.md:
```markdown
## Every Session

1. Read `SOUL.md`
2. Read `USER.md`
3. Read `memory/YYYY-MM-DD.md` (today + yesterday)
4. If in main session: also read `MEMORY.md`
5. **If working on a project:** read relevant project doc from `projects/`

## Before Coding

1. Understand the current state (git status, what's running)
2. Check for relevant docs (API refs, framework guides)
3. Plan before acting
4. Test after changes
```

### 5. Memory Hygiene

**Periodic cleanup:**
- Remove outdated architecture notes
- Update key file maps when structure changes
- Prune daily notes older than 2 weeks

**Add to AGENTS.md:**
```markdown
## Memory Hygiene

- Clear outdated project notes when architecture changes
- Update MEMORY.md after major refactors
- Daily notes older than 14 days can be summarized and pruned
```

---

## Implementation Checklist

For Ram's workspace (`/home/tbach/clawd-ram/`):

- [ ] Populate TOOLS.md with commands & conventions
- [ ] Enhance MEMORY.md with architecture decisions & patterns
- [ ] Create `projects/` folder with project reference docs
- [ ] Update AGENTS.md with enhanced session start protocol
- [ ] Clear outdated/stale memory entries
- [ ] Consider adding `skills/` with custom skills if needed

---

## Optional: Custom Skills

If Ram frequently does specific tasks, create skills:

```
/home/tbach/clawd-ram/skills/
├── emilia-dev/
│   └── SKILL.md  # Commands for emilia webapp development
└── docker-debug/
    └── SKILL.md  # Docker troubleshooting steps
```

---

## References

- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [CLAUDE.md Optimization with Prompt Learning](https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/)
- [Optimizing Agentic Coding](https://research.aimultiple.com/agentic-coding/)

---

*Make Ram actually 10x, not just vibes. — Beatrice 💗*
