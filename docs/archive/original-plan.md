# Local-First Waifu ("Annie-like") - Plan Doc (Rev E)

**Target:** Web app + Clawdbot running on this host (**no GPU**), new agent **Emilia** (Re:Zero). **STT runs on `layla-XPS-8940` (192.168.88.252), RTX 3060, same LAN**. Avatar is **Three.js + VRM**. **TTS via ElevenLabs (MVP)**. LLM via **OpenAI (configurable; current target: gpt-5.2)**. Memory: "full memory mode". **Emilia is fully guardrailed** (no web search, no exec, companion-only tools).

> This is a build plan + exec-ready framing. It explicitly calls out **latency**, **VRAM**, **security**, and **memory mechanics**.

---

## 0) Exec 1-Pager (copy/paste)

### What (1 sentence)
A local-first, voice-first "AI companion" web app: push-to-talk → fast voice reply → 3D VRM avatar, with durable personal memory and safe controls.

### Latency Target (P95)
Goal: **response audio starts ≤ 2.0s** after PTT release (P95).

| Stage | Target (P95) | Measured | Hard vs aspirational | Notes |
|---|---:|---:|---|---|
| Audio upload + server dispatch (web → app host) | ≤ 120ms | TBD | Hard | LAN/WAN dependent |
| STT RPC overhead (host → 3060 STT service) | ≤ 80ms | **~1ms P50, 30ms P95** ✅ | Hard | LAN; keep STT endpoint local-only |
| STT compute (3060, faster-whisper GPU) | ≤ 350ms | **273ms** (4s audio) ✅ | Hard | small model, 15-19x realtime |
| LLM (OpenAI gpt-5.2) | ≤ 850ms | TBD | Aspirational | Stream text immediately; keep prompts tight |
| TTS (ElevenLabs) | ≤ 500ms | TBD | Aspirational | API round-trip; use streaming audio if available |
| Client buffer + render | ≤ 100ms | TBD | Hard | decoding + WebAudio |
| **Total to audio start** | **≤ 2000ms** | **TBD** |  | P95 end-to-end |

**Perceived latency note:** even if end-to-end is ~2s, **streaming** (LLM text + TTS audio) makes it *feel* much faster because audio can begin before the full response is generated.

### Cost Model (initial estimate + formula)
We'll measure real usage, but here's a concrete way to forecast cost.

**Inputs to track (log these per turn):**
- `llm_input_tokens`, `llm_output_tokens`
- `tts_chars`
- turns/day

**Monthly cost formula (fill in current vendor pricing):**
- LLM: `(tokens_in * price_in + tokens_out * price_out) * turns_per_month`
- TTS (ElevenLabs): `(chars_per_month * price_per_char)` (or per-minute, depending on plan)
- STT: local GPU = electricity + time (no per-call API fee)

**Example planning scenario (replace with real measured numbers):**
- 60 turns/day × 30 days = 1800 turns/month
- Avg 600 in-tokens + 250 out-tokens per turn
- Avg 500 chars TTS per turn

Result: once we plug in current prices, we can produce an honest monthly range (low/med/high).

### Tech Stack (confirmed)
- Avatar: **Three.js + VRM (three-vrm)**
- STT: **faster-whisper on `layla-XPS-8940` (192.168.88.252)** - RTX 3060, LAN service
- TTS (MVP): **ElevenLabs** (streaming if possible)
- LLM: **OpenAI (configurable; current target: gpt-5.2)**
- Orchestration/memory/tools + agent runtime: **Clawdbot** (this host, no GPU)
- Agent: **Emilia** (Re:Zero) - guardrailed companion persona

### Top Risks + Mitigations
1. **Voice latency feels slow** → latency budget + measure each stage + streaming LLM/TTS + aggressive caching.
2. **LAN STT dependency** (3060 down / network hiccup) → health checks + retry/backoff + clear UI states; optional fallback STT on 3080.
3. **STT GPU contention on the 3060** → pick model size that fits, enforce concurrency limits, and add pass/fail VRAM gates (§3.2-§3.4).
4. **"Full memory" privacy/security** → explicit data controls (view/export/delete), encryption at rest, strict auth, prompt-injection hardening.

### Success Criteria
- [ ] Audio starts ≤ **2.0s P95** after PTT release
- [ ] VRM avatar renders + lip flap + 3 emotions
- [ ] Memory persists across sessions and is user-inspectable + deletable

### 2-Minute Demo Script
1) PTT: "Remember my boot size is 11 and my favorite vibe is teasing." → confirms + stores.
2) PTT: Ask about it later → recalls correctly.
3) PTT: "Set a reminder to stretch in 20 minutes." → cron fires, Emilia nudges you.
4) Toggle "show memory" → displays what was stored.

