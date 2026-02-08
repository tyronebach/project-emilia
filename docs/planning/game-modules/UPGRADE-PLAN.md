# Game System Upgrade Plan

**Date:** 2026-02-07
**Status:** Complete
**Scope:** Quality/robustness improvements to existing Phase 1-2 code

---

## Context

Phase 1 (Foundation) and Phase 2 (Tic-Tac-Toe) are fully implemented and functional.
This plan covered hardening, test coverage, and UX improvements to the existing codebase
before Phase 3 (Chess) begins.

---

## Tasks

### 1. Backend: Add game tag tests — DONE
- [x] Add tests for `[move:X]` extraction in `test_parse_chat.py` (12 new tests)
- [x] Add tests for `[game:X]` extraction
- [x] Add tests for combined behavior + game tags
- [x] Add tests for `inject_game_context()` in `test_game_context.py` (8 new tests)
- [x] Test promptInstructions injection (Layer 2)
- [x] Test all three modes: LLM turn, engine turn, game over

### 2. Backend: Type the behavior response schema — DONE
- [x] Created `AvatarBehavior` model in `schemas/responses.py` with explicit `move` and `game_action` fields
- [x] Used in `ChatResponse` instead of generic `dict`

### 3. Frontend: Fix registry.ts generic variance — DONE
- [x] Fixed with `as GameModule` type assertion when registering concrete modules
- [x] Pre-existing TypeScript error resolved

### 4. Frontend: sessionStorage persistence for game state — DONE
- [x] Persist active game to sessionStorage on state changes (startGame, applyMove, endGame)
- [x] Restore game state on page refresh via `loadFromSession()` at store creation
- [x] Clear on `resetGame()` (removes sessionStorage key)
- [x] Validates game module still exists when restoring

### 5. Frontend: Game event → avatar emotion fallbacks — DONE
- [x] `GAME_EVENT_BEHAVIORS` map in GamePanel with fallback avatar commands for: game_start, avatar_wins, avatar_loses, draw
- [x] Applied on game start (playful/happy)
- [x] Applied on game end with win/lose/draw-specific emotions
- [x] Follows spec from LLM-INTEGRATION.md "Avatar Emotional Reactions" table

### 6. Docs: Update with completion status — DONE
- [x] This file updated with completion status
- [x] IMPLEMENTATION-GUIDE.md Phase 1-2 completion confirmed

---

## Completion Log

| Task | Status | Files Changed |
|------|--------|---------------|
| 1. Backend game tag tests | **done** | `backend/tests/test_parse_chat.py`, `backend/tests/test_game_context.py` (new) |
| 2. Backend behavior schema | **done** | `backend/schemas/responses.py` |
| 3. Frontend registry fix | **done** | `frontend/src/games/registry.ts` |
| 4. Frontend sessionStorage | **done** | `frontend/src/store/gameStore.ts` |
| 5. Frontend avatar fallbacks | **done** | `frontend/src/components/GamePanel.tsx` |
| 6. Docs update | **done** | This file |

---

## What's Next (for the next dev)

### Phase 3: Chess
1. `npm install chess.js` in frontend
2. Create `frontend/src/games/chess/ChessModule.ts` implementing `GameModule<ChessState, string>`
3. Create `frontend/src/games/chess/ChessBoard.tsx` (8x8 board renderer)
4. Add `promptInstructions` for chess narration personality
5. Register in `games/registry.ts` with `as GameModule` assertion
6. Engine move provider using chess.js evaluation
7. Zero backend changes needed

### Phase 4: Word & Creative Games
- 20 Questions (conversation-only game, `moveProvider: 'llm'`, minimal UI)
- Word Association (turn-based, `moveProvider: 'llm'`)
- Trivia (LLM generates questions, multiple choice UI)

### Phase 5: Polish
- Game-specific avatar animations (victory dance, thinking pose)
- Game history/statistics in localStorage
- Sound effects via Web Audio API
- Proactive game suggestions from avatar
- Stockfish.js WASM for hard-mode chess

### Three-Layer Prompting (already implemented)
- Layer 1: `emilia-thai/skills/games/SKILL.md` (OpenClaw workspace skill, ~80 tokens always)
- Layer 2: `GameModule.promptInstructions` (per-game, per-message, ~100 tokens when active)
- Layer 3: `GameModule.serializeState()` (per-turn state, per-message)
- Adding new games: implement `GameModule`, register it, done. Zero backend/skill changes.
