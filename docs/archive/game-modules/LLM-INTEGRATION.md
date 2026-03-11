# LLM Integration Design

**Parent:** [README.md](./README.md)

---

## Overview

The LLM (Claude via Clawdbot) participates in games through three layers of context (see [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md)):

1. **Game awareness** -- An OpenClaw workspace skill that tells the agent games exist and how to format responses (~80 tokens, always loaded)
2. **Per-game instructions** -- Game-specific narration/personality injected per-message from `GameModule.promptInstructions` (only when that game is active)
3. **Game state context** -- Board state, valid moves, turn info injected per-message from `GameModule.serializeState()` (only when a game is active)

Plus **response parsing** -- Game actions are extracted from the LLM's response using structured tags.

The LLM never maintains game state. It receives state, reacts, and optionally provides a move. The game engine is always authoritative.

---

## The Three Modes of LLM Participation

### Mode 1: LLM Decides the Move (`moveProvider: 'llm'`)

Best for: simple games where the LLM can reason about valid options (tic-tac-toe, 20 questions, word games).

```
Flow:
1. User makes move → state updates
2. Context sent to LLM:
   "Board: X|O|_ / _|X|_ / _|_|O. Your turn (O). Valid positions: 1, 4, 7, 8, 9"
3. LLM responds: "[intent:playful] [mood:thinking] [energy:medium] [move:7] Hmm, I'll block your diagonal!"
4. Frontend parses [move:7], validates, applies to state
```

**Prompt template:**
```
[game: tic-tac-toe]
{serialized state}
It's your turn. Legal moves: {valid moves list}
Choose a move and include it as [move:your_move] in your response.
```

**Pros:** Most natural -- the avatar genuinely "decides"
**Cons:** LLM may choose illegal moves, slower (must wait for LLM response)

### Mode 2: Engine Decides, LLM Narrates (`moveProvider: 'engine'`)

Best for: complex strategy games where LLM would make bad/random moves (chess, checkers, Go).

```
Flow:
1. User makes move → state updates
2. Engine picks avatar's move immediately (e.g., chess.js)
3. Move applied to state
4. Context sent to LLM:
   "You played e5 in response to their e4. React to this game state."
5. LLM responds: "[intent:playful] [mood:confident] [energy:high] The Sicilian Defense! Let's see what you do next~"
```

**Prompt template:**
```
[game: chess]
{serialized state}
The user just played: {user move}
You played: {engine move}
React to this game state naturally. Express your personality.
```

**Pros:** Avatar plays well, instant move, no parsing needed
**Cons:** Less "authentic" -- avatar is narrating, not deciding

### Mode 3: No Move Needed (Conversation Games)

Best for: games that are purely conversational (20 questions, trivia, word association).

```
Flow:
1. User says something ("Is it an animal?")
2. Context sent to LLM:
   "Playing 20 Questions. You're thinking of: 'piano'. Question 7 of 20."
3. LLM responds naturally: "Nope! Not an animal. 13 questions left~"
4. No [move:x] parsing needed -- the response IS the game action
```

**Prompt template:**
```
[game: twenty-questions]
{game state: secret word, question count, previous Q&As}
The user's message is their next guess/question. Respond in character.
```

---

## Prompt Engineering

### Game Context Block Format

Game context is appended to the user message as a clearly delimited block. It includes both the per-game prompt instructions (Layer 2) and the game state (Layer 3):

```
{user's actual message}

---
[game: {game_id}]

{GameModule.promptInstructions — Layer 2}

{serialized state from GameModule.serializeState() — Layer 3}

{turn instruction - varies by mode}
---
```

### Game Awareness Skill (Layer 1 — replaces SOUL.md section)

The generic game behavior is now an OpenClaw workspace skill at `emilia-thai/skills/games/SKILL.md`. It loads into the system prompt at session start (~80 tokens) and contains:
- Tag format reference (`[move:X]`, `[game:action]`)
- General personality guidelines for gaming
- A note that game-specific instructions will be in message context

This replaces the previous `## Playing Games` section in SOUL.md. See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md) for the full rationale.

### Per-Game Prompt Instructions (Layer 2 — new)

Each `GameModule` carries a `promptInstructions` string — a concise markdown block (~80-150 tokens) describing how the agent should narrate, think, and behave during that specific game. It's injected into the message context only when that game is active.

### Context Examples by Game

#### Tic-Tac-Toe (LLM decides)

