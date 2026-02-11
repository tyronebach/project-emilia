# P005: Group Chat — Multi-Agent Conversations

**Date:** 2026-02-10  
**Status:** Proposed  
**Scope:** Enable group chat rooms with multiple agents, shared conversation history, and optional VRM display.

---

## 1. Goals

1. Users can create "rooms" with 1+ agents participating.
2. Agents see each other's messages and can respond naturally.
3. Emotion engine continues per user-agent pair (independent relationships).
4. Games work in group context (multiplayer-ready foundation).
5. VRM display is optional — hidden by default, click-to-focus per agent.
6. Clean separation from existing 1:1 sessions (no migration risk).
7. Architecture supports future features: agent-to-agent dynamics, team games, debates.

---

## 2. Current State

### 2.1 Existing Schema (Relevant Tables)

```sql
-- Sessions: 1:1 with agent (single agent_id FK)
sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),  -- ← Single agent
    name TEXT,
    created_at INTEGER,
    last_used INTEGER,
    message_count INTEGER,
    summary TEXT,
    ...
)

-- Session participants: M:M for users (already multi-user capable)
session_participants (
    session_id TEXT,
    user_id TEXT,
    PRIMARY KEY (session_id, user_id)
)

-- Messages: No agent attribution
messages (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT,           -- 'user' | 'assistant'
    origin TEXT,         -- 'user' | 'assistant' | 'game_runtime'
    content TEXT,
    ...
    -- No agent_id column
)
```

### 2.2 Current Flow (`backend/routers/chat.py`)

1. User sends message via `POST /api/chat`
2. Headers: `X-User-Id`, `X-Agent-Id`, `X-Session-Id`
3. Backend loads single agent via `agent_id`
4. LLM call: `model: agent:{clawdbot_agent_id}`
5. Response stored with `role: assistant` (no agent attribution)

### 2.3 Limitations for Group Chat

| Constraint | Impact |
|------------|--------|
| `sessions.agent_id` is single FK | Cannot have multiple agents per session |
| `messages` has no `agent_id` | Cannot attribute which agent responded |
| Chat router assumes single agent | No multi-agent routing logic |
| Frontend assumes single agent context | No multi-agent display |

---

## 3. Architecture Decision: Separate Entity

**Decision:** Create new `rooms` entity rather than extending `sessions`.

**Rationale:**
- Zero migration risk to existing 1:1 sessions
- Cleaner separation of concerns
- Easier to add room-specific features (permissions, settings)
- Sessions remain optimized for single-agent chat
- Rooms can have different compaction/history strategies

---

## 4. Data Model

### 4.1 New Tables

```sql
-- Chat rooms (group conversations)
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_activity INTEGER DEFAULT (strftime('%s', 'now')),
    message_count INTEGER DEFAULT 0,
    room_type TEXT DEFAULT 'group',  -- 'group' | 'game_lobby' | 'debate'
    settings TEXT DEFAULT '{}',      -- JSON: vrm_mode, notification_prefs
    summary TEXT,                    -- Compacted history (like sessions)
    summary_updated_at INTEGER
);

-- Room agents (M:M junction)
CREATE TABLE IF NOT EXISTS room_agents (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    added_by TEXT REFERENCES users(id),
    role TEXT DEFAULT 'participant',  -- 'participant' | 'moderator' | 'observer'
    response_mode TEXT DEFAULT 'mention',  -- 'mention' | 'always' | 'manual'
    PRIMARY KEY (room_id, agent_id)
);

-- Room participants (M:M junction for users)
CREATE TABLE IF NOT EXISTS room_participants (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    role TEXT DEFAULT 'member',  -- 'member' | 'admin' | 'owner'
    PRIMARY KEY (room_id, user_id)
);

-- Room messages (separate from session messages)
CREATE TABLE IF NOT EXISTS room_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent')),
    sender_id TEXT NOT NULL,  -- user_id or agent_id depending on sender_type
    content TEXT NOT NULL,
    timestamp REAL NOT NULL,
    origin TEXT DEFAULT 'chat',  -- 'chat' | 'game_runtime' | 'system'
    
    -- LLM metadata (for agent messages)
    model TEXT,
    processing_ms INTEGER,
    usage_prompt_tokens INTEGER,
    usage_completion_tokens INTEGER,
    
    -- Behavior tags (for agent messages)
    behavior_intent TEXT,
    behavior_mood TEXT,
    behavior_mood_intensity REAL,
    behavior_energy TEXT,
    behavior_move TEXT,
    behavior_game_action TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_room_agents_agent ON room_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_room_messages_sender ON room_messages(sender_type, sender_id);
```

