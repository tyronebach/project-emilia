# Future Product Architecture - Emilia Brain

**Date:** 2026-02-01  
**Status:** Parked for future  
**Context:** Discussion about scaling beyond household to product

---

## The Problem with Clawdbot at Scale

Clawdbot requires:
- Pre-defined agents in config
- Gateway restart when adding agents
- Not designed for multi-tenant SaaS

### Options Considered

| Option | Approach | Verdict |
|--------|----------|---------|
| Pre-provision pool | Define 100-1000 agents upfront | Works for MVP, has ceiling |
| Modify Clawdbot | Add dynamic agent API | Fork maintenance burden |
| Stateless | 1 agent, backend owns context | Loses Clawdbot magic |
| **DIY Brain** | Build focused replacement | Clean, scalable, more work |

---

## DIY "Emilia Brain" Architecture

### What We Need from Clawdbot
- Memory flow (embeddings + semantic search)
- Skills (weather, web search)
- LLM routing
- TTS integration

### What We DON'T Need
- Telegram/WhatsApp/Discord channels
- Exec/browser/file tools
- Sandboxing
- Agent-to-agent messaging
- Complex config system

### Proposed Stack

```
┌─────────────────────────────────────────┐
│           FastAPI Backend               │
├─────────────────────────────────────────┤
│  Auth     │  Sessions   │  Memory       │
│  (JWT)    │  (Postgres) │  (pgvector)   │
├─────────────────────────────────────────┤
│              Skills Layer               │
│  weather.py │ search.py │ tts.py       │
├─────────────────────────────────────────┤
│            LLM Router                   │
│     (Anthropic API direct)              │
└─────────────────────────────────────────┘
```

### Memory System

```python
# memory.py
from pgvector.sqlalchemy import Vector

class MemoryStore:
    def embed(self, text: str) -> list[float]:
        # Gemini or OpenAI embeddings
        return embedding_api.embed(text)
    
    def store(self, user_id: str, content: str, metadata: dict):
        embedding = self.embed(content)
        db.insert(Memory(user_id, content, embedding, metadata))
    
    def search(self, user_id: str, query: str, limit=5) -> list[Memory]:
        query_vec = self.embed(query)
        return db.query(Memory)
            .filter_by(user_id=user_id)
            .order_by(Memory.embedding.cosine_distance(query_vec))
            .limit(limit)
            .all()
```

### Skills (Simple Python modules)

```python
# skills/weather.py
async def get_weather(location: str) -> str:
    resp = await httpx.get(f"https://wttr.in/{location}?format=3")
    return resp.text

# skills/search.py  
async def web_search(query: str) -> list[dict]:
    resp = await httpx.get("https://api.search.brave.com/...",
        headers={"X-API-Key": BRAVE_KEY},
        params={"q": query})
    return resp.json()["results"]
```

### Brain (LLM + Tools)

```python
# brain.py
async def chat(user: User, message: str) -> str:
    # 1. Search memory for relevant context
    memories = memory_store.search(user.id, message)
    
    # 2. Build system prompt
    system = f"""
{user.soul_md}
{user.user_md}

## Relevant Memories
{format_memories(memories)}
"""
    
    # 3. Call Anthropic with tools
    response = await anthropic.messages.create(
        model="claude-sonnet-4-20250514",
        system=system,
        messages=get_history(user.id) + [{"role": "user", "content": message}],
        tools=[weather_tool, search_tool]
    )
    
    # 4. Handle tool calls, save to memory, return
    ...
```

---

## Development Estimate

| Component | Time |
|-----------|------|
| Auth + Users | 1 day |
| Session/History storage | 1 day |
| Memory system (pgvector) | 2 days |
| Skills (weather, search, TTS) | 1 day |
| LLM router + tool handling | 2 days |
| Avatar control (mood/anim tags) | Already done |
| Frontend tweaks | 1-2 days |
| **Total** | **~10 days** |

---

## Benefits of DIY

- Cleaner, focused codebase
- Full control over features
- No Clawdbot dependency
- Easier deployment (Docker + Postgres)
- Scales to unlimited users
- No gateway restarts ever

---

## When to Build This

1. ✅ First: Household MVP (trusted, no auth, uses Clawdbot)
2. Then: Validate the concept with family
3. Then: If product potential confirmed, build Emilia Brain
4. Deploy as standalone SaaS

---

## References

- Game modules research: `GAME-MODULES-RESEARCH.md`
- Current architecture: `../ARCHITECTURE.md`

---

*Parked for future Thai. Current focus: household "Simply Piano" version.*