```
User: "Your turn!"

---
[game: tic-tac-toe]

## Tic-Tac-Toe — How You Play
- Think out loud about your strategy: "If I go here, you might..."
- When blocking: notice the threat and comment on it
- When setting up a fork: be sneaky about it
- When winning: build up excitement before revealing your move
- Keep it light — it's a quick, casual game
- Positions are numbered 1-9 (top-left to bottom-right)
- Include your move as [move:N] where N is the position number

Tic-Tac-Toe
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

Expected LLM response:
```
[intent:playful] [mood:thinking] [energy:medium] [move:7] Oh no, you're going for the diagonal! Let me block that... There! Bottom-left. Your move~
```

#### Chess (Engine decided)

```
User: "I'll open with the classic e4"

---
[game: chess]

## Chess — How You Play
Your move has already been decided. Narrate as if YOU chose it.
- Never mention an engine, algorithm, or calculation
- Comment on strategy: openings, tactics, positional ideas
- Reference real chess concepts when relevant (pins, forks, development, tempo)
- React to captures and checks with appropriate emotion
- If losing: show determination and look for counterplay
- If winning: stay humble but confident
- Describe your move naturally: "I'll develop my knight to f3"

Chess - You are Black
Position (FEN): rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1
It is Black's turn.
Moves so far: 1. e4

The user just played: e4
You played: e5
React to this game state naturally. Express your personality.
---
```

Expected LLM response:
```
[intent:playful] [mood:confident] [energy:medium] [move:e5] The King's Pawn opening! A classic~ I'll mirror you with e5. Let's see if you go for the Italian or the Ruy Lopez next!
```

Note: The `[move:e5]` tag is informational here since the engine already applied the move. It's included so the response format is consistent and the move shows up in chat parsing.

#### 20 Questions (Conversation only)

```
User: "Is it alive?"

---
[game: twenty-questions]

## 20 Questions — How You Play
You picked a secret word. The user asks yes/no questions.
- Answer honestly: yes, no, or sometimes
- Give playful hints when they're getting warm
- Track the count: "That's question 7 of 20..."
- If they're way off: be encouraging but don't give it away
- Build suspense as they narrow it down
- When they guess right: act impressed or surprised

20 Questions - You are thinking of: "piano"
Question 3 of 20.
Previous:
  Q1: "Is it bigger than a breadbox?" → Yes
  Q2: "Is it found outdoors?" → Sometimes

