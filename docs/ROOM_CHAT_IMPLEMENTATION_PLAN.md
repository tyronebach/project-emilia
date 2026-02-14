# Unified Chat Implementation Plan

**Issue:** #12  
**Date:** 2026-02-14 (Updated)  
**Author:** Ram  
**Status:** APPROVED — Unified approach confirmed

---

## Executive Summary

We're building a unified chat system where every conversation is a "room" that supports 1-N agents. The existing `/chat/:sessionId` interface becomes the foundation, extended to support multiple participants.

**Key Decisions (Thai-approved):**
- ✅ Unified route — no dual interfaces
- ✅ Backend restructure — chatrooms with participants table
- ✅ No backwards compatibility concerns — not in prod
- ✅ UI follows Zoom Mobile / Google Meet conventions
- ✅ Games support variable player count

---

## Architecture Overview

### Data Model

```
chatrooms
├── id (UUID)
├── user_id (owner)
├── name (optional, auto-generated for 1:1)
├── created_at
└── updated_at

chatroom_participants
├── id
├── chatroom_id (FK)
├── agent_id (FK)
├── added_at
├── role (default: 'member', future: 'moderator')
└── UNIQUE(chatroom_id, agent_id)

messages
├── id
├── chatroom_id (FK) -- replaces session_id
├── agent_id (nullable, null = user message)
├── content
├── role (user/assistant)
├── created_at
└── metadata (JSON: emotion, mentions, etc.)
```

**Migration:** Existing `sessions` table data maps to `chatrooms` with single participant.

### Route Structure

```
/user/:userId/chat/:chatroomId   -- unified chat (1 or N agents)
/user/:userId/chat/new           -- create new chat (select agent(s))
/user/:userId                    -- dashboard with chat list
```

The old `/room` routes are deprecated — everything is a "chat" now.

---

## Phase 1: Backend Restructure (2-3 days)

### 1.1 Create New Tables

```sql
-- chatrooms table
CREATE TABLE chatrooms (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- participants junction table
CREATE TABLE chatroom_participants (
    id TEXT PRIMARY KEY,
    chatroom_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    FOREIGN KEY (chatroom_id) REFERENCES chatrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    UNIQUE(chatroom_id, agent_id)
);

-- Update messages table
ALTER TABLE messages ADD COLUMN chatroom_id TEXT;
ALTER TABLE messages ADD COLUMN agent_id TEXT;
-- Migrate existing session_id data, then drop session_id
```

### 1.2 Create Repository

**File:** `backend/db/repositories/chatrooms.py`

```python
class ChatroomRepository:
    def create(self, user_id: str, agent_ids: list[str], name: str = None) -> Chatroom
    def get(self, chatroom_id: str) -> Chatroom
    def get_by_user(self, user_id: str) -> list[Chatroom]
    def add_agent(self, chatroom_id: str, agent_id: str) -> None
    def remove_agent(self, chatroom_id: str, agent_id: str) -> None
    def get_participants(self, chatroom_id: str) -> list[Agent]
    def delete(self, chatroom_id: str) -> None
```

### 1.3 Create Router

**File:** `backend/routers/chatrooms.py`

```python
# CRUD for chatrooms
POST   /api/chatrooms                    # Create chatroom with initial agent(s)
GET    /api/chatrooms                    # List user's chatrooms
GET    /api/chatrooms/:id                # Get chatroom with participants
DELETE /api/chatrooms/:id                # Delete chatroom

# Participant management
POST   /api/chatrooms/:id/participants   # Add agent to chatroom
DELETE /api/chatrooms/:id/participants/:agentId  # Remove agent

# Messages (adapt existing)
GET    /api/chatrooms/:id/messages       # Get message history
POST   /api/chatrooms/:id/messages       # Send message (with optional @mentions)
```

### 1.4 Update Chat Router

Modify `routers/chat.py` to work with chatroom_id instead of session_id. The SSE streaming endpoint becomes:

```python
GET /api/chatrooms/:id/stream   # SSE for real-time messages
POST /api/chatrooms/:id/chat    # Send message, get streamed response
```

---

## Phase 2: Frontend Core (3-4 days)

### 2.1 New Store

**File:** `frontend/src/store/chatroomStore.ts`

