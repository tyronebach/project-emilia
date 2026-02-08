# Message History Redesign

**Parent:** [README.md](./README.md)  
**Related:** [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md)

---

## Problem

When game context is injected into user messages and sent to Clawdbot, **the augmented message is stored in Clawdbot's session history**. Every subsequent turn includes all previous augmented messages, causing token multiplication:

```
Turn 1: user msg + game context (~200 tokens) → stored
Turn 2: user msg + game context (~200 tokens) → stored
...
Turn 10: LLM receives 10x game context = ~2000 wasted tokens
```

### Current Flow (Problematic)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Frontend                                                             │
│   sendMessage(text, gameContext)                                     │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Backend (chat.py)                                                    │
│   augmented = inject_game_context(text, gameContext)                 │
│                                                                      │
│   POST /v1/chat/completions                                          │
│   {                                                                  │
│     "model": "agent:emilia-thai",                                    │
│     "messages": [{"role": "user", "content": augmented}],  ← BAKED   │
│     "user": session_id   ← Clawdbot manages history                  │
│   }                                                                  │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Clawdbot                                                             │
│   1. Loads session history from JSONL                                │
│   2. Appends current (augmented) message                             │
│   3. Sends full history to LLM                                       │
│   4. Stores augmented message in JSONL  ← PROBLEM                    │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ JSONL Storage (~/.openclaw/agents/emilia-thai/sessions/{uuid}.jsonl) │
│                                                                      │
│   {"type":"message","message":{"role":"user",                        │
│    "content":"your turn\n\n---\n[game: tic-tac-toe]\n..."}}          │
│                                                                      │
│   Game context permanently stored, replayed every turn               │
└──────────────────────────────────────────────────────────────────────┘
```

### Secondary Issue: Refresh/Reconnect

When user refreshes:
1. Frontend calls `GET /api/sessions/{id}/history`
2. Backend reads from Clawdbot's JSONL files
3. Returns messages **with game context still embedded**
4. UI displays raw game context blocks to user

---

## Solution: Webapp-Managed History

The webapp becomes the source of truth for message history. Clawdbot becomes a stateless LLM proxy.

### New Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ Frontend                                                             │
│   sendMessage(text, gameContext)                                     │
│   ↓                                                                  │
│   On response: store raw message in local state                      │
│   On refresh: fetch history from webapp backend                      │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Backend (chat.py)                                                    │
│                                                                      │
│   1. Load history from SQLite (raw messages, no game context)        │
│   2. Build messages array                                            │
│   3. Augment ONLY the current message with game context              │
│   4. POST to Clawdbot WITHOUT session ID (stateless)                 │
│   5. Store raw user message + assistant response in SQLite           │
│                                                                      │
│   POST /v1/chat/completions                                          │
│   {                                                                  │
│     "model": "agent:emilia-thai",                                    │
│     "messages": [                                                    │
│       {"role": "user", "content": "hi"},           ← history (raw)   │
│       {"role": "assistant", "content": "hello!"},  ← history (raw)   │
│       {"role": "user", "content": "move\n---\n[game:...]"}  ← CURRENT│
│     ]                                                                │
│     // NO "user" field — stateless                                   │
│   }                                                                  │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Clawdbot                                                             │
│   Stateless: processes messages array, returns response              │
│   No session storage (or ephemeral only)                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: `messages`

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,                    -- UUID
    session_id TEXT NOT NULL,               -- FK to sessions.id
    role TEXT NOT NULL,                     -- 'user' | 'assistant'
    content TEXT NOT NULL,                  -- Raw message (no game context)
    timestamp REAL NOT NULL,                -- Unix timestamp (float)
    
    -- Metadata (nullable)
    model TEXT,                             -- LLM model used (assistant only)
    processing_ms INTEGER,                  -- Response time (assistant only)
    usage_prompt_tokens INTEGER,            -- Token usage
    usage_completion_tokens INTEGER,
    behavior_intent TEXT,                   -- Parsed [intent:X]
    behavior_mood TEXT,                     -- Parsed [mood:X]
    behavior_mood_intensity REAL,
    behavior_energy TEXT,                   -- Parsed [energy:X]
    behavior_move TEXT,                     -- Parsed [move:X] (games)
    behavior_game_action TEXT,              -- Parsed [game:X] (games)
    
    -- Audio cache (optional, for TTS replay)
    audio_base64 TEXT,                      -- Cached TTS audio
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
```

### Migration

```sql
-- Add to existing migrations
-- No data migration needed (Clawdbot history can be imported if desired)
```

---

## Backend Changes

### Repository: `db/repositories/messages.py`