### 4.2 Room Settings JSON Schema

```json
{
  "vrm_display": "hidden",       // "hidden" | "active_speaker" | "grid"
  "response_style": "mention",   // "mention" | "round_robin" | "all"
  "max_agents": 5,
  "allow_games": true,
  "compact_enabled": true
}
```

### 4.3 Migration Script Location

Add to `backend/db/connection.py` in `init_db()` function after existing table definitions.

---

## 5. Backend API

### 5.1 New Router: `backend/routers/rooms.py`

```python
router = APIRouter(prefix="/api/rooms", tags=["rooms"])
```

### 5.2 Room CRUD Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| `GET` | `/api/rooms` | List rooms for user | - | `RoomsListResponse` |
| `POST` | `/api/rooms` | Create room | `CreateRoomRequest` | `RoomResponse` |
| `GET` | `/api/rooms/{room_id}` | Get room details | - | `RoomDetailResponse` |
| `PATCH` | `/api/rooms/{room_id}` | Update room | `UpdateRoomRequest` | `RoomResponse` |
| `DELETE` | `/api/rooms/{room_id}` | Delete room | - | `DeleteResponse` |

### 5.3 Room Agent Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rooms/{room_id}/agents` | List agents in room |
| `POST` | `/api/rooms/{room_id}/agents` | Add agent to room |
| `DELETE` | `/api/rooms/{room_id}/agents/{agent_id}` | Remove agent from room |
| `PATCH` | `/api/rooms/{room_id}/agents/{agent_id}` | Update agent settings |

### 5.4 Room Chat Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rooms/{room_id}/chat` | Send message to room |
| `GET` | `/api/rooms/{room_id}/history` | Get room message history |

### 5.5 Pydantic Schemas

Add to `backend/schemas/requests.py`:

```python
class CreateRoomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    agent_ids: list[str] = Field(..., min_length=1, max_length=10)
    settings: dict = Field(default_factory=dict)

class UpdateRoomRequest(BaseModel):
    name: str | None = None
    settings: dict | None = None

class AddRoomAgentRequest(BaseModel):
    agent_id: str
    response_mode: str = "mention"  # "mention" | "always" | "manual"

class RoomChatRequest(BaseModel):
    message: str
    mention_agents: list[str] | None = None  # Explicit @mentions
    game_context: dict | None = None
```

Add to `backend/schemas/responses.py`:

```python
class RoomResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: int
    last_activity: int
    message_count: int
    room_type: str
    settings: dict

class RoomDetailResponse(RoomResponse):
    agents: list[dict]      # [{agent_id, display_name, role, response_mode}]
    participants: list[dict] # [{user_id, display_name, role}]

class RoomsListResponse(BaseModel):
    rooms: list[RoomResponse]
    count: int

class RoomMessageResponse(BaseModel):
    id: str
    sender_type: str  # "user" | "agent"
    sender_id: str
    sender_name: str  # Resolved display name
    content: str
    timestamp: float
    behavior: dict | None = None

class RoomHistoryResponse(BaseModel):
    messages: list[RoomMessageResponse]
    room_id: str
    count: int
```

---

## 6. Room Chat Logic

### 6.1 Agent Response Routing

Location: `backend/routers/rooms.py` → `room_chat()` function

