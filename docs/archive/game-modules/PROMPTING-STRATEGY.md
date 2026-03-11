# Game Prompting Strategy

**Parent:** [README.md](./README.md)

---

## The Problem

With 1-2 games, putting game instructions in SOUL.md works fine. With 10+ games, it breaks:

| Approach | Tokens in system prompt | Tokens per message (no game) | Tokens per message (playing) |
|----------|------------------------|------------------------------|------------------------------|
| All games in SOUL.md | ~800-1500 (always) | 0 | ~150 (state only) |
| One game skill per game | ~800-1500 (always) | 0 | ~150 (state only) |
| **Three-layer (this design)** | **~80 (always)** | **0** | **~250 (instructions + state)** |

The first two approaches waste tokens on every message — even during normal chat. The third pays only when a game is active, and only for the specific game being played.

### Why OpenClaw skills alone don't solve this

OpenClaw skills load at **session start** — all eligible skills enter the system prompt for the entire session. There's no mechanism to conditionally include a skill based on in-message context (like "is a chess game active?"). So 10 game skills = 10 skills always loaded, even when chatting about the weather.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Game Awareness Skill (OpenClaw workspace skill)    │
│                                                             │
│ • Always in system prompt (~80 tokens)                      │
│ • Tag format: [move:X], [game:X]                            │
│ • General gaming personality guidelines                     │
│ • Lists available games                                     │
│ • Says: "game-specific instructions will be in context"     │
│                                                             │
│ Lives in: emilia-thai/skills/games/SKILL.md                 │
│ Replaces: "Playing Games" section in SOUL.md                │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │ When a game is active...      │
          ▼                               ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ Layer 2: Game Prompt      │  │ Layer 3: Game State       │
│ Instructions              │  │ Context                   │
│ (per-message injection)   │  │ (per-message injection)   │
│                           │  │                           │
│ • Stored in GameModule    │  │ • Board/state             │
│ • Game-specific narration │  │ • Valid moves             │
│ • Strategy personality    │  │ • Turn info               │
│ • ~80-150 tokens          │  │ • ~80-200 tokens          │
│                           │  │                           │
│ Only the ACTIVE game's    │  │ Already implemented in    │
│ instructions are sent     │  │ current architecture      │
│                           │  │                           │
│ Lives in: GameModule      │  │ Lives in: GameModule      │
│ .promptInstructions       │  │ .serializeState()         │
└──────────────────────────┘  └──────────────────────────┘
```

### Token budget by scenario

| Scenario | System prompt | Per-message | Total added |
|----------|--------------|-------------|-------------|
| Just chatting | ~80 (skill) | 0 | ~80 |
| Playing tic-tac-toe | ~80 (skill) | ~120 (instructions) + ~120 (state) | ~320 |
| Playing chess | ~80 (skill) | ~150 (instructions) + ~200 (state) | ~430 |
| Playing 20 questions | ~80 (skill) | ~100 (instructions) + ~100 (state) | ~280 |
| 10 games registered, none active | ~80 (skill) | 0 | ~80 |

The key: registering more games costs **zero** additional tokens. Only the active game adds to context.

---

## Layer 1: Game Awareness Skill

**Location:** `/home/tbach/clawd-agents/emilia-thai/skills/games/SKILL.md`

This is a standard OpenClaw workspace skill. It loads into the system prompt at session start and stays there. It's intentionally minimal — just enough for the agent to know games exist and how to format responses.

**What it contains:**
- Tag format reference (`[move:X]`, `[game:action]`)
- General personality guidelines for gaming (be playful, be a good sport, narrate with personality)
- A note that game-specific instructions will be provided in message context when a game is active

**What it does NOT contain:**
- Game-specific rules or strategy
- How to play chess, tic-tac-toe, etc.
- Board layouts or move formats
- Anything that's only relevant during a specific game

This replaces the `## Playing Games` section previously in SOUL.md.

---

## Layer 2: Per-Game Prompt Instructions