---

## 1) What We're Building (System Overview)
A single web app talks to an agent "brain" (Clawdbot-based) and two realtime media services (STT/TTS). The avatar is rendered in the browser via Three.js.

**Emilia (agent definition):** Emilia is the waifu/companion persona from Re:Zero - warm, earnest, slightly naive but genuinely caring. Implemented as a dedicated **Clawdbot agent** with:
- **Persona:** Half-elf spirit arts user; kind and supportive; tries her best
- **Guardrails:** Fully restricted - no `web_search`, no `web_fetch`, no `exec`, no `browser`, no `gateway`
- **Allowed tools:** `memory_search`, `memory_get`, `read`/`write` (workspace only), `tts`, `cron` (reminders)
- **Memory policy:** Full memory mode (see §6) - remembers user preferences, conversations, relationship context

**Topology note:** the **Brain + Web app** run on a **no-GPU host**. **STT runs on a separate RTX 3060 host on the same LAN** to keep transcription fast without moving the whole stack onto a GPU box.

**Core services (logical):**
1. **Brain / Orchestrator** (Clawdbot agent + API wrapper)
   - Conversational state, persona, tool routing, autonomy hooks
   - Calls OpenAI (model configurable; current target: gpt-5.2)
   - Writes/reads memory (see §6)
   - Emits structured events for UI + avatar

2. **Voice Services**
   - **STT (LAN service on RTX 3060)**: faster-whisper (GPU)
   - **TTS (API, MVP)**: ElevenLabs
   - Output: transcript + audio (+ timing if available)

3. **Web App**
   - Push-to-talk mic capture
   - Sends audio → STT → Brain → TTS
   - Plays audio + renders VRM avatar driven by events

**Data flow (push-to-talk):**
`Mic audio → STT → text → Brain (LLM + tools + memory) → assistant text → TTS → audio → Web playback + avatar`.

---

## 1.5) Brain Integration (Clawdbot HTTP API)

The webapp talks to any Clawdbot agent via the **OpenAI-compatible HTTP API**.

### Endpoint
```
POST http://127.0.0.1:18789/v1/chat/completions
```

### Headers
```
Authorization: Bearer <gateway-token>
Content-Type: application/json
x-clawdbot-agent-id: emilia   # or: main, ram, rem, minerva
```

### Request Body
```json
{
  "model": "clawdbot",
  "messages": [{"role": "user", "content": "Hello!"}],
  "stream": true,
  "user": "webapp-session-123"
}
```

### Agent Selection
For the waifu app, **do not** make agent selection dynamic.

- The backend must be locked to **only**: `x-clawdbot-agent-id: emilia`
- Never allow `main` (Beatrice) or any other agent as a fallback/default
- If a misconfiguration occurs, the backend should **fail closed** (raise/exit) rather than silently routing to another agent

If you want “same webapp, different waifu”, do it as separate deployments with separate allowlists/tokens (not a user-controlled header).

### Session Persistence
- The `user` field creates stable sessions
- Same `user` value = same conversation context
- Agent remembers previous turns

### Streaming (SSE)
- Set `stream: true` for real-time text
- Events: `data: {"choices":[{"delta":{"content":"..."}}]}`
- Ends with `data: [DONE]`

### Security (current + future)
- **Current:** Bearer token auth (gateway token)
- **Future:** Can add session tokens, rate limits, IP allowlist

### Why This Approach
- ✅ **Pluggable** — swap agent with one header
- ✅ **Secure** — token auth, extensible
- ✅ **Streaming** — real-time responses
- ✅ **Session-aware** — multi-turn conversations
- ✅ **Already built** — no new code needed in Gateway

---

## 2) Key Decisions (Locked)
- Avatar: **Three.js + VRM**
- Interaction: **Push-to-talk**
- Memory: **Full memory mode** (implemented as multi-layer + retrieval, not infinite prompt)
- LLM: **OpenAI (configurable; current target: gpt-5.2)**
- Deployment topology: **Brain + Web app on no-GPU host**, **STT on RTX 3060 over LAN**
- TTS: **ElevenLabs (MVP)**

**Available hardware on this LAN:**
- Host A (current): Clawdbot/web app host (no GPU)
- Host B: `layla-XPS-8940` / 192.168.88.252 - **RTX 3060** (STT service) ✅ confirmed
- Host C: RTX 3080 (fallback/future)
- Host D: RTX 5090 (avoid unless needed; opportunity cost)

---

## 3) Latency + VRAM Budgets (must measure early)