```python
async def determine_responding_agents(
    room_id: str,
    user_message: str,
    mention_agents: list[str] | None,
    room_agents: list[dict],
) -> list[dict]:
    """
    Determine which agents should respond to a message.
    
    Priority:
    1. Explicit mentions in mention_agents list → those agents respond
    2. @AgentName in message text → parse and match
    3. No mentions + response_mode='always' → those agents respond
    4. No mentions + all agents response_mode='mention' → no response (or fallback to first)
    """
    responding = []
    
    # Check explicit mentions
    if mention_agents:
        for agent in room_agents:
            if agent["agent_id"] in mention_agents:
                responding.append(agent)
        if responding:
            return responding
    
    # Check @mentions in message text
    import re
    mention_pattern = r'@(\w+)'
    text_mentions = re.findall(mention_pattern, user_message.lower())
    if text_mentions:
        for agent in room_agents:
            agent_name = agent.get("display_name", "").lower()
            if any(m in agent_name or agent_name.startswith(m) for m in text_mentions):
                responding.append(agent)
        if responding:
            return responding
    
    # Check response_mode='always' agents
    for agent in room_agents:
        if agent.get("response_mode") == "always":
            responding.append(agent)
    
    return responding
```

### 6.2 LLM Context for Group Chat

Each agent call needs modified context showing the group conversation:

```python
def build_room_llm_messages(
    room_id: str,
    agent: dict,
    all_room_agents: list[dict],
    current_message: str,
    history_limit: int = 30,
) -> list[dict]:
    """Build LLM messages array for room chat."""
    messages = []
    
    # System context: who's in the room
    other_agents = [a for a in all_room_agents if a["agent_id"] != agent["agent_id"]]
    agent_names = ", ".join(a["display_name"] for a in other_agents)
    
    system_context = f"""You are in a group chat with: {agent_names}.
When another agent speaks, their message appears as "[AgentName]: message".
Respond naturally as yourself. You can address others by name if relevant.
Keep responses conversational and concise for group chat flow."""
    
    messages.append({"role": "system", "content": system_context})
    
    # Room summary if available
    summary = RoomRepository.get_summary(room_id)
    if summary:
        messages.append({
            "role": "system", 
            "content": f"Previous conversation summary:\n{summary}"
        })
    
    # Recent history with attribution
    history = RoomMessageRepository.get_last_n(room_id, history_limit)
    for msg in history:
        if msg["sender_type"] == "user":
            role = "user"
            content = msg["content"]
        elif msg["sender_type"] == "agent":
            if msg["sender_id"] == agent["agent_id"]:
                role = "assistant"
                content = msg["content"]
            else:
                # Other agent's message → show as user context
                role = "user"
                sender_name = msg.get("sender_name", "Agent")
                content = f"[{sender_name}]: {msg['content']}"
        messages.append({"role": role, "content": content})
    
    # Current user message
    messages.append({"role": "user", "content": current_message})
    
    return messages
```

### 6.3 Concurrent vs Sequential Responses

**Default: Sequential with stagger**

```python
async def process_room_chat(
    room_id: str,
    user_id: str,
    message: str,
    responding_agents: list[dict],
) -> list[dict]:
    """Process room chat with multiple agent responses."""
    responses = []
    
    # Store user message first
    user_msg = RoomMessageRepository.add(
        room_id=room_id,
        sender_type="user",
        sender_id=user_id,
        content=message,
    )
    
    # Process each agent sequentially (can parallelize later)
    for agent in responding_agents:
        # Build context (includes previous agent responses in this batch)
        llm_messages = build_room_llm_messages(
            room_id, agent, all_agents, message
        )
        
        # Call LLM
        response = await call_clawdbot(agent["clawdbot_agent_id"], llm_messages)
        
        # Store response
        agent_msg = RoomMessageRepository.add(
            room_id=room_id,
            sender_type="agent",
            sender_id=agent["agent_id"],
            content=response["text"],
            behavior=response["behavior"],
        )
        
        responses.append({
            "agent_id": agent["agent_id"],
            "agent_name": agent["display_name"],
            "response": response["text"],
            "behavior": response["behavior"],
        })
    
    return responses
```

### 6.4 Streaming Support

For SSE streaming in rooms, emit per-agent streams:

```
event: agent_start
data: {"agent_id": "emilia", "agent_name": "Emilia"}

data: {"content": "chunk...", "agent_id": "emilia"}
data: {"content": "chunk...", "agent_id": "emilia"}

event: agent_done
data: {"agent_id": "emilia", "behavior": {...}}

event: agent_start
data: {"agent_id": "priscilla", "agent_name": "Priscilla"}
...
```

---

## 7. Repository Layer

### 7.1 New File: `backend/db/repositories/room_repository.py`

