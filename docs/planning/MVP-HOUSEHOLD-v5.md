# Emilia Webapp MVP - Household Edition (v5)

**Updated:** 2026-02-01 by Beatrice  
**Target:** Trusted household, "Simply Piano" style app  
**Users:** Thai, Emily

---

## Scope Change from Original Plan

This is NOT a public product. It's installed in a trusted household with known users. Simplified accordingly.

---

## MVP Definition of Done (Revised)

### ✅ Complete
- [x] Multi-user selection (Thai, Emily)
- [x] Agent selection per user
- [x] Push-to-talk voice input
- [x] Streaming text + TTS voice output
- [x] VRM avatar with lip sync + expressions
- [x] Session management (create, rename, delete)
- [x] SQLite backend for sessions

### 🔧 In Progress / Remaining

#### 1. Memory Viewer (View Only)
- **NO delete or export** — just view
- Dropdown selector to pick memory file:
  - `MEMORY.md` (listed first)
  - `memory/YYYY-MM-DD.md` (sorted newest first)
- Verify memory is updating after conversations

#### 2. Latency Testing
- Thai will test manually
- No automated benchmarks needed for MVP

#### 3. Admin Panel
- **Location:** Cog icon in top-right of user select page
- **Features (simple):**
  - Voice ID selector per agent
  - (Future: more tuning options)

#### 4. Debug HUD Improvements
- Add latency dashboard (P50/P95 per stage)
- State component: **scrollable container, fixed height**
- Error display in debug HUD

#### 5. Error Handling
- Robust + visible errors
- Use debug HUD component for error display
- Handle: STT failure, TTS failure, WebSocket disconnect

#### 6. Routing (TanStack Router)
- Proper URL routes: `/user/:userId/chat/:sessionId`
- Prevents state bleed between user switches
- Deep linking to specific sessions

#### 7. UI Polish
- **User Select Page:**
  - Avatar image as the button (no visible button frame)
  - Name as footer below avatar
  - Badge showing number of agents
  - Clean, simple layout
  
- **Agent Select Page:**
  - Same pattern — avatar is the button
  - Name as footer
  - Placeholder images for now

---

## Architecture (Unchanged)

```
Frontend (React) :3443
    ↓
Backend (FastAPI + SQLite) :8080
    ↓
Clawdbot Gateway :18789
    ↓
Emilia Agents (gpt-5.1-codex-mini)
```

---

## Security Model (Household)

- **No JWT auth** — trusted users only
- Simple user selection (no passwords)
- Agents sandboxed + tool-restricted
- Memory visible but not deletable via UI

---

## Files Reference

| File | Purpose |
|------|---------|
| `data/emilia.db` | SQLite sessions |
| `data/avatars.json` | Agent voice_id, vrm_model |
| `data/users.json` | User list (if needed) |
| `AGENT-CONFIG.md` | Model + tool restrictions |
| `API.md` | Endpoint reference |

---

## Out of Scope (Future)

- Public deployment
- JWT authentication
- Memory delete/export
- DIY brain replacement
- Game modules

See `FUTURE-PRODUCT-ARCHITECTURE.md` for product roadmap.

---

*This is the household MVP. Ship it, use it, iterate.*