```typescript
interface ChatroomState {
  chatrooms: Chatroom[];
  activeChatroom: Chatroom | null;
  participants: Agent[];
  messages: Message[];
  
  // Per-agent state
  agentStatus: Record<string, 'idle' | 'thinking' | 'speaking'>;
  agentEmotion: Record<string, EmotionSnapshot>;
  
  // UI state
  focusedAgentId: string | null;  // For maximized view
  isChatHistoryOpen: boolean;
  
  // Actions
  loadChatroom: (id: string) => Promise<void>;
  sendMessage: (content: string, mentions?: string[]) => Promise<void>;
  addParticipant: (agentId: string) => Promise<void>;
  removeParticipant: (agentId: string) => Promise<void>;
  setFocusedAgent: (agentId: string | null) => void;
}
```

### 2.2 Unified Chat Page

**File:** `frontend/src/routes/user/$userId/chat.$chatroomId.tsx`

Adapts existing `App.tsx` functionality with multi-agent support:

```typescript
function ChatPage() {
  const { chatroomId } = useParams();
  const { participants, messages, agentStatus } = useChatroomStore();
  
  return (
    <div className="chat-container">
      {/* Adaptive avatar display */}
      <AvatarStage participants={participants} />
      
      {/* Chat history button (Google Meet style) */}
      <ChatHistoryButton />
      
      {/* Manage participants */}
      <ParticipantsButton />
      
      {/* Input bar (existing, works as-is) */}
      <ChatInputBar />
      
      {/* Slide-out panels */}
      <ChatHistoryPanel />
      <ManageParticipantsPanel />
    </div>
  );
}
```

### 2.3 Adaptive Avatar Stage

**File:** `frontend/src/components/chat/AvatarStage.tsx`

Follows Zoom Mobile / Google Meet conventions:

```typescript
function AvatarStage({ participants }: { participants: Agent[] }) {
  const { focusedAgentId, agentStatus } = useChatroomStore();
  
  // Sort by recent activity (speaking > thinking > idle)
  const sorted = sortByActivity(participants, agentStatus);
  
  if (participants.length === 1) {
    // Full-screen single avatar (existing behavior)
    return <FullScreenAvatar agent={participants[0]} />;
  }
  
  if (focusedAgentId) {
    // One agent maximized, others as thumbnails
    return (
      <FocusedLayout
        focused={participants.find(p => p.id === focusedAgentId)}
        others={participants.filter(p => p.id !== focusedAgentId)}
      />
    );
  }
  
  // Default: Last 2 active agents prominent, others as thumbnails
  return (
    <SplitLayout
      primary={sorted.slice(0, 2)}
      thumbnails={sorted.slice(2)}
      onThumbnailClick={(agentId) => setFocusedAgent(agentId)}
    />
  );
}
```

**Layouts:**

1. **Single (1 agent):** Full-screen avatar, existing App.tsx behavior
2. **Split (2+ agents):** Two prominent avatars (last speaking), thumbnail strip for others
3. **Focused:** One maximized, thumbnail strip for others (click thumbnail to swap)

### 2.4 Chat History Panel

**File:** `frontend/src/components/chat/ChatHistoryPanel.tsx`

Google Meet mobile style — slides in from right:

```typescript
function ChatHistoryPanel() {
  const { messages, isChatHistoryOpen, participants } = useChatroomStore();
  
  if (!isChatHistoryOpen) return null;
  
  return (
    <SlidePanel side="right" onClose={() => setHistoryOpen(false)}>
      <div className="chat-history">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agent={participants.find(p => p.id === msg.agent_id)}
            isUser={msg.role === 'user'}
          />
        ))}
      </div>
    </SlidePanel>
  );
}
```

### 2.5 Manage Participants Panel

**File:** `frontend/src/components/chat/ManageParticipantsPanel.tsx`

WhatsApp-style member management:

```typescript
function ManageParticipantsPanel() {
  const { participants, addParticipant, removeParticipant } = useChatroomStore();
  const { agents } = useUserStore();  // All user's available agents
  
  const availableToAdd = agents.filter(
    a => !participants.some(p => p.id === a.id)
  );
  
  return (
    <SlidePanel side="right">
      <h2>Participants ({participants.length})</h2>
      
      {/* Current participants */}
      {participants.map(agent => (
        <ParticipantRow
          key={agent.id}
          agent={agent}
          onRemove={() => removeParticipant(agent.id)}
          canRemove={participants.length > 1}
        />
      ))}
      
      {/* Add new */}
      {availableToAdd.length > 0 && (
        <>
          <h3>Add to Chat</h3>
          {availableToAdd.map(agent => (
            <AgentRow
              key={agent.id}
              agent={agent}
              onAdd={() => addParticipant(agent.id)}
            />
          ))}
        </>
      )}
    </SlidePanel>
  );
}
```

---

## Phase 3: Voice & TTS (3-4 days)

### 3.1 Multi-Agent TTS

**File:** `frontend/src/hooks/useChatroomTTS.ts`

Queue-based playback — one agent speaks at a time:

```typescript
function useChatroomTTS(chatroomId: string) {
  const [queue, setQueue] = useState<TTSQueueItem[]>([]);
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  
  const enqueue = (agentId: string, text: string) => {
    setQueue(q => [...q, { agentId, text }]);
  };
  
  useEffect(() => {
    if (!speakingAgentId && queue.length > 0) {
      const next = queue[0];
      setSpeakingAgentId(next.agentId);
      playTTS(next.text).then(() => {
        setQueue(q => q.slice(1));
        setSpeakingAgentId(null);
      });
    }
  }, [queue, speakingAgentId]);
  
  return { enqueue, speakingAgentId };
}
```

### 3.2 Voice Input with Mentions

Adapt existing `useVoiceChat` for multi-agent:

- Voice → STT → parse for agent names → route to mentioned agent(s)
- "Hey Emilia" auto-mentions Emilia
- If no mention detected, routes to last-speaking agent or all

---

## Phase 4: Games Integration (2-3 days)

### 4.1 Player Count Validation

Games define min/max players:

```typescript
interface GameConfig {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  // ...
}
```

UI grays out incompatible games:

```typescript
function GameSelector({ participants }: { participants: Agent[] }) {
  const playerCount = participants.length + 1;  // agents + user
  
  return (
    <div className="game-grid">
      {games.map(game => {
        const compatible = 
          playerCount >= game.minPlayers && 
          playerCount <= game.maxPlayers;
        
        return (
          <GameCard
            key={game.id}
            game={game}
            disabled={!compatible}
            disabledReason={
              !compatible 
                ? `Requires ${game.minPlayers}-${game.maxPlayers} players`
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
```

### 4.2 Game Prompt Routing

Game module handles multi-agent prompts internally. The chatroom just provides:
- List of participants
- Send message to specific agent(s)
- Receive responses

---

## Phase 5: Migration & Cleanup (1-2 days)

### 5.1 Data Migration

Script to migrate existing sessions to chatrooms:

```python
def migrate_sessions_to_chatrooms():
    sessions = db.query(Session).all()
    
    for session in sessions:
        # Create chatroom
        chatroom = Chatroom(
            id=session.id,  # Preserve ID for URL compatibility
            user_id=session.user_id,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )
        db.add(chatroom)
        
        # Add single participant
        participant = ChatroomParticipant(
            chatroom_id=chatroom.id,
            agent_id=session.agent_id,
            added_at=session.created_at,
        )
        db.add(participant)
        
        # Update messages
        db.query(Message).filter(
            Message.session_id == session.id
        ).update({
            'chatroom_id': chatroom.id,
            'agent_id': session.agent_id,
        })
    
    db.commit()
```

### 5.2 Remove Old Code

- Delete `RoomChatPage.tsx` and room-specific components
- Delete `routers/rooms.py`
- Delete `store/roomStore.ts`
- Remove room routes from router config
- Update any remaining references

---

## File Structure

### New Files
```
backend/
├── db/
│   ├── models.py              # Add Chatroom, ChatroomParticipant
│   └── repositories/
│       └── chatrooms.py       # Chatroom CRUD
├── routers/
│   └── chatrooms.py           # Chatroom API endpoints
└── schemas/
    └── chatrooms.py           # Request/response models

frontend/src/
├── store/
│   └── chatroomStore.ts       # Unified chat state
├── hooks/
│   ├── useChatroom.ts         # Chatroom data fetching
│   └── useChatroomTTS.ts      # Multi-agent TTS
├── components/chat/
│   ├── AvatarStage.tsx        # Adaptive avatar layout
│   ├── ChatHistoryPanel.tsx   # Slide-out message history
│   ├── ManageParticipantsPanel.tsx
│   ├── FocusedLayout.tsx      # One maximized + thumbnails
│   └── SplitLayout.tsx        # Two prominent + thumbnails
└── routes/user/$userId/
    └── chat.$chatroomId.tsx   # Unified chat page
```

