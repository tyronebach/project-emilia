# Game Designer Guide

How to build games for the Emilia avatar webapp.

## Overview

Games work through **dynamic context injection** — the frontend sends game state with each chat message, and it gets injected into the LLM prompt. No static "game skill" files needed.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Frontend     │ ──▶  │     Backend     │ ──▶  │       LLM       │
│  (game state)   │      │ (injects into   │      │  (sees context) │
│                 │      │  user message)  │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## What You Control

### 1. Designer-Defined: `prompt_instructions`

Static text stored in the game registry. Describes rules, personality, how to play.

```
You're playing Tic-Tac-Toe. You are O, the user is X.
Be playful and competitive. Celebrate good moves, tease bad ones.
Always think strategically — try to win but make it fun.
```

Set via the admin API or database:
```sql
UPDATE game_registry 
SET prompt_instructions = '...' 
WHERE game_id = 'tictactoe';
```

### 2. Frontend-Provided: `GameContextRequest`

Sent with each chat message. You build this in your game runtime.

```typescript
interface GameContext {
  gameId: string;           // Your game identifier
  state: string;            // Board state, move history, anything (max 20KB)
  lastUserMove?: string;    // What the user just played
  avatarMove?: string;      // What the agent just played (for reactions)
  validMoves?: string[];    // Legal moves (max 100)
  moveCount?: number;       // Total moves so far
  status: 'in_progress' | 'game_over';
  turn?: 'user' | 'avatar';
  mode?: 'interactive' | 'narrative' | 'spectator';
}
```

## How It Gets Injected

The backend appends game context to the user's message:

```
User types: "e4"

LLM sees:
───────────────────────────────────
e4

---
[game: chess]

<your prompt_instructions>

<your state text>

The user just played: e4
It's your turn. Legal moves: e5, d5, Nf6, Nc6...
Choose a move and include it as [move:your_move] in your response.
---
───────────────────────────────────
```

## The `state` Field

This is your canvas. Build whatever context the LLM needs:

### Simple (just the board):
```
  1 2 3
A X . .
B . O .
C . . X
```

### Rich (board + history):
```
Current Board:
  a b c d e f g h
8 r n b q k b n r
7 p p p p . p p p
6 . . . . . . . .
5 . . . . p . . .
4 . . . . P . . .
3 . . . . . . . .
2 P P P P . P P P
1 R N B Q K B N R

Move History (last 5):
1. e4 e5
2. Nf3 Nc6
3. Bb5

Position: Ruy Lopez, Berlin Defense
Material: Equal
```

### Narrative (for story games):
```
Scene: The dark forest clearing
Your health: 80/100
Inventory: Sword, Torch, Health Potion
Recent events:
- You defeated the goblin scout
- You heard howling in the distance
- The path splits: left (river) or right (cave)
```

## Agent Response Format

The agent will respond with behavior tags + optional move:

```
[intent:thinking] [mood:calm] [energy:medium] Interesting... you're going for the Italian Game. Let me counter with the Berlin Defense. [move:Nc6]
```

Your frontend should:
1. Parse `[move:X]` to get the agent's move
2. Validate it's legal
3. Update game state
4. Send next turn

## Best Practices

### 1. Keep `state` Focused
Don't dump everything. Include what the LLM needs to make a good move:
- Current position
- Recent moves (last 3-5, not all 50)
- Key strategic context

### 2. Use `validMoves` for Constraints
The injection tells the agent "Legal moves: X, Y, Z". This reduces invalid moves.

### 3. Handle Game Over
When `status: 'game_over'`, the injection changes to:
```
The game is over. React to the outcome.
```
The agent will congratulate/commiserate instead of trying to move.

### 4. Use `avatarMove` for Reactions
When the agent just moved and you want a reaction:
```typescript
{
  gameId: 'chess',
  state: '...',
  avatarMove: 'Qxf7#',  // Agent's move
  status: 'game_over'
}
```
Injection becomes:
```
You played: Qxf7#
React to this game state naturally.
```

### 5. Conversation History is Clean
Previous messages are stored WITHOUT game context. Only the current message gets injection. So the LLM sees:
```
History: ["e4", "Good move!", "Nf3", "Defending the center..."]
Current: "Bb5" + full game context
```

## Example: Tic-Tac-Toe

### prompt_instructions (designer):
```
You're playing Tic-Tac-Toe as O against the user (X).
Be playful and competitive. Use the coordinate format like "A1" or "B2".
```

### Frontend sends:
```typescript
{
  gameId: 'tictactoe',
  state: `
  1 2 3
A X . .
B . O .
C . . .

You are O. User is X.`,
  lastUserMove: 'A1',
  validMoves: ['A2', 'A3', 'B1', 'B3', 'C1', 'C2', 'C3'],
  moveCount: 2,
  status: 'in_progress',
  turn: 'avatar'
}
```

### LLM sees:
```
(User's message, e.g., "your turn")

---
[game: tictactoe]

You're playing Tic-Tac-Toe as O against the user (X).
Be playful and competitive. Use the coordinate format like "A1" or "B2".

  1 2 3
A X . .
B . O .
C . . .

You are O. User is X.

The user just played: A1
It's your turn. Legal moves: A2, A3, B1, B3, C1, C2, C3
Choose a move and include it as [move:your_move] in your response.
---
```

### Agent responds:
```
[intent:playful] [mood:happy] [energy:high] Oh, taking the corner? Classic opener! Let me grab the center... [move:B2]
```

## API Reference

### Chat endpoint with game context:
```typescript
POST /api/chat
{
  "message": "your turn",
  "game_context": {
    "gameId": "chess",
    "state": "...",
    "lastUserMove": "e4",
    "validMoves": ["e5", "d5", "Nf6"],
    "status": "in_progress"
  }
}
```

### Game registry (admin):
```typescript
// Create game
POST /api/manage/games
{
  "game_id": "chess",
  "display_name": "Chess",
  "prompt_instructions": "You're playing chess..."
}

// Update instructions
PUT /api/manage/games/chess
{
  "prompt_instructions": "Updated rules..."
}
```

## Troubleshooting

**Agent makes invalid moves:**
- Check `validMoves` is populated correctly
- Add explicit format examples in `prompt_instructions`
- Consider smaller move list if >30 options

**Agent ignores game state:**
- Make sure `state` is clear and well-formatted
- Use visual representations (ASCII boards) when possible
- Keep recent context, trim old history

**Agent doesn't use [move:X] format:**
- The injection includes the format instruction automatically
- If still failing, reinforce in `prompt_instructions`
- Check you're not in `avatarMove` reaction mode

**Context too long:**
- `state` max is 20KB — trim move history
- Show last 5-10 moves, not full game
- Summarize instead of listing everything