```python
class RoomRepository:
    @staticmethod
    def create(name: str, created_by: str, agent_ids: list[str], settings: dict = None) -> dict:
        """Create room with initial agents."""
        
    @staticmethod
    def get_by_id(room_id: str) -> dict | None:
        """Get room by ID."""
        
    @staticmethod
    def get_for_user(user_id: str) -> list[dict]:
        """Get all rooms user participates in."""
        
    @staticmethod
    def user_can_access(user_id: str, room_id: str) -> bool:
        """Check if user is a participant."""
        
    @staticmethod
    def get_agents(room_id: str) -> list[dict]:
        """Get all agents in room with their settings."""
        
    @staticmethod
    def add_agent(room_id: str, agent_id: str, added_by: str, response_mode: str = "mention") -> dict:
        """Add agent to room."""
        
    @staticmethod
    def remove_agent(room_id: str, agent_id: str) -> bool:
        """Remove agent from room."""
        
    @staticmethod
    def update_last_activity(room_id: str) -> None:
        """Update last_activity timestamp."""
        
    @staticmethod
    def get_summary(room_id: str) -> str | None:
        """Get compacted summary."""
        
    @staticmethod
    def update_summary(room_id: str, summary: str) -> None:
        """Update compacted summary."""


class RoomMessageRepository:
    @staticmethod
    def add(
        room_id: str,
        sender_type: str,
        sender_id: str,
        content: str,
        origin: str = "chat",
        **kwargs
    ) -> dict:
        """Add message to room."""
        
    @staticmethod
    def get_last_n(room_id: str, n: int, include_game_runtime: bool = False) -> list[dict]:
        """Get last N messages with sender info resolved."""
        
    @staticmethod
    def get_by_room(room_id: str, limit: int = 50) -> list[dict]:
        """Get messages for room history endpoint."""
```

### 7.2 Update: `backend/db/repositories/__init__.py`

```python
from .room_repository import RoomRepository, RoomMessageRepository
```

---

## 8. Frontend Architecture

### 8.1 New Routes

Add to `frontend/src/router.tsx`:

```typescript
// Room routes
'/user/$userId/rooms': RoomListPage
'/user/$userId/rooms/new': CreateRoomPage
'/user/$userId/rooms/$roomId': RoomChatPage
```

### 8.2 New Files Structure

```
frontend/src/
  routes/
    user/
      $userId/
        rooms/
          index.tsx        # Room list
          new.tsx          # Create room
          $roomId/
            index.tsx      # Room chat view
  components/
    rooms/
      RoomList.tsx
      RoomCard.tsx
      CreateRoomModal.tsx
      RoomChatPanel.tsx
      RoomMessageItem.tsx
      RoomAgentPicker.tsx
      RoomAgentBadge.tsx
      RoomVrmPanel.tsx     # Click-to-focus VRM display
  store/
    roomStore.ts           # Room state management
  hooks/
    useRoomChat.ts         # Room chat hook (like useChat)
  utils/
    roomApi.ts             # Room API client
```

### 8.3 Room Store (`frontend/src/store/roomStore.ts`)

```typescript
interface RoomState {
  // Current room
  currentRoomId: string | null;
  currentRoom: Room | null;
  
  // Room agents
  roomAgents: RoomAgent[];
  
  // Messages
  messages: RoomMessage[];
  streamingMessages: Map<string, string>;  // agent_id -> streaming content
  
  // VRM focus
  focusedAgentId: string | null;
  
  // Actions
  setCurrentRoom: (room: Room) => void;
  addMessage: (message: RoomMessage) => void;
  appendStreamingContent: (agentId: string, content: string) => void;
  finalizeAgentMessage: (agentId: string, message: RoomMessage) => void;
  setFocusedAgent: (agentId: string | null) => void;
}

interface Room {
  id: string;
  name: string;
  createdBy: string;
  lastActivity: number;
  messageCount: number;
  settings: RoomSettings;
}

interface RoomAgent {
  agentId: string;
  displayName: string;
  vrmModel: string;
  voiceId: string | null;
  role: 'participant' | 'moderator' | 'observer';
  responseMode: 'mention' | 'always' | 'manual';
}

interface RoomMessage {
  id: string;
  senderType: 'user' | 'agent';
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  behavior?: AvatarBehavior;
}
```

