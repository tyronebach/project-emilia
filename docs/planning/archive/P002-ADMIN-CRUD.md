# P002: Admin Panel Full CRUD

**Status:** Proposed  
**Created:** 2026-02-09  
**Author:** Beatrice (for Thai)

## Goal

Expand `/manage` page to support full CRUD for Users, Agents, and User-Agent mappings.

## Current State

- **Backend:** Agent list/update only. No create/delete. No user endpoints. No mapping endpoints.
- **Frontend:** Edit existing agents only. No user management UI.

## Database Schema (reference)

```sql
-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    preferences TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Agents
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    clawdbot_agent_id TEXT NOT NULL,  -- OpenClaw agent ID
    vrm_model TEXT DEFAULT 'emilia.vrm',
    voice_id TEXT,
    workspace TEXT,
    -- emotional fields (don't expose in basic CRUD)
    ...
);

-- User-Agent mapping (many-to-many)
CREATE TABLE user_agents (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, agent_id)
);
```

## Requirements

### 1. Users CRUD
- **List** all users with agent count
- **Create** new user (id, display_name)
- **Update** user (display_name only)
- **Delete** user (cascades to user_agents)

### 2. Agents CRUD  
- **List** all agents (already exists)
- **Create** new agent (id, display_name, clawdbot_agent_id, vrm_model, voice_id, workspace)
- **Update** agent (already exists)
- **Delete** agent (cascades to user_agents, sessions, etc.)

### 3. User-Agent Mappings
- **List** mappings for a user (which agents they can access)
- **Add** mapping (grant user access to agent)
- **Remove** mapping (revoke user access to agent)

---

## Codex Prompt

```
Read P002-ADMIN-CRUD.md in /home/tbach/Projects/emilia-project/docs/planning/

Implement full CRUD for the /manage admin panel.

## Backend Changes

### File: backend/routers/admin.py

Add these endpoints (follow existing patterns in the file):

**Users:**
- GET /api/manage/users - list all users with agent count (use UserRepository.get_all_with_agent_count)
- POST /api/manage/users - create user (body: {id, display_name})
- PUT /api/manage/users/{user_id} - update user (body: {display_name})
- DELETE /api/manage/users/{user_id} - delete user

**Agents (add to existing):**
- POST /api/manage/agents - create agent (body: {id, display_name, clawdbot_agent_id, vrm_model?, voice_id?, workspace?})
- DELETE /api/manage/agents/{agent_id} - delete agent

**User-Agent Mappings:**
- GET /api/manage/users/{user_id}/agents - list user's agents
- POST /api/manage/users/{user_id}/agents/{agent_id} - add mapping
- DELETE /api/manage/users/{user_id}/agents/{agent_id} - remove mapping

### File: backend/db/repositories/users.py

Add these methods:
- update(user_id, updates: dict) - update display_name
- delete(user_id) - delete user
- remove_agent_access(user_id, agent_id) - remove mapping

### File: backend/db/repositories/agents.py

Add this method:
- delete(agent_id) - delete agent

### File: backend/schemas/requests.py

Add:
- UserCreate(BaseModel): id: str, display_name: str
- UserUpdate(BaseModel): display_name: str | None = None
- AgentCreate(BaseModel): id: str, display_name: str, clawdbot_agent_id: str, vrm_model: str = "emilia.vrm", voice_id: str | None = None, workspace: str | None = None

### File: backend/schemas/responses.py

Add if missing:
- UserAgentsResponse(BaseModel): agents: list, count: int

## Frontend Changes

### File: frontend/src/components/AdminPanel.tsx

Redesign with 3 tabs: Users | Agents | Mappings

**Users Tab:**
- Table: ID, Display Name, Agent Count, Actions (Edit, Delete)
- Add User button → modal with id + display_name fields
- Edit inline or modal
- Delete with confirmation

**Agents Tab:**
- Keep existing agent cards
- Add "New Agent" button → modal/form with: id, display_name, clawdbot_agent_id (required), vrm_model, voice_id, workspace
- Add Delete button to each agent card (with confirmation)

**Mappings Tab:**
- Dropdown to select a user
- Shows checkboxes for all agents (checked = user has access)
- Toggle checkbox = add/remove mapping
- OR: Two-column UI (available agents | assigned agents) with arrow buttons

### File: frontend/src/utils/api.ts

Add API functions:
- fetchUsers(): Promise<User[]>
- createUser(data): Promise<User>
- updateUser(id, data): Promise<void>
- deleteUser(id): Promise<void>
- createAgent(data): Promise<Agent>
- deleteAgent(id): Promise<void>
- fetchUserAgents(userId): Promise<Agent[]>
- addUserAgent(userId, agentId): Promise<void>
- removeUserAgent(userId, agentId): Promise<void>

## UI Style Notes
- Use existing design patterns (bg-bg-secondary/70, rounded-2xl cards, etc.)
- Use Lucide icons (Plus, Trash2, Users, Bot, Link)
- Keep the AppTopNav with existing buttons
- Add tab navigation below the nav

## Testing
After implementation, verify:
1. Can create/edit/delete users
2. Can create/edit/delete agents  
3. Can assign/unassign agents to users
4. Deleting a user removes their mappings
5. Deleting an agent removes it from all users

Run existing tests to check for regressions:
cd /home/tbach/Projects/emilia-project/emilia-webapp/backend
python -m pytest tests/ -v
```

---

## Notes

- The `clawdbot_agent_id` field maps to pre-created OpenClaw agents (e.g., `emilia-thai`, `emilia-emily`)
- Emotional profile fields (baseline_valence, etc.) are NOT exposed in basic CRUD - those go through `/designer-v2`
- User `id` is typically a simple slug like `thai` or `emily`