```python
class MessageRepository:
    @staticmethod
    def get_by_session(session_id: str, limit: int = 50) -> list[dict]:
        """Get messages for session, ordered by timestamp"""
        
    @staticmethod
    def add(session_id: str, role: str, content: str, **meta) -> dict:
        """Add a message to session"""
        
    @staticmethod
    def get_last_n(session_id: str, n: int) -> list[dict]:
        """Get last N messages for LLM context"""
```

### Router: `routers/chat.py`

```python
@router.post("/chat")
async def chat(request: ChatRequest, ...):
    # 1. Load history from SQLite (raw messages)
    history = MessageRepository.get_last_n(session_id, limit=20)
    
    # 2. Build messages array for LLM
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history
    ]
    
    # 3. Augment ONLY current message
    current_content = inject_game_context(request.message, request.game_context)
    messages.append({"role": "user", "content": current_content})
    
    # 4. Store raw user message BEFORE calling LLM
    MessageRepository.add(session_id, "user", request.message)  # Raw!
    
    # 5. Call Clawdbot WITHOUT session (stateless)
    response = await client.post(
        f"{settings.clawdbot_url}/v1/chat/completions",
        json={
            "model": f"agent:{clawdbot_agent_id}",
            "messages": messages,
            "stream": True,
            # NO "user" field
        }
    )
    
    # 6. Store assistant response
    MessageRepository.add(session_id, "assistant", clean_response, **meta)
```

### Router: `routers/sessions.py`

```python
@router.get("/{session_id}/history")
async def get_session_history(session_id: str, ...):
    # Read from SQLite instead of Clawdbot JSONL
    messages = MessageRepository.get_by_session(session_id, limit=limit)
    return {"messages": messages, "session_id": session_id, "count": len(messages)}
```

---

## Frontend Changes

Minimal — the API contract stays the same:

| Endpoint | Before | After |
|----------|--------|-------|
| `POST /api/chat` | Same request format | Same |
| `GET /api/sessions/{id}/history` | Returns messages | Same (source changes) |

The frontend doesn't need to know where history is stored.

---

## Context Window Management

With webapp-managed history, we control exactly what goes to the LLM:

```python
def build_llm_messages(session_id: str, current_msg: str, game_context: dict | None) -> list:
    # Get recent history (configurable limit)
    history = MessageRepository.get_last_n(session_id, n=20)
    
    messages = []
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    
    # Augment only the current message
    current = inject_game_context(current_msg, game_context)
    messages.append({"role": "user", "content": current})
    
    return messages
```

### Token Budget (Game Turn 10)

| Component | Old (Clawdbot history) | New (Webapp history) |
|-----------|------------------------|----------------------|
| System prompt | ~80 | ~80 |
| History (9 turns) | ~1800 + 9×200 = 3600 | ~1800 |
| Current message | ~200 | ~200 |
| **Total** | **~3880** | **~2080** |

**Savings: ~1800 tokens per turn** by turn 10.

---

## Migration Path

### Phase 1: Add messages table
- Add schema, repository, seed script
- No behavior change yet

### Phase 2: Dual-write
- Write to both SQLite and Clawdbot
- Read from Clawdbot (existing behavior)
- Verify data consistency

### Phase 3: Read from SQLite
- Switch `GET /history` to read from SQLite
- Keep writing to both

### Phase 4: Stop Clawdbot session storage
- Remove `user: session_id` from chat requests
- Clawdbot becomes stateless proxy
- Remove Clawdbot JSONL reads

---

## Clawdbot Considerations

### Option A: Stateless (Recommended)
Don't send `user` field. Clawdbot processes messages array without storing.

### Option B: Ephemeral sessions
If Clawdbot requires session:
- Generate a new UUID per request
- Sessions are never reused
- Clawdbot still stores (cleanup separately)

### Option C: Clawdbot-side fix (future)
Add `session_storage: false` or `ephemeral: true` flag to suppress storage.

---

## Files to Change

| File | Change |
|------|--------|
| `backend/db/schema.sql` | Add `messages` table |
| `backend/db/seed.py` | Update for new table |
| `backend/db/repositories/messages.py` | New repository |
| `backend/db/repositories/__init__.py` | Export MessageRepository |
| `backend/routers/chat.py` | Use MessageRepository, remove `user` param |
| `backend/routers/sessions.py` | Read from SQLite, not JSONL |
| `backend/config.py` | Add `CHAT_HISTORY_LIMIT` (default 20) |

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| History storage | Clawdbot JSONL | Webapp SQLite |
| Game context | Stored per message | Injected at request time only |
| Token multiplication | Yes (~200/turn accumulating) | No |
| Refresh handling | Reads JSONL (with game context) | Reads SQLite (clean) |
| Clawdbot role | Session manager + LLM proxy | Stateless LLM proxy |

**Result:** Game context is ephemeral, only present in the current LLM request, never persisted or multiplied.