### 8.4 Room API Client (`frontend/src/utils/roomApi.ts`)

```typescript
// Room CRUD
export const getRooms = () => fetchWithAuth('/api/rooms');
export const createRoom = (data: CreateRoomRequest) => 
  fetchWithAuth('/api/rooms', { method: 'POST', body: JSON.stringify(data) });
export const getRoom = (roomId: string) => fetchWithAuth(`/api/rooms/${roomId}`);
export const updateRoom = (roomId: string, data: UpdateRoomRequest) =>
  fetchWithAuth(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteRoom = (roomId: string) =>
  fetchWithAuth(`/api/rooms/${roomId}`, { method: 'DELETE' });

// Room agents
export const getRoomAgents = (roomId: string) => 
  fetchWithAuth(`/api/rooms/${roomId}/agents`);
export const addRoomAgent = (roomId: string, agentId: string, responseMode?: string) =>
  fetchWithAuth(`/api/rooms/${roomId}/agents`, { 
    method: 'POST', 
    body: JSON.stringify({ agent_id: agentId, response_mode: responseMode }) 
  });
export const removeRoomAgent = (roomId: string, agentId: string) =>
  fetchWithAuth(`/api/rooms/${roomId}/agents/${agentId}`, { method: 'DELETE' });

// Room chat
export const sendRoomMessage = (roomId: string, message: string, mentionAgents?: string[]) =>
  fetchWithAuth(`/api/rooms/${roomId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, mention_agents: mentionAgents }),
  });

export const streamRoomChat = async function* (
  roomId: string, 
  message: string,
  mentionAgents?: string[]
): AsyncGenerator<RoomChatEvent> {
  // SSE streaming implementation
};

export const getRoomHistory = (roomId: string, limit = 50) =>
  fetchWithAuth(`/api/rooms/${roomId}/history?limit=${limit}`);
```

### 8.5 Room Chat Hook (`frontend/src/hooks/useRoomChat.ts`)

```typescript
export function useRoomChat(roomId: string) {
  const { addMessage, appendStreamingContent, finalizeAgentMessage } = useRoomStore();
  
  const sendMessage = async (message: string, mentionAgents?: string[]) => {
    // Add user message optimistically
    addMessage({
      id: crypto.randomUUID(),
      senderType: 'user',
      senderId: currentUserId,
      senderName: currentUserName,
      content: message,
      timestamp: Date.now() / 1000,
    });
    
    // Stream responses from agents
    for await (const event of streamRoomChat(roomId, message, mentionAgents)) {
      if (event.type === 'agent_start') {
        // Show typing indicator for agent
      } else if (event.type === 'content') {
        appendStreamingContent(event.agentId, event.content);
      } else if (event.type === 'agent_done') {
        finalizeAgentMessage(event.agentId, event.message);
      }
    }
  };
  
  return { sendMessage };
}
```

### 8.6 VRM Display Component (`frontend/src/components/rooms/RoomVrmPanel.tsx`)

```typescript
interface RoomVrmPanelProps {
  agents: RoomAgent[];
  focusedAgentId: string | null;
  onAgentClick: (agentId: string) => void;
}