**Location:** `GameModule.promptInstructions` field in each game module

Each game module carries its own LLM instructions — a markdown string describing how the agent should narrate, think, and behave during that specific game.

### How it flows

```
Frontend: GameModule.promptInstructions
    │
    ▼
Frontend: useGame.getGameContext() includes promptInstructions
    │
    ▼
Frontend: streamChat() sends gameContext with promptInstructions
    │
    ▼
Backend: inject_game_context() includes instructions in context block
    │
    ▼
Clawdbot: LLM sees game-specific instructions in the message
```

### Example: Tic-Tac-Toe promptInstructions

```markdown
## Tic-Tac-Toe — How You Play
- Think out loud about your strategy: "If I go here, you might..."
- When blocking: notice the threat and comment on it
- When winning: build up excitement before revealing your move
- Keep it light — it's a quick, casual game
- Positions are numbered 1-9 (top-left to bottom-right)
- Include your move as [move:N] where N is the position number
```

### Example: Chess promptInstructions

```markdown
## Chess — How You Play
Your move has already been decided. Narrate as if YOU chose it.
- Never mention an engine, algorithm, or calculation
- Comment on strategy: openings, tactics, positional ideas
- Reference real chess concepts (pins, forks, development, tempo)
- React to captures and checks with emotion
- If losing: show determination and look for counterplay
- If winning: stay humble but confident
- Describe your move naturally: "I'll develop my knight to f3"
```

### Example: 20 Questions promptInstructions

```markdown
## 20 Questions — How You Play
You picked a secret word. The user asks yes/no questions.
- Answer honestly: yes, no, or sometimes
- Give playful hints when they're getting warm
- Track the count: "That's question 7 of 20..."
- If they're way off: be encouraging but don't give it away
- Build suspense as they narrow it down
- When they guess right: act impressed or surprised
```

### Example: Word Association promptInstructions

```markdown
## Word Association — How You Play
Take turns saying related words. Keep the chain going.
- Pick words that are related but not obvious
- Comment on interesting connections
- If the user's word is a stretch, playfully call it out
- Include your word as [move:word] in your response
- Keep responses short — it's a fast game
```

### Why this lives in the GameModule, not in separate files

1. **Co-location:** The prompt instructions are part of the game's definition, right next to its logic, serialization, and rendering. When you create a new game, you write the prompt alongside the game rules.

2. **Single source of truth:** No separate config file to keep in sync. The GameModule IS the complete game definition — logic, UI, and LLM personality.

3. **Shipped with the game:** If someone adds a new game to the registry, they MUST provide prompt instructions. It's a required field, not an optional config step.

4. **Testable:** You can unit test that the prompt instructions contain the right tag format, game name, etc.

---

## Layer 3: Game State Context (unchanged)

This is the existing `serializeState()` + turn instructions system. No changes needed. It produces the board visualization, valid moves list, and turn instructions that were already designed.

The only change: the context block now includes Layer 2 instructions above the state.

### Updated context block format

```
{user's actual message}

---
[game: tic-tac-toe]

## Tic-Tac-Toe — How You Play          ← Layer 2 (new)
- Think out loud about your strategy
- Keep it light — it's a quick game
- Include your move as [move:N]

Tic-Tac-Toe                            ← Layer 3 (existing)
You are O.

X | 2 | O
---------
4 | X | 6
---------
7 | 8 | 9

Empty positions are shown as numbers (1-9).
It's your turn. Legal moves: 4, 6, 7, 8, 9
Choose a move and include it as [move:your_move] in your response.
---
```

---

## Changes Required

### Frontend

| File | Change |
|------|--------|
| `games/types.ts` | Add `promptInstructions: string` to `GameModule` interface |
| `games/types.ts` | Add `promptInstructions: string` to `GameContext` interface |
| `games/tic-tac-toe/TicTacToeModule.ts` | Add `promptInstructions` field |
| `games/registry.ts` | No changes |
| `hooks/useGame.ts` | Include `promptInstructions` in `getGameContext()` |
| `utils/api.ts` | No changes (already sends full gameContext) |
| Each future game module | Must include `promptInstructions` |

