# Game Modules System - Emilia Project

**Date:** 2026-02-07
**Status:** Implemented in production (Games V2). This document is now primarily historical architecture context.
**Builds on:** [GAME-MODULES-RESEARCH.md](../GAME-MODULES-RESEARCH.md)

---

## Overview

A plugin architecture that enables LLM avatars to play games with users. Games run as frontend modules with a common interface, the LLM participates through structured context injection and action parsing, and the avatar reacts emotionally to game events.

**Core Principle:** The game engine is authoritative. The LLM is a personality layer, not a game logic layer. Games are fun social experiences, not AI benchmarks.

Current runtime/source of truth:
- Frontend module loaders: `frontend/src/games/loaders/manifest.ts`
- Runtime registry contract: `frontend/src/games/registry.ts`
- Backend game catalog + agent config APIs: `backend/routers/games.py`, `backend/routers/admin.py`
- Developer-facing summary: `README.md`, `DOCUMENTATION.md`

Historical note:
- The phased roadmap below documents the original implementation plan and rationale.

## Rollout Flags

- `GAMES_V2_AGENT_ALLOWLIST`: optional comma-separated agent IDs for staged rollout. Empty means all agents are eligible.

## Registering New Games (Current Runtime)

Backend registration and frontend implementation are both required:

1. Implement a frontend game module package under `frontend/src/games/modules/<game-id>/` that exports a valid loader contract.
2. Add the module to `frontend/src/games/loaders/manifest.ts` using the same `gameId`.
3. Register the game in backend catalog (`/manage` Games tab or `POST /api/manage/games`).
4. Enable it for target agents (`/manage` per-agent game config).

Important: `/manage` creates catalog metadata and agent config, but does not generate frontend code. If a catalog game is missing from the loader manifest, `GameSelector` filters it out by design.

---

## Documentation Map

| Document | Description |
|----------|-------------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System architecture, data flow, integration points |
| **[GAME-INTERFACE-SPEC.md](./GAME-INTERFACE-SPEC.md)** | TypeScript interfaces, type definitions, GameModule contract |
| **[LLM-INTEGRATION.md](./LLM-INTEGRATION.md)** | How games communicate with the LLM, prompt design, tag system |
| **[PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md)** | Three-layer prompting architecture for scalable multi-game support |
| **[MESSAGE-HISTORY-REDESIGN.md](./MESSAGE-HISTORY-REDESIGN.md)** | Webapp-managed history to prevent game context token multiplication |
| **[FRONTEND-DESIGN.md](./FRONTEND-DESIGN.md)** | UI/UX design, component layout, game panel rendering |
| **[IMPLEMENTATION-GUIDE.md](./IMPLEMENTATION-GUIDE.md)** | Step-by-step build plan with phases and milestones |
| **[FOUNDATION-PLAN.md](./FOUNDATION-PLAN.md)** | Post-MVP hardening plan for pluggable agent-specific games, robust runtime isolation, manage UI, shared window UX, and lazy-loading |
| **[PHASE-TASKS.md](./PHASE-TASKS.md)** | Execution checklist with file-level tasks, tests, and exit criteria for each implementation phase |

---

## Key Design Decisions

### 1. Frontend-First Architecture
Game engines run entirely in the browser using JS libraries (chess.js, custom tic-tac-toe, etc.). The backend only passes game context to the LLM -- it never runs game logic. This keeps things simple, fast, and avoids new backend dependencies.

### 2. The LLM Doesn't Need to Be Good at Games
The avatar's value is personality, not skill. For simple games (tic-tac-toe, 20 questions), the LLM can directly choose moves. For complex games (chess), a real engine chooses the move and the LLM narrates as if it decided. The user experiences a character playing with them, not an API call.

### 3. Move Provider Pattern
Who picks the avatar's move is a pluggable strategy per game:
- **`llm`** -- LLM chooses from valid moves (good for simple/creative games)
- **`engine`** -- A JS engine picks the move, LLM reacts (good for chess, checkers)
- **`random`** -- Random legal move (testing, casual games)

### 4. Tag System Extension
Extends the existing `[intent:x]`, `[mood:x]`, `[energy:x]` tag system with:
- `[move:x]` -- The avatar's game action
- `[game:action]` -- Meta-actions (resign, offer_draw, new_game)

### 5. Game State Lives in the Frontend
Game state is managed in a Zustand store (`gameStore`), persisted to `sessionStorage` per chat session. The backend never stores game state -- it receives it as context with each chat message and forwards it to the LLM.

### 6. Three-Layer Prompting (Scalable to 10+ Games)
Game knowledge is split into three layers to prevent context overload. See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md) for full details.
- **Layer 1: Game Awareness Skill** -- A single OpenClaw workspace skill (~80 tokens, always loaded) that tells the agent games exist and how to format responses. Lives in `emilia-thai/skills/games/SKILL.md`.
- **Layer 2: Per-Game Prompt Instructions** -- Game-specific narration/personality/strategy stored in each `GameModule.promptInstructions`. Injected into message context only when that game is active. Zero cost when not playing.
- **Layer 3: Game State Context** -- Board state, valid moves, turn info. Already implemented via `serializeState()`.

Adding a new game requires zero changes to SOUL.md, no new OpenClaw skills, and no backend changes. The GameModule carries everything.

---

## Step-by-Step Research & Implementation Guide

This is the roadmap from research to production, broken into phases.