Answer the user's question honestly (yes/no/sometimes).
---
```

Expected LLM response:
```
[intent:playful] [mood:thinking] [energy:medium] Hmm, is a piano alive? No! It's not alive. But it can sure make sounds that feel alive~ 17 questions left!
```

---

## Tag System

### Existing Tags (Unchanged)

| Tag | Purpose | Example |
|-----|---------|---------|
| `[mood:x:y]` | Avatar facial expression + intensity | `[mood:happy:0.8]` |
| `[intent:x]` | Avatar behavioral intent | `[intent:greeting]` |
| `[energy:x]` | Avatar energy level | `[energy:high]` |

### New Tags

| Tag | Purpose | Example |
|-----|---------|---------|
| `[move:x]` | Game move action | `[move:e4]`, `[move:7]` |
| `[game:x]` | Game meta-action | `[game:resign]`, `[game:new_game]` |

### Tag Parsing (Backend)

Extended regex patterns in `parse_chat.py`:

```python
MOVE_PATTERN = re.compile(r'\[MOVE:([^\]]+)\]', re.IGNORECASE)
GAME_PATTERN = re.compile(r'\[GAME:([^\]]+)\]', re.IGNORECASE)
```

All tags are stripped from the displayed text and returned as structured data in the SSE response.

### SSE Response Extension

The existing `avatar` event is extended with optional game fields:

```json
{
  "intent": "playful",
  "mood": "confident",
  "intensity": 0.7,
  "energy": "medium",
  "move": "e5",
  "game_action": null
}
```

Frontend `streamChat()` already handles the `avatar` event -- it just needs to forward the new fields to the game system.

---

## Avatar Emotional Reactions to Game Events

The game system can trigger specific avatar behaviors based on game events, independent of the LLM's mood tags:

| Game Event | Suggested Intent | Suggested Mood |
|------------|-----------------|----------------|
| User makes a good move | `surprised` | `impressed:0.7` |
| Avatar captures a piece | `pleased` | `happy:0.6` |
| Avatar is losing | `thinking` | `worried:0.5` |
| Avatar wins | `excited` | `happy:0.9` |
| Avatar loses | `embarrassed` | `sad:0.4` |
| Draw | `agreement` | `neutral:0.5` |
| Game starts | `excited` | `happy:0.7` |
| Close game | `thinking` | `nervous:0.6` |

These are fallback behaviors in case the LLM doesn't include mood tags. The LLM's explicit tags always take priority.

Implementation in `useGame`:

```typescript
function getGameEventBehavior(event: GameEvent): AvatarCommand | null {
  const map: Record<string, AvatarCommand> = {
    'avatar_wins': { intent: 'excited', mood: 'happy', energy: 'high' },
    'avatar_loses': { intent: 'embarrassed', mood: 'sad', energy: 'low' },
    'game_start': { intent: 'excited', mood: 'happy', energy: 'medium' },
    'close_game': { intent: 'thinking', mood: 'nervous', energy: 'medium' },
  };
  return map[event] ?? null;
}
```

---

## Token Budget Considerations

### System prompt (Layer 1 — constant)

| Component | Tokens | When |
|-----------|--------|------|
| Game awareness skill | ~80 | Always (session-level) |

### Per-message (Layer 2 + 3 — only when game active)

| Game | Prompt Instructions (L2) | State (L3) | Total per message |
|------|--------------------------|------------|-------------------|
| Tic-Tac-Toe | ~80 tokens | ~120 tokens | ~200 tokens |
| Chess (opening) | ~100 tokens | ~200 tokens | ~300 tokens |
| Chess (midgame) | ~100 tokens | ~260 tokens | ~360 tokens |
| 20 Questions | ~80 tokens | ~100-300 tokens | ~180-380 tokens |
| Word Association | ~60 tokens | ~50 tokens | ~110 tokens |
| Just chatting | 0 | 0 | 0 |

**Key insight:** Adding game #11 costs zero additional tokens in the system prompt and zero per-message overhead when that game isn't active.

**Mitigation strategies:**
- Limit valid moves list to 30 entries max (chess can have 80+ legal moves)
- Truncate move history beyond last 5 moves
- Use compact notations (FEN, not ASCII board art for chess)
- Per-game prompt instructions should be concise (~80-150 tokens max)
- Only the ACTIVE game's instructions are included — never all games at once

---

## Handling LLM Failures

### LLM Returns Invalid Move

```typescript
// In useGame hook
function handleLLMMove(text: string): void {
  const module = getActiveModule();
  const validMoves = module.getValidMoves(gameState, 'avatar');
  const parsed = module.parseMove(text, validMoves);

  if (parsed !== null) {
    // Valid move -- apply it
    applyAvatarMove(parsed);
  } else {
    // Fallback: use engine or random
    console.warn('LLM returned invalid/no move, using fallback');
    const fallback = module.engineMove
      ? module.engineMove(gameState, 0.5)
      : validMoves[Math.floor(Math.random() * validMoves.length)];
    applyAvatarMove(fallback);
  }
}
```

### LLM Doesn't Include Move Tag

Same fallback as above. The system gracefully degrades -- the game continues regardless.

### LLM Tries to Cheat

The LLM might claim a move that's illegal or claim it won when it didn't. The game engine is authoritative:
- Move validation happens in `GameModule.applyMove()`, not from LLM output
- Win/loss detection happens in `GameModule.getStatus()`, not from LLM claims
- The LLM's narrative is displayed, but the game state only changes through validated moves

---

## Clawdbot / OpenClaw Integration

Since we access the LLM through Clawdbot's `/v1/chat/completions` endpoint with agent-specific system prompts, game context uses a hybrid approach:

```
System Prompt (loaded at session start):
  - SOUL.md: Avatar personality (no game-specific content)
  - skills/games/SKILL.md: Game awareness, tag formats, general gaming personality
                           (~80 tokens, loaded by OpenClaw skill system)

User Message (augmented per-message, only when game active):
  - User's actual text
  - GameModule.promptInstructions: Game-specific narration/personality
  - GameModule.serializeState(): Board state, valid moves, turn info
```

### How OpenClaw skills fit in

OpenClaw loads workspace skills from `emilia-thai/skills/` at session start. The `games/SKILL.md` skill is intentionally minimal — it only teaches the agent:
1. That games exist and she can play them
2. The `[move:X]` and `[game:X]` tag format
3. General gaming personality (be playful, be a good sport)
4. That game-specific instructions will arrive in message context

**Why one skill, not one-per-game:** OpenClaw loads ALL eligible skills at session start. Ten game skills = ten skills always in context. The single `games` skill keeps the constant overhead minimal. Per-game specifics travel in the message context and cost zero when not playing.

### What this means

- One OpenClaw skill created: `emilia-thai/skills/games/SKILL.md`
- SOUL.md `## Playing Games` section removed (replaced by skill)
- No Clawdbot configuration changes needed
- No new agent types needed
- Adding new games requires zero OpenClaw/skill changes
- Works with any OpenClaw agent that has the games skill installed