### Backend

| File | Change |
|------|--------|
| `routers/chat.py` | `inject_game_context()` reads and includes `prompt_instructions` |

### OpenClaw Agent

| File | Change |
|------|--------|
| `emilia-thai/skills/games/SKILL.md` | **New:** Game awareness skill |
| `emilia-thai/SOUL.md` | **Remove** "Playing Games" section |

---

## Adding a New Game: Updated Checklist

1. Create directory: `frontend/src/games/your-game/`
2. Define state and move types
3. Implement `GameModule` interface including:
   - Game logic (createGame, applyMove, getValidMoves, getStatus)
   - LLM bridge (serializeState, parseMove, formatMove)
   - **Prompt instructions** (narration style, strategy personality, tag format reminder)
   - React renderer component
4. Add to `games/registry.ts`
5. **That's it.** No SOUL.md changes. No new skills. No backend changes.

The game's prompt instructions travel with the game context automatically.

---

## Why Not: Alternative Approaches Considered

### One OpenClaw skill per game

```
emilia-thai/skills/
  game-chess/SKILL.md
  game-tictactoe/SKILL.md
  game-20questions/SKILL.md
  ... (10 more)
```

**Rejected because:** All skills load at session start. 10 game skills = ~1000-1500 tokens always in the system prompt, even during casual chat. No way to load only the active game's skill.

### Conditional skill loading via env vars

```yaml
metadata:
  openclaw:
    requires:
      env: ["GAME_CHESS_ACTIVE"]
```

**Rejected because:** Env vars are checked at session start, not per-message. A chat session is long-lived — games start and stop within a session. The env var would need to be set before the session begins.

### Everything in SOUL.md with collapsible sections

```markdown
## Playing Games

### If playing tic-tac-toe:
...
### If playing chess:
...
### If playing 20 questions:
...
```

**Rejected because:** The LLM reads all of it regardless of "if" guards. No actual token savings. Just visual organization that doesn't reduce context consumption.

### Dynamic system prompt modification

Modify the system prompt per-message to include/exclude game instructions.

**Rejected because:** Clawdbot/OpenClaw doesn't support per-message system prompt changes. The system prompt is set at session level. Even if it did, modifying system prompts mid-conversation can confuse the LLM's context understanding.

### Per-game prompt in a separate backend config file

```python
GAME_PROMPTS = {
    "chess": "You're playing chess...",
    "tic-tac-toe": "You're playing tic-tac-toe...",
}
```

**Rejected because:** Splits game definition across frontend (logic, UI) and backend (prompts). Harder to maintain, harder to add new games. The frontend GameModule is the natural home for everything game-specific.

---

## Critical: History Storage

⚠️ **The per-message injection design has a dependency:** the webapp must manage message history, not Clawdbot.

If Clawdbot stores augmented messages (with game context), those get replayed in every subsequent turn, causing token multiplication:
- Turn 10 = 10× game context in history = ~2000 wasted tokens

**Solution:** Webapp stores raw messages in SQLite, injects game context only into the current message at request time. Clawdbot becomes a stateless LLM proxy.

**See:** [MESSAGE-HISTORY-REDESIGN.md](./MESSAGE-HISTORY-REDESIGN.md) for full schema and implementation plan.

---

## Summary

The three-layer approach gives us:

- **Zero overhead when not gaming** — only ~80 tokens of skill awareness in system prompt
- **Minimal overhead when gaming** — only the active game's instructions + state
- **Linear scaling** — adding game #11 costs the same as adding game #2 (zero system prompt growth)
- **Self-contained games** — each GameModule carries its own personality/instructions
- **No OpenClaw changes** — uses existing skill system correctly (one skill for awareness)
- **No backend changes per game** — inject_game_context() is generic
- **Simple new-game workflow** — implement GameModule, add to registry, done