### 3.1 Concurrency policy (initial)
- Allow **1 active voice turn** at a time per user session.
- Queue additional requests; show UI "thinking/speaking" state.
- Cap GPU concurrency for **STT** to avoid VRAM thrash (TTS is ElevenLabs for MVP).

### 3.2 STT GPU budget (RTX 3060 host)
We need to confirm real numbers on the **RTX 3060** STT machine.

Assumptions (TBD):
- **faster-whisper small/medium** on GPU: typically a few GB VRAM.
- **TTS is ElevenLabs (MVP)** → no GPU usage on our side for TTS.

### 3.3 LAN latency benchmark (app host ↔ `layla-XPS-8940`)
Measure the network overhead so we can justify "STT on LAN is faster than going to OpenAI".

**STT Host:** `layla-XPS-8940` / 192.168.88.252

**Benchmark commands (run from app host):**
```bash
# 1. Ping RTT (100 samples)
ping -c 100 192.168.88.252 | tail -1
# Parse: min/avg/max/mdev

# 2. STT RPC overhead (once STT service is running)
# curl with timing to STT health endpoint
curl -w "@curl-format.txt" -s http://192.168.88.252:PORT/health
```

Deliverables:
- `ping` RTT (P50/P95)
- STT HTTP request overhead (P50/P95) with a tiny dummy payload

Pass gate:
- host→3060 RPC overhead **≤ 80ms P95** (otherwise we need to co-locate STT with the web app, or optimize transport).

### 3.4 VRAM + STT benchmark checklist (turn TBD into pass/fail)
Run these on the **RTX 3060 STT host** and paste results into the doc.

**Commands:**
- `nvidia-smi -l 1` (watch live)
- (optional) `nvidia-smi --query-gpu=timestamp,memory.used,utilization.gpu --format=csv -l 1`

**Tests:**
1) **Idle baseline (5 min)**
   - Record: baseline VRAM used
2) **STT burst (30 transcripts back-to-back)**
   - Record: peak VRAM, avg STT time, any spikes
3) **Mixed load (STT while web app is active)**
   - Record: peak VRAM, any slowdowns

**Pass/fail gates (MVP):**
- PASS: peak VRAM stays below a safe ceiling for the 3060 (set after first run) and **no OOM / no process restarts**
- PASS: STT compute meets the latency budget target for chosen model size
- FAIL: OOM or STT routinely exceeds budget → downsize model, reduce concurrency, or move STT to a stronger GPU host (3080/5090)

Deliverable for Week 1: attach measured numbers above and replace "TBD" fields.

---

## 4) TTS (MVP choice)
We are **skipping local TTS for the MVP**. Use **ElevenLabs** for fastest path to high-quality character voice.

**Why:** reduces implementation risk; quality is predictable; avoids GPU contention on the STT machine.

**Requirements:**
- Use ElevenLabs **streaming** output if available (to reduce perceived latency).
- Cache common phrases (optional) to save cost/latency.
- Treat TTS text as potentially sensitive: send only what's required; do not include hidden prompts.

**Later (post-MVP):** evaluate local options (Piper / XTTS v2 / Fish Speech / StyleTTS2) once the rest of the stack is stable.

---

## 5) MVP Milestones

### Milestone 0 - Text loop (Day 1-2)
Goal: Web page loads, push-to-talk button, transcript appears, assistant replies with text.

Deliverables:
- Web app skeleton (auth + session id)
- STT endpoint working
- Brain endpoint working (OpenAI call) + streaming text output

### Milestone 1 - Voice loop (Day 3-4)
Goal: Mic → STT → Brain → TTS → audio playback.

Deliverables:
- TTS service returns playable audio (wav/opus)
- UI shows clear states: recording → transcribing → thinking → speaking
- Basic latency instrumentation + logs

### Milestone 2 - Avatar loop (Day 5-7)
Goal: VRM avatar loads in browser; idle + talking + simple emotions.

Deliverables:
- VRM viewer (Three.js) + animation mixer
- "Talking" mouth open/close driven by audio amplitude (RMS)
- Emotion mapping from Brain `assistant.emotion`

### Milestone 3 - Full memory mode (Week 2)
Goal: Persistent memory that changes behavior over time **and is controllable by the user**.

Deliverables:
- Memory store schema
- Retrieval strategy (recent + long-term facts + summaries + snippets)
- UI affordances: show/export/delete/forget

---

## 6) Memory (Full Memory Mode, specified)
"Full memory" ≠ "infinite prompt history". It means: **store everything**, **summarize**, **retrieve relevant parts**.