### Modified Files
```
backend/
├── main.py                    # Add chatrooms router
├── db/models.py               # Add new models
└── routers/chat.py            # Update to use chatroom_id

frontend/src/
├── App.tsx                    # Refactor to use chatroomStore
├── routes/user/$userId/index.tsx  # Update chat list
└── utils/api.ts               # Add chatroom API functions
```

### Deleted Files
```
frontend/src/
├── components/rooms/          # All room-specific components
├── store/roomStore.ts
├── hooks/useRoomChat.ts
└── routes/user/$userId/room.$roomId.tsx

backend/
└── routers/rooms.py
```

---

## Implementation Order

| Phase | Task | Est. Time |
|-------|------|-----------|
| 1.1 | Create chatrooms + participants tables | 2h |
| 1.2 | Create ChatroomRepository | 3h |
| 1.3 | Create chatrooms router | 3h |
| 1.4 | Update chat router for chatroom_id | 2h |
| 2.1 | Create chatroomStore | 3h |
| 2.2 | Build unified ChatPage | 4h |
| 2.3 | Build AvatarStage (adaptive layouts) | 4h |
| 2.4 | Build ChatHistoryPanel | 2h |
| 2.5 | Build ManageParticipantsPanel | 3h |
| 3.1 | Multi-agent TTS queue | 3h |
| 3.2 | Voice input with mentions | 4h |
| 4.1 | Games player count validation | 2h |
| 5.1 | Data migration script | 2h |
| 5.2 | Remove old code | 1h |

**Total: ~38 hours (~5 working days)**

---

## UI Reference

### Single Agent (1:1)
```
┌─────────────────────────────────┐
│  [☰]              [💬] [👥]    │  <- Menu, History, Participants
│                                 │
│                                 │
│         ┌─────────┐             │
│         │         │             │
│         │  AVATAR │             │  <- Full-screen avatar
│         │  (VRM)  │             │
│         │         │             │
│         └─────────┘             │
│                                 │
│  😊 Happy                       │  <- Emotion badge
│                                 │
├─────────────────────────────────┤
│  [     Type a message...    ]  │  <- Input bar
└─────────────────────────────────┘
```

### Multiple Agents (Split View)
```
┌─────────────────────────────────┐
│  [☰]              [💬] [👥]    │
│                                 │
│  ┌──────────┐ ┌──────────┐     │
│  │  AGENT   │ │  AGENT   │     │  <- Two prominent (last active)
│  │    1     │ │    2     │     │
│  │ Speaking │ │ Thinking │     │
│  └──────────┘ └──────────┘     │
│                                 │
│  [A3] [A4] [A5]  +2 more        │  <- Thumbnail strip
│                                 │
├─────────────────────────────────┤
│  [     Type a message...    ]  │
└─────────────────────────────────┘
```

### Chat History Panel (Slide-out)
```
┌──────────────────┬──────────────┐
│                  │ Chat History │
│   AVATAR VIEW    │──────────────│
│                  │ You: Hello   │
│                  │              │
│                  │ Emilia: Hi!  │
│                  │              │
│                  │ Rem: Hello~  │
│                  │              │
├──────────────────┴──────────────┤
│  [     Type a message...    ]  │
└─────────────────────────────────┘
```

---

## Questions Resolved

| Question | Decision |
|----------|----------|
| Unified vs Parallel? | ✅ Unified (Option A) |
| Add/Remove Agents? | ✅ Yes, WhatsApp-style sidebar |
| Voice Priority? | ✅ Phase 3, after core UI |
| Games in Rooms? | ✅ Yes, gray out incompatible |
| Migration Path? | ✅ Hard migration, no backwards compat |
| Avatar Layout? | ✅ Zoom/Meet style (split + thumbnails) |
| Chat History? | ✅ Slide-out panel (Meet mobile style) |

---

*Ready to implement. Starting with Phase 1 (Backend Restructure).*
