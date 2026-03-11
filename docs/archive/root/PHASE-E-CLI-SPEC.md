# Phase E — CLI Contract

Status as of 2026-03-06:
- Implemented in `cli/emilia.py`.
- Verified flows: `auth check`, `profile set/use/show`, `context auto/show`, and `cli/test_cli.sh` against an isolated backend runtime.
- Historical drift simulation docs remain archived under `docs/planning/archive/DRIFT-API.md`; they are not part of the active CLI/runtime contract.

## Goal
Full agent/user/room lifecycle manageable from the terminal.
No frontend needed to create, configure, and test a character end-to-end.

---

## Current Command Surface

### Auth + Profiles + Context (Phase A)
```
emilia auth check

emilia profile list
emilia profile show [name]
emilia profile use NAME
emilia profile set [name] [--activate] [--set-base-url URL] [--user USER_ID] [--agent AGENT_ID] [--room ROOM_ID]

emilia context show
emilia context set [--set-base-url URL] [--user USER_ID] [--agent AGENT_ID] [--room ROOM_ID]
emilia context auto [--user USER_ID] [--agent AGENT_ID]
```

`context auto` selects the most recent room for a user and updates the active profile defaults in `~/.config/emilia/config.json`.

### Agents
```
emilia agents create \
  --id emilia \
  --name "Emilia" \
  --workspace /path/to/workspace \
  --provider native \
  --model gpt-4o-mini \
  [--api-base https://...] \
  [--provider-config '{"key":"val"}']   # raw JSON override

emilia agents show AGENT_ID             # full detail: workspace, provider, config, rooms
emilia agents update AGENT_ID \
  [--name NAME] \
  [--workspace PATH] \
  [--model MODEL] \
  [--api-base URL]
emilia agents delete AGENT_ID --yes

# Already exists: emilia agents list
```

### Users
```
emilia users create --name "Thai" [--id custom-id]
emilia users show USER_ID               # detail: name, id, mapped agents
emilia users update USER_ID --name "Thai B"
emilia users delete USER_ID --yes

emilia users map   --user USER_ID --agent AGENT_ID   # grant access
emilia users unmap --user USER_ID --agent AGENT_ID   # revoke access

# Already exists: emilia users list
```

### Rooms
```
emilia rooms list [--user USER_ID]
emilia rooms create [--name NAME] [--user USER_ID] [--agent AGENT_ID]... [--agents A1,A2]
emilia rooms show ROOM_ID              # detail: name, agents, message count
emilia rooms update ROOM_ID --name "new-name"
emilia rooms delete ROOM_ID --yes
emilia rooms add-agent    --room ROOM_ID --agent AGENT_ID
emilia rooms remove-agent --room ROOM_ID --agent AGENT_ID

`rooms create` supports one or many initial agents via repeated `--agent` or `--agents a,b,c`.
```

### Workspace Init (new helper)
```
emilia workspace init PATH --name "Emilia" [--archetype gentle]
```
Creates:
- `PATH/SOUL.md` — starter v3 template (Canon + Fragility Profile stubs)
- `PATH/MEMORY.md` — empty
- `PATH/memory/` — directory

Starter SOUL.md template:
```markdown
# SOUL.md — {Name}

## Canon
### Identity
- **Name:** {name}
- **Archetype:** {archetype}
- **Voice:** 

### Emotional Baseline
- **Default mood:** 
- **Volatility:** moderate
- **Recovery:** moderate

### Fragility Profile
- **Resilience to hostility:** medium
- **Trust repair rate:** moderate
- **Breaking behaviors:**
  - trust < 0.3: shorter responses, no questions
  - trust < 0.15: minimal responses, no warmth

### Boundaries

## Lived Experience
(Populated per-user by the dream system.)
```

---

### Setup / Chat / Memory / Dreams
```
emilia setup [--user-id USER_ID] [--agent-id AGENT_ID] [--room-name NAME]

emilia chat   [--room ROOM_ID] [--user USER_ID] [--agent AGENT_ID]
emilia send   [--room ROOM_ID] [--user USER_ID] [--agent AGENT_ID] "message"
emilia history [--room ROOM_ID] [--limit 20]

emilia memory list   [--agent AGENT_ID]
emilia memory read   PATH
emilia memory search QUERY [--agent AGENT_ID]

emilia dream trigger --agent AGENT_ID --user USER_ID
emilia dream status  --agent AGENT_ID --user USER_ID
emilia dream log     --agent AGENT_ID --user USER_ID
emilia dream reset   --agent AGENT_ID --user USER_ID
```

---

## Full E2E Flow

```bash
# 1. Init workspace
emilia workspace init ~/agents/emilia --name "Emilia" --archetype "gentle, curious"

# 2. Create agent
emilia agents create \
  --id emilia \
  --name "Emilia" \
  --workspace ~/agents/emilia \
  --provider native \
  --model gpt-4o-mini

# 3. Create user
emilia users create --name "Thai" --id thai

# 4. Map user → agent
emilia users map --user thai --agent emilia

# 5. Create room + persist context
emilia rooms create --name "emilia-thai" --user thai --agent emilia

# 6. Save context + chat
emilia context auto --user thai
emilia chat

# 7. Check dream state after chatting
emilia dream status --agent emilia --user thai

# 8. Manually trigger a dream
emilia dream trigger --agent emilia --user thai
```

---

## UX Rules
- All IDs can be passed as positional args OR flags (e.g. `emilia agents show emilia` OR `--agent emilia`)
- Commands that create something print the ID on stdout (scriptable)
- `--json` flag on any command outputs raw JSON (for piping/scripting)
- Errors exit non-zero with a clear message
- `~/.config/emilia/config.json` (or `EMILIA_CLI_CONFIG_PATH`) stores profile contexts.
- `setup`, `rooms create`, and context/profile commands update profile defaults.

---

## Verification Notes
- Use `CLI_BASE_URL=http://127.0.0.1:18080 ./cli/test_cli.sh` to smoke the lifecycle against an isolated backend.
- `auth check` validates both `/api/health` reachability and authenticated `/api/manage/users` access.
- `context auto` selects the most recent room for the chosen user and persists it into the active profile.