export function RoomVrmPanel({ agents, focusedAgentId, onAgentClick }: RoomVrmPanelProps) {
  // If no agent focused, show placeholder or agent avatars grid
  if (!focusedAgentId) {
    return (
      <div className="room-vrm-placeholder">
        <p>Click an agent's message to show their avatar</p>
        <div className="agent-avatars-grid">
          {agents.map(agent => (
            <button 
              key={agent.agentId}
              onClick={() => onAgentClick(agent.agentId)}
              className="agent-avatar-button"
            >
              <AgentAvatar agent={agent} size="sm" />
              <span>{agent.displayName}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  
  // Show focused agent's VRM
  const focusedAgent = agents.find(a => a.agentId === focusedAgentId);
  return (
    <div className="room-vrm-display">
      <div className="vrm-header">
        <span>{focusedAgent?.displayName}</span>
        <button onClick={() => onAgentClick(null)}>×</button>
      </div>
      <AvatarRenderer 
        vrmModel={focusedAgent?.vrmModel} 
        // Pass behavior from latest message
      />
    </div>
  );
}
```

---

## 9. Emotion Engine Integration

### 9.1 No Changes Required

The emotion engine already operates per `(user_id, agent_id)` pair. In room chat:

- Each agent maintains independent emotional state with the user
- Pre-LLM trigger detection runs per agent
- Post-LLM learning runs per agent
- Emotional context injected per agent's LLM call

### 9.2 Room-Specific Considerations

```python
# In room chat processing
for agent in responding_agents:
    # Each agent gets their own emotion processing
    emotional_context, triggers = await _process_emotion_pre_llm(
        user_id, agent["agent_id"], user_message, room_id
    )
    
    # Build LLM messages with this agent's emotional context
    llm_messages = build_room_llm_messages(...)
    if emotional_context:
        # Inject after system context, before history
        llm_messages.insert(1, {"role": "system", "content": emotional_context})
```

---

## 10. Games Integration

### 10.1 Room Game State

For multiplayer games, game state becomes room-scoped:

```sql
-- Extend game_stats or create new table
CREATE TABLE IF NOT EXISTS room_game_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES game_registry(id),
    status TEXT DEFAULT 'active',  -- 'active' | 'completed' | 'abandoned'
    state_json TEXT,  -- Game-specific state
    turn_agent_id TEXT,  -- Current turn holder (null = user turn)
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER
);
```

### 10.2 Turn Order Logic

```python
def get_next_turn(game_session: dict, room_agents: list[dict]) -> str | None:
    """Determine next turn holder. Returns agent_id or None (user turn)."""
    current = game_session.get("turn_agent_id")
    
    if current is None:
        # User just played, first agent's turn
        return room_agents[0]["agent_id"] if room_agents else None
    
    # Find next agent in rotation
    current_idx = next(
        (i for i, a in enumerate(room_agents) if a["agent_id"] == current), 
        -1
    )
    next_idx = current_idx + 1
    
    if next_idx >= len(room_agents):
        # All agents played, back to user
        return None
    
    return room_agents[next_idx]["agent_id"]
```

---

## 11. Phased Implementation

### Phase A: Data Foundation (Est: 2-3 hours)

**Files to modify:**
- `backend/db/connection.py` — Add new tables
- `backend/db/repositories/room_repository.py` — New file
- `backend/db/repositories/__init__.py` — Export new repos
- `backend/schemas/requests.py` — Add room request models
- `backend/schemas/responses.py` — Add room response models

**Acceptance:**
- [ ] Tables created on startup
- [ ] Repository methods work (unit tests)
- [ ] Schemas validate correctly

### Phase B: Room CRUD API (Est: 2-3 hours)

**Files to create/modify:**
- `backend/routers/rooms.py` — New router
- `backend/main.py` — Register router
- `backend/dependencies.py` — Add `get_room_id` dependency if needed
- `backend/tests/test_rooms.py` — New test file

**Acceptance:**
- [ ] Can create/read/update/delete rooms via API
- [ ] Can add/remove agents from rooms
- [ ] Access control enforced (user must be participant)

### Phase C: Room Chat Backend (Est: 4-5 hours)

**Files to modify:**
- `backend/routers/rooms.py` — Add chat endpoint
- `backend/services/room_chat.py` — New file for chat logic

**Key logic:**
- Agent routing (mention detection)
- Multi-agent LLM calls
- Message storage with attribution
- SSE streaming support

**Acceptance:**
- [ ] Can send message and get responses from mentioned agents
- [ ] Streaming works with per-agent events
- [ ] Messages stored with correct sender attribution

### Phase D: Frontend Room List & Creation (Est: 3-4 hours)

**Files to create:**
- `frontend/src/routes/user/$userId/rooms/index.tsx`
- `frontend/src/routes/user/$userId/rooms/new.tsx`
- `frontend/src/components/rooms/RoomList.tsx`
- `frontend/src/components/rooms/RoomCard.tsx`
- `frontend/src/components/rooms/CreateRoomModal.tsx`
- `frontend/src/components/rooms/RoomAgentPicker.tsx`
- `frontend/src/utils/roomApi.ts`
- `frontend/src/store/roomStore.ts`

**Acceptance:**
- [ ] Room list page shows user's rooms
- [ ] Can create new room with selected agents
- [ ] Navigation works

### Phase E: Room Chat UI (Est: 5-6 hours)

**Files to create:**
- `frontend/src/routes/user/$userId/rooms/$roomId/index.tsx`
- `frontend/src/components/rooms/RoomChatPanel.tsx`
- `frontend/src/components/rooms/RoomMessageItem.tsx`
- `frontend/src/components/rooms/RoomAgentBadge.tsx`
- `frontend/src/hooks/useRoomChat.ts`

**Key features:**
- Message list with agent attribution
- @mention autocomplete
- Typing indicators per agent
- Streaming response display

**Acceptance:**
- [ ] Can send messages in room
- [ ] Agent responses display with attribution
- [ ] Streaming updates work

### Phase F: VRM Integration (Est: 2-3 hours)

**Files to create/modify:**
- `frontend/src/components/rooms/RoomVrmPanel.tsx`
- Integrate with existing `AvatarRenderer`

**Acceptance:**
- [ ] Click agent message → VRM panel shows that agent
- [ ] VRM animates based on behavior tags
- [ ] Can dismiss/switch focused agent

### Phase G: Polish & Games Foundation (Est: 3-4 hours)

- Room settings UI
- Agent response mode configuration
- Compaction for room history
- Game session table (foundation for multiplayer)
- Mobile responsive layout

---

## 12. Testing Matrix

### Backend Tests

| Test | File | Coverage |
|------|------|----------|
| Room CRUD | `test_rooms.py` | Create, read, update, delete |
| Room access control | `test_rooms.py` | Non-participant blocked |
| Agent management | `test_rooms.py` | Add/remove agents |
| Room chat routing | `test_room_chat.py` | Mention detection, response selection |
| Multi-agent response | `test_room_chat.py` | Sequential processing, storage |
| Message attribution | `test_room_chat.py` | Correct sender_type/sender_id |

### Frontend Tests

| Test | File | Coverage |
|------|------|----------|
| Room store | `roomStore.test.ts` | State management |
| Room API | `roomApi.test.ts` | API client functions |
| Room chat hook | `useRoomChat.test.ts` | Message sending, streaming |
| RoomMessageItem | `RoomMessageItem.test.tsx` | Agent attribution display |

### E2E Tests

1. Create room with 2 agents → room appears in list
2. Send message mentioning agent → only that agent responds
3. Send message without mention → configured agents respond
4. Click agent message → VRM panel appears
5. Delete room → room removed, messages cleaned up

---

## 13. API Reference Summary

### Rooms

```
GET    /api/rooms                           → RoomsListResponse
POST   /api/rooms                           → RoomResponse
GET    /api/rooms/{room_id}                 → RoomDetailResponse
PATCH  /api/rooms/{room_id}                 → RoomResponse
DELETE /api/rooms/{room_id}                 → DeleteResponse
```

### Room Agents

```
GET    /api/rooms/{room_id}/agents          → list[RoomAgentResponse]
POST   /api/rooms/{room_id}/agents          → RoomAgentResponse
PATCH  /api/rooms/{room_id}/agents/{agent}  → RoomAgentResponse
DELETE /api/rooms/{room_id}/agents/{agent}  → DeleteResponse
```

### Room Chat

```
POST   /api/rooms/{room_id}/chat            → RoomChatResponse (or SSE stream)
GET    /api/rooms/{room_id}/history         → RoomHistoryResponse
```

---

## 14. Definition of Done

1. [ ] Users can create rooms with 2+ agents
2. [ ] Messages display with correct agent attribution
3. [ ] @mention routing works (only mentioned agents respond)
4. [ ] VRM display toggles per agent on click
5. [ ] Emotion engine works independently per agent
6. [ ] Room history persists and loads correctly
7. [ ] Streaming responses work with per-agent events
8. [ ] Mobile layout is usable
9. [ ] Test coverage for critical paths
10. [ ] No regression to existing 1:1 sessions

---

## 15. Future Extensions (Out of Scope for V1)

- Agent-to-agent dynamics (agents can @mention each other)
- Team games (agents vs user, or mixed teams)
- Debate mode (agents take opposing positions)
- Room permissions (invite-only, public)
- Room templates (predefined agent combinations)
- Voice chat with multiple TTS streams
- Persistent room settings per user preference
