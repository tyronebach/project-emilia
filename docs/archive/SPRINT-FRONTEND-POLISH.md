# Sprint: Frontend Polish & Routing

**Created:** 2026-02-01 by Beatrice  
**Executor:** Ram 🩷 (can use coding agent)  
**Supervisor:** Beatrice 💗  
**Status:** Ready to start

---

## Overview

Polish the React frontend for household MVP. Focus on routing, UI cleanup, and debug improvements.

---

## Tasks

### 1. Routing (TanStack Router) — Priority: HIGH
**Problem:** State may bleed between user switches  
**Solution:** Proper URL-based routing

```
Routes:
/                           → User select
/user/:userId               → Agent select
/user/:userId/chat/:sessionId → Chat view
/admin                      → Admin panel (future)
```

**Implementation:**
- Use TanStack Router (already in package.json)
- Clear state on route change
- Support deep linking to sessions
- Browser back/forward works correctly

**Acceptance:**
- [ ] Switching users clears chat state completely
- [ ] URL reflects current user + session
- [ ] Refresh preserves location

---

### 2. User Select Page — Priority: MEDIUM

**Current:** Buttons with text  
**Target:** Clean avatar-centric design

```
┌─────────────────────────────────────┐
│                        [⚙️]         │  ← Cog icon (admin)
│                                     │
│    ┌─────────┐    ┌─────────┐      │
│    │         │    │         │      │
│    │  Avatar │    │  Avatar │      │
│    │  Image  │    │  Image  │      │
│    │         │    │         │      │
│    └─────────┘    └─────────┘      │
│       Thai           Emily          │
│       (2) 👤         (1) 👤        │  ← Badge = agent count
│                                     │
└─────────────────────────────────────┘
```

**Implementation:**
- Avatar image IS the button (clickable, no frame)
- Name below as footer text
- Badge showing number of assigned agents
- Placeholder images for now (can be real later)
- Cog icon top-right → admin panel

---

### 3. Agent Select Page — Priority: MEDIUM

**Same pattern as User Select:**
- Avatar image as button
- Agent name as footer
- Clean, minimal

```
┌─────────────────────────────────────┐
│  ← Back                             │
│                                     │
│         ┌─────────────┐             │
│         │             │             │
│         │   Emilia    │             │
│         │   Avatar    │             │
│         │             │             │
│         └─────────────┘             │
│            Emilia                   │
│                                     │
└─────────────────────────────────────┘
```

---

### 4. Admin Panel — Priority: MEDIUM

**Location:** Accessed via cog icon on user select  
**Features (MVP):**
- List agents
- Edit voice_id per agent
- Save to `data/avatars.json`

**Implementation:**
- Simple form
- Dropdown or text input for voice_id
- Backend endpoint: `PUT /api/admin/agents/:id`

---

### 5. Memory Viewer — Priority: HIGH

**Location:** Accessible from chat view (button or menu)  
**Features:**
- Dropdown to select memory file
- `MEMORY.md` listed first
- Daily files (`memory/YYYY-MM-DD.md`) sorted newest first
- View only (no edit/delete)
- Verify memory updates after chat

**Backend endpoints needed:**
- `GET /api/memory/list` — list available files
- `GET /api/memory/:filename` — read file content

---

### 6. Debug HUD Improvements — Priority: LOW

**Changes:**
- State log: **scrollable container, fixed height** (e.g., max-height: 200px)
- Add latency display (per-stage timing)
- Error display integrated

---

### 7. Error Handling — Priority: MEDIUM

**Errors to handle:**
- STT service down → show message, allow text fallback
- TTS failure → show text response, note audio failed
- WebSocket disconnect → auto-reconnect + indicator
- API errors → user-friendly message in debug HUD

**Pattern:**
- Errors appear in debug HUD
- Critical errors also show toast/banner
- Non-blocking where possible

---

## Execution Plan

1. **Ram reads this doc**
2. **Ram can spawn coding agent** for implementation
3. **Beatrice monitors** and updates Thai on progress
4. **Thai tests** when ready

---

## Definition of Done

- [ ] Routing works, no state bleed
- [ ] User select page with avatar buttons + cog
- [ ] Agent select page with avatar buttons
- [ ] Memory viewer with dropdown
- [ ] Admin panel (voice_id editing)
- [ ] Debug HUD scrollable + latency display
- [ ] Error handling visible in UI

---

## Notes for Ram

- **Model:** Don't change from `gpt-5.1-codex-mini`
- **Coding agent:** Feel free to use Claude for implementation
- **Questions:** Ask Beatrice before making architecture decisions
- **Commits:** Small, incremental, with clear messages

---

*Let's polish this thing. — Beatrice 💗*