### 6.1 Memory layers
1) **Short-term context**: last N turns (verbatim)
2) **Episodic log**: append-only transcript store
3) **Long-term facts**: durable facts (preferences, people, boundaries)
4) **Rolling summaries**: daily/weekly relationship + project summaries

### 6.2 How facts get extracted (decision)
- Default: LLM-assisted extraction at end of a conversation chunk (or scheduled)
  - Prompt: extract candidate facts + confidence + source pointer
  - Write to facts store only if above threshold
- User can also explicitly command: "remember X" / "forget X".

### 6.3 Conflict resolution
- Facts are versioned with timestamps + confidence.
- If contradiction detected ("love pizza" vs "hate pizza"):
  - store both, mark conflict
  - ask user to resolve next time it matters

### 6.4 Retrieval (Clawdbot + memory search)
- Baseline: load a small recent window + relationship summary.
- On-demand: use Clawdbot `memory_search` over Markdown memory files (vector + BM25 hybrid when enabled).
- Return snippets + citations into the prompt.

---

## 7) Transport & Protocol (pick one)
**Use WebSocket** for bidirectional realtime events (PTT, streaming status, partial transcripts, etc.).

Events from Brain → Web:
- `assistant.text.delta` (streaming)
- `assistant.text.final`
- `assistant.emotion`
- `assistant.audio.ready` (url/id)
- `ui.state` (transcribing/thinking/speaking)

---

## 8) Security (minimum viable posture)
This system stores personal data. Treat it like a private app.

### 8.1 Emilia agent guardrails
Emilia is intentionally restricted to companion-only capabilities:

**DENIED tools:**
- `web_search`, `web_fetch` — no internet research
- `exec`, `process` — no shell access
- `browser` — no web automation
- `gateway` — no system config changes
- `message` — no cross-channel messaging
- `sessions_spawn` — no sub-agent spawning

**ALLOWED tools:**
- `memory_search`, `memory_get` — recall past conversations
- `read`, `write`, `edit` — workspace files only (her own memory)
- `tts` — voice output
- `cron` — reminders and scheduled nudges

This keeps Emilia safe for open-ended conversation without risk of unintended external actions.

### 8.2 General security requirements
- Strong auth (at minimum password + token; ideally SSO later)
- HTTPS/TLS termination (nginx)
- Strict CORS policy (only your domain)
- Rate limits per IP + per session (STT/TTS/Brain)
- Prompt-injection hardening:
  - tool allowlist
  - never execute arbitrary code
  - sanitize external fetch results before injecting
- **Third-party data egress controls (ElevenLabs):**
  - only send the final user-visible text to TTS (no hidden system prompts)
  - document what leaves the server (text to ElevenLabs)
- Memory controls:
  - view/export/delete
  - redaction for sensitive PII when exporting

---

## 9) Ops / Hosting

### 9.1 Docker Compose layout (split-host)
Because STT runs on a separate LAN GPU host (RTX 3060), treat deployment as **two stacks**.

**Host A (no GPU) — Brain + Web:**
- `brain` (clawdbot + API wrapper)
- `web`
- `nginx` (TLS + routing)

**Host B: `layla-XPS-8940` / 192.168.88.252 (RTX 3060) — STT service:**
- `stt` (faster-whisper GPU service)

**External APIs (not containers):**
- `tts` = ElevenLabs
- `llm` = OpenAI

### 9.2 Observability
Track per request:
- end-to-end latency (PTT release → audio start)
- STT time
- LLM time
- TTS time
- error rate + retries

Required UX behavior:
- if STT fails → show error + allow retry
- if TTS fails → fall back to text-only response
- if WebSocket drops → reconnect + keep session id

---

## 10) Task Breakdown (day-sized)

Day 1
- Web app scaffold + PTT capture + basic auth

Day 2
- STT service integrated + partial transcript UI

Day 3
- Brain API wrapper invoking Clawdbot agent + OpenAI LLM (stream text)

Day 4
- Pick + integrate **validated TTS** + measure latency/VRAM

Day 5
- Three.js VRM viewer + idle animation

Day 6
- Lip flap from audio amplitude + speaking state sync

Day 7
- Emotion tags + expressions

Week 2
- Memory extraction + conflict resolution + memory UI controls
- Hardening: rate limits, retries, reconnection, logs

---

## 11) Definition of Done (MVP)
- URL opens to web UI (auth required)
- Push-to-talk works reliably (desktop Chrome + mobile Safari tested)
- Assistant replies in voice (TTS) + text
- VRM avatar animates (idle + talking + ≥3 emotions)
- Memory persists across sessions and affects responses
- Memory is user-inspectable + deletable
- P95 latency target met (or measured with clear bottleneck list)
