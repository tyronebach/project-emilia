# Unified Chat Implementation Plan

**Issue:** #12  
**Date:** 2026-02-14 (Updated)  
**Author:** Ram  
**Status:** IN PROGRESS — Phase 1 complete

---

## Executive Summary

We're building a unified chat system where every conversation is a "room" that supports 1-N agents. The existing `/chat/:sessionId` interface becomes the foundation, extended to support multiple participants.

**Key Decisions (Thai-approved):**
- ✅ Unified route — no dual interfaces
- ✅ Extend `sessions` table (NOT separate `chatrooms` table)
- ✅ Use `session_agents` junction table for multi-agent
- ✅ No backwards compatibility concerns — not in prod
- ✅ UI follows Zoom Mobile / Google Meet conventions
- ✅ Games support variable player count

---

## Architecture Overview

### Data Model (IMPLEMENTED)

We extend the existing `sessions` table rather than creating a separate `chatrooms` table:

```
sessions (existing, extended)
├── id (UUID)
├── agent_id (primary agent, for backwards compat)
├── name
├── created_at
├── last_used
├── message_count
├── summary (compaction)
└── ...

session_agents (NEW junction table)
├── session_id (FK → sessions)
├── agent_id (FK → agents)
├── added_at
├── role (default: 'participant')
└── PRIMARY KEY (session_id, agent_id)

messages (extended)
├── ...existing columns...
├── agent_id (NEW: which agent sent this message)
└── ...
```

**Backfill:** Existing sessions populated `session_agents` from `sessions.agent_id`.

### Route Structure

```
/user/:userId/chat/:chatroomId   -- unified chat (1 or N agents)
/user/:userId/chat/new           -- create new chat (select agent(s))
/user/:userId                    -- dashboard with chat list
```

The old `/room` routes are deprecated — everything is a "chat" now.

---

## Phase 1: Backend Restructure ✅ COMPLETE

### 1.1 Database Schema ✅

Extended `sessions` table (no separate `chatrooms` table needed):

```sql
-- session_agents junction table (multi-agent support)
CREATE TABLE session_agents (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    role TEXT DEFAULT 'participant',
    PRIMARY KEY (session_id, agent_id)
);

-- Added agent_id to messages
ALTER TABLE messages ADD COLUMN agent_id TEXT;

-- Backfill existing data
INSERT OR IGNORE INTO session_agents (session_id, agent_id, added_at)
SELECT id, agent_id, created_at FROM sessions WHERE agent_id IS NOT NULL;

UPDATE messages SET agent_id = (SELECT agent_id FROM sessions WHERE sessions.id = messages.session_id)
WHERE role = 'assistant' AND agent_id IS NULL;
```

### 1.2 SessionRepository Extended ✅

**File:** `backend/db/repositories/sessions.py`

Added methods:
- `get_agents(session_id)` — Get all agents in session
- `add_agent(session_id, agent_id)` — Add agent to session
- `remove_agent(session_id, agent_id)` — Remove agent (can't remove last)
- `get_agent_count(session_id)` — Count agents in session
- `create(..., agent_ids=[])` — Create with multiple agents

### 1.3 Sessions Router Extended ✅

**File:** `backend/routers/sessions.py`

New endpoints:
- `POST /api/sessions/multi` — Create multi-agent session
- `GET /api/sessions/:id/agents` — List session agents
- `POST /api/sessions/:id/agents` — Add agent to session
- `DELETE /api/sessions/:id/agents/:agentId` — Remove agent

### 1.4 Chat Router Updated ✅

**File:** `backend/routers/chat.py`

- Stores `agent_id` on assistant messages
- Existing SSE streaming works unchanged

### 1.5 MessageRepository Updated ✅

**File:** `backend/db/repositories/messages.py`

- `add()` now accepts `agent_id` parameter
- `get_by_session()` includes `agent_id` in results

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
