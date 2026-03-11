# P001: OpenClaw Session Reuse

**Status:** Proposed
**Created:** 2026-02-09
**Author:** Beatrice (for Thai)

## Problem

Each webapp API call creates a new OpenClaw session. Over time this causes:
- Session file accumulation (~178 files currently, will grow to thousands)
- Potential performance issues on `openclaw status` / `openclaw doctor`
- Disk space waste (small but avoidable)

## Root Cause

Current `chat.py` calls `/v1/chat/completions` without a `user` field or session key header. OpenClaw creates a unique session per request (stateless-by-default behavior).

## Solution

Pass a stable session identifier derived from webapp's `session_id` so OpenClaw reuses the same session for all messages in a conversation.

### Why This Is Safe ("Write-Only")

The concern was that reusing sessions would leak injected backend context to the frontend. This is **not a risk** because:

1. Webapp passes its own `messages` array (from SQLite) — OpenClaw uses these for the LLM call
2. OpenClaw's session files are **transcripts**, not read by the webapp
3. The response goes to webapp's SQLite — webapp never queries OpenClaw's history
4. Effectively "write-only" already: OpenClaw stores transcripts, webapp ignores them

### Implementation

**Option A: Use `user` field (recommended)**
```python
# backend/routers/chat.py - in _build_llm_request()
json={
    "model": f"agent:{clawdbot_agent_id}",
    "messages": messages,
    "stream": False,
    "user": f"emilia:{session_id}",  # ← Add this
}
```

**Option B: Use header**
```python
headers={
    "Authorization": f"Bearer {settings.clawdbot_token}",
    "Content-Type": "application/json",
    "x-openclaw-session-key": f"emilia:{session_id}",  # ← Add this
}
```

Both achieve the same result. Option A is cleaner (standard OpenAI field).

## Changes Required

### File: `backend/routers/chat.py`

1. Non-streaming path (~line 287):
```python
json={
    "model": f"agent:{clawdbot_agent_id}",
    "messages": messages,
    "stream": False,
    "user": f"emilia:{sid}",  # ADD
}
```

2. Streaming path (~line 349):
```python
json={
    "model": f"agent:{clawdbot_agent_id}",
    "messages": messages,
    "stream": True,
    "stream_options": {"include_usage": True},
    "user": f"emilia:{sid}",  # ADD
}
```

### File: `backend/services/compaction.py`

The compaction service also calls OpenClaw but uses a different session (summarization). This can stay as-is (one-off calls) OR use a stable key like `"emilia:compaction"` to avoid accumulation.

```python
json={
    "model": settings.compact_model,
    "messages": llm_messages,
    "stream": False,
    "user": "emilia:compaction",  # OPTIONAL - reduces session files
},
```

## Expected Results

- **Before:** 1 OpenClaw session per message → thousands of session files
- **After:** 1 OpenClaw session per webapp conversation → hundreds of session files (matches webapp session count)

## Migration / Cleanup

Existing orphan sessions can be cleaned up manually or via cron:
```bash
# Delete sessions older than 7 days
find ~/.openclaw/agents/emilia-thai/sessions -name "*.jsonl" -mtime +7 -delete
```

This is optional — new sessions will simply reuse properly going forward.

## Testing

1. Start webapp, note OpenClaw session count: `ls ~/.openclaw/agents/emilia-thai/sessions/*.jsonl | wc -l`
2. Send 5 messages in one conversation
3. Check session count again — should increase by 1, not 5
4. Verify chat functionality works normally

---

## Codex Prompt

```
Read P001-OPENCLAW-SESSION-REUSE.md in /home/tbach/Projects/emilia-project/emilia-webapp/docs/planning/

Implement the changes described:

1. In backend/routers/chat.py:
   - Add `"user": f"emilia:{sid}"` to the JSON body in BOTH the non-streaming httpx.post call (~line 287) AND the streaming client.stream call (~line 349)
   - The `sid` variable (session_id) is already in scope at both locations

2. In backend/services/compaction.py:
   - Add `"user": "emilia:compaction"` to the JSON body in the httpx.post call

Do not change any other logic. The goal is minimal diff - just add the `user` field to existing API calls.

After making changes, run the existing tests to verify nothing is broken:
cd /home/tbach/Projects/emilia-project/emilia-webapp/backend
python -m pytest tests/ -v

or the scripts in /scripts/check-all.sh
```

---

## References

- OpenClaw docs: `/gateway/openai-http-api.md`
- Session management: `/concepts/session.md`