### Phase 0: Research & Design (This Document Suite)
- [x] Analyze existing codebase architecture
- [x] Review Voyager and LLM Chess Arena references
- [x] Design GameModule interface with generics
- [x] Design Move Provider pattern (llm/engine/hybrid)
- [x] Design LLM context injection flow
- [x] Design frontend UI layout
- [x] Design tag parsing extensions
- [x] Document integration points with existing code
- [x] Write architecture docs
- [x] Write implementation guide

### Phase 1: Foundation (Core Infrastructure)
1. **Define TypeScript interfaces** -- `GameModule`, `GameState`, `MoveProvider`, `GameConfig`
2. **Create `gameStore.ts`** -- Zustand store for active game, state, turn tracking
3. **Create `useGame.ts` hook** -- Game lifecycle (start, move, end), integrates with chat
4. **Extend `parse_chat.py`** -- Add `[move:x]` and `[game:x]` tag extraction
5. **Extend `api.ts` / `streamChat()`** -- Send game context with messages, receive game events
6. **Extend backend `chat.py`** -- Forward game context to Clawdbot prompt
7. **Create game registry** -- Simple map of game ID to module

### Phase 2: First Game (Tic-Tac-Toe)
1. **Implement TicTacToe module** -- Game logic, state, valid moves, promptInstructions
2. **Create TicTacToe renderer** -- React component (3x3 grid)
3. **Create `GamePanel.tsx`** -- Floating panel alongside avatar/chat
4. **Create `GameSelector.tsx`** -- Game picker UI
5. **Wire LLM context** -- Serialize board state + prompt instructions, parse `[move:x]` responses
6. **Test end-to-end** -- User plays X, avatar plays O, avatar reacts emotionally

### Phase 3: Complex Game (Chess)
1. **Integrate chess.js** -- npm install, create ChessModule
2. **Create chess renderer** -- Chessboard component (lightweight, no chessboard.js dependency)
3. **Implement engine MoveProvider** -- chess.js random/best move selection
4. **Test hybrid flow** -- Engine picks move, LLM narrates
5. **Add difficulty levels** -- Easy (random), Medium (shallow search), Hard (deeper search)

### Phase 4: Word & Creative Games
1. **20 Questions module** -- Pure conversation, minimal UI, LLM-native
2. **Word Association module** -- Turn-based word game
3. **Hangman module** -- Classic word guessing with visual feedback
4. **Trivia module** -- LLM generates questions, tracks score

### Phase 5: Polish & Expansion
1. **Avatar game reactions** -- Specific animations for winning, losing, good moves
2. **Game history** -- Track wins/losses per game type
3. **Sound effects** -- Move sounds, victory/defeat jingles
4. **Game suggestions** -- Avatar can suggest playing a game during conversation
5. **Spectator mode** -- AI vs AI games the user watches

---

## Quick Reference: How It All Fits Together

```
User clicks "Play Chess" in GameSelector
    |
    v
gameStore.startGame('chess')
    |-- Creates game state via ChessModule.createGame()
    |-- Sets activeGame, currentState, currentTurn
    |-- GamePanel renders chess board
    |
User makes move (clicks piece on board)
    |
    v
gameStore.applyUserMove(move)
    |-- ChessModule.applyMove() validates & updates state
    |-- It's now avatar's turn
    |
    v
useGame detects avatar's turn
    |-- MoveProvider decides move:
    |   - engine: chess.js picks best move
    |   - llm: will parse from LLM response
    |
    v
useChat.sendMessage() with game context
    |-- Message body includes:
    |   { message: "I moved my pawn to e4",
    |     gameContext: { type: "chess", state: "FEN...", lastMove: "e4",
    |                    avatarMove: "e5", validMoves: [...] } }
    |
    v
Backend injects game context into Clawdbot prompt
    |-- "You're playing chess as Black. User played e4.
    |    You played e5. React to the game naturally."
    |
    v
LLM responds: "[intent:playful] [mood:confident] [energy:medium] [move:e5]
               The King's Pawn! Classic choice~"
    |
    v
Frontend receives response
    |-- parse_chat.py extracts [move:e5], behavior tags
    |-- gameStore applies move (if not already applied by engine)
    |-- Avatar reacts with confident/playful animation
    |-- Chat shows "The King's Pawn! Classic choice~"
    |-- TTS speaks the response, avatar lip-syncs
```

---

## File Structure (Planned)

```
frontend/src/
├── games/
│   ├── types.ts              # GameModule interface (incl. promptInstructions), shared types
│   ├── registry.ts           # Game module registry
│   ├── tic-tac-toe/
│   │   ├── TicTacToeModule.ts    # Game logic + LLM bridge + prompt instructions
│   │   └── TicTacToeBoard.tsx    # React renderer
│   ├── chess/
│   │   ├── ChessModule.ts        # chess.js wrapper + LLM bridge + prompt instructions
│   │   └── ChessBoard.tsx        # Board renderer
│   └── twenty-questions/
│       └── TwentyQuestionsModule.ts  # Conversation-only game + prompt instructions
├── store/
│   └── gameStore.ts          # Game state management
├── hooks/
│   └── useGame.ts            # Game lifecycle hook
├── components/
│   ├── GamePanel.tsx          # Floating game container
│   └── GameSelector.tsx       # Game picker modal
```

```
backend/
├── parse_chat.py             # Extended with [move:x] parsing
├── routers/
│   └── chat.py               # Extended with game context + prompt instructions forwarding
```

```
clawd-agents/emilia-thai/
├── skills/
│   └── games/
│       └── SKILL.md          # OpenClaw game awareness skill (Layer 1)
├── SOUL.md                   # No game-specific content (handled by skill)
```
