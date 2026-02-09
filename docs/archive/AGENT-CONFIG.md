# Emilia Agent Configuration

**⚠️ DO NOT CHANGE WITHOUT THAI'S APPROVAL ⚠️**

---

## Model Assignment

All Emilia agents use the **budget-friendly** model:

```
openai-codex/gpt-5.1-codex-mini
```

| Agent | Model | Reason |
|-------|-------|--------|
| `emilia-thai` | `openai-codex/gpt-5.1-codex-mini` | Cost efficiency |
| `emilia-emily` | `openai-codex/gpt-5.1-codex-mini` | Cost efficiency |

**DO NOT upgrade to gpt-5.2 or gpt-5.1-codex-max** — these are companion chatbots, not coding agents. The mini model is sufficient.

---

## Tool Restrictions

Emilia agents are **sandboxed** with limited tools:

### Allowed
- `read` — read workspace files
- `write` — write to workspace
- `edit` — edit workspace files
- `memory_search` — semantic memory search
- `memory_get` — retrieve memory snippets
- `tts` — text-to-speech

### Denied
- `exec`, `process` — no shell access
- `browser` — no web browsing
- `gateway` — no system control
- `nodes`, `cron`, `canvas` — no system features
- `web_search`, `web_fetch` — no internet
- `message` — no messaging other channels

---

## Sandbox Settings

```json
{
  "sandbox": {
    "mode": "all",
    "scope": "agent",
    "workspaceAccess": "rw"
  }
}
```

---

## Why These Choices?

1. **Model**: Waifu companions don't need heavy reasoning — conversation + memory is enough
2. **Tools**: Companions shouldn't have shell access or internet — security + simplicity
3. **Sandbox**: Isolated from household agents — can't access Thai's files

---

## Changing Config

If you need to change something:
1. **Ask Thai first**
2. Update `~/.openclaw/openclaw.json`
3. Restart gateway: `source ~/.openclaw/secrets.env && openclaw gateway restart`
4. Update this doc

---

*Last updated: 2026-02-01 by Beatrice*
