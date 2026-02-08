# Implementation Guide

**Parent:** [README.md](./README.md)

---

## Prerequisites

Before starting implementation, ensure:
- Familiarity with the existing chat flow: `useChat.ts` → `api.ts:streamChat()` → backend `chat.py` → Clawdbot
- Understanding of the tag system: `[mood:x:y]`, `[intent:x]`, `[energy:x]` in `parse_chat.py`
- Understanding of Zustand stores pattern (see `store/index.ts`, `store/chatStore.ts`)

---

## Phase 1: Foundation (Core Infrastructure)

**Goal:** Build the bones -- types, store, hook, backend extension. No UI yet.

### Step 1.1: Define TypeScript Types

**File:** `frontend/src/games/types.ts`

Create all shared types from [GAME-INTERFACE-SPEC.md](./GAME-INTERFACE-SPEC.md):
- `PlayerRole`, `Turn`, `GameStatus`, `MoveResult`, `MoveRecord`
- `GameConfig`, `MoveProviderType`, `GameContext` (includes `promptInstructions`)
- `GameRendererProps<TState, TMove>`
- `GameModule<TState, TMove>` interface (includes `promptInstructions`)
- `GameCategory`

**Acceptance:** Types compile cleanly, no circular dependencies.

### Step 1.2: Create Game Store

**File:** `frontend/src/store/gameStore.ts`

```typescript
import { create } from 'zustand';
import type { GameStatus, MoveRecord, Turn, GameConfig } from '../games/types';

interface GameStoreState {
  // State
  activeGameId: string | null;
  gameState: unknown;
  currentTurn: Turn;
  gameStatus: GameStatus;
  moveHistory: MoveRecord[];
  gameConfig: GameConfig;

  // Actions
  startGame: (gameId: string, config?: GameConfig) => void;
  applyUserMove: (move: unknown) => boolean;
  applyAvatarMove: (move: unknown) => boolean;
  endGame: () => void;
  resetGame: () => void;

  // Internal
  _setGameState: (state: unknown) => void;
  _setTurn: (turn: Turn) => void;
  _setStatus: (status: GameStatus) => void;
  _addMoveRecord: (record: MoveRecord) => void;
}
```

Game store responsibilities:
- Holds the active game state
- Validates and applies moves through the GameModule
- Tracks move history
- Detects game over conditions

**Acceptance:** Store creates/destroys game state, `startGame()` and `endGame()` work.

### Step 1.3: Create Game Registry

**File:** `frontend/src/games/registry.ts`

Simple map from game ID to GameModule. Initially empty (modules added in Phase 2).

```typescript
import type { GameModule } from './types';

const registry = new Map<string, GameModule>();

export function registerGame(module: GameModule): void {
  registry.set(module.id, module);
}

export function getGame(id: string): GameModule | undefined {
  return registry.get(id);
}

export function listGames(): GameModule[] {
  return Array.from(registry.values());
}
```

**Acceptance:** Can register and retrieve modules.

### Step 1.4: Extend Backend Tag Parsing

**File:** `backend/parse_chat.py`

Add `MOVE_PATTERN` and `GAME_PATTERN` regex. Extend `extract_avatar_commands()` to return `move` and `game_action` fields.

Changes:
```python
MOVE_PATTERN = re.compile(r'\[MOVE:([^\]]+)\]', re.IGNORECASE)
GAME_PATTERN = re.compile(r'\[GAME:([^\]]+)\]', re.IGNORECASE)

def extract_avatar_commands(text: str) -> tuple[str, dict[str, Any]]:
    behavior = { ...existing... }

    # Game actions
    move_match = MOVE_PATTERN.search(text)
    if move_match:
        behavior["move"] = move_match.group(1).strip()

    game_match = GAME_PATTERN.search(text)
    if game_match:
        behavior["game_action"] = game_match.group(1).lower().strip()

    # Strip new tags from text
    clean_text = MOVE_PATTERN.sub('', clean_text)
    clean_text = GAME_PATTERN.sub('', clean_text)

    return clean_text, behavior
```

**Test:** Verify `extract_avatar_commands("[mood:happy:0.8] [move:e4] Hello")` returns both move and mood.

### Step 1.5: Extend Backend Chat Request

**File:** `backend/schemas.py`

Add optional `game_context` field to `ChatRequest`:
```python
class ChatRequest(BaseModel):
    message: str
    game_context: dict | None = None
```

**File:** `backend/routers/chat.py`

Create game context injection function. Modify `_stream_chat_sse()` to augment the user message with game context before sending to Clawdbot. This injects both the per-game prompt instructions (Layer 2) and the game state (Layer 3).

```python
def inject_game_context(message: str, game_context: dict | None) -> str:
    if not game_context:
        return message

    game_id = game_context.get("gameId", "unknown")
    prompt_instructions = game_context.get("promptInstructions", "")
    state = game_context.get("state", "")
    last_move = game_context.get("lastUserMove")
    avatar_move = game_context.get("avatarMove")
    valid_moves = game_context.get("validMoves")

    ctx = f"\n\n---\n[game: {game_id}]\n"

    # Layer 2: Game-specific prompt instructions
    if prompt_instructions:
        ctx += f"\n{prompt_instructions}\n"

    # Layer 3: Game state
    ctx += f"\n{state}\n"

    if last_move:
        ctx += f"The user just played: {last_move}\n"
    if avatar_move:
        ctx += f"You played: {avatar_move}\nReact to this game state naturally.\n"
    elif valid_moves:
        moves_str = ", ".join(str(m) for m in valid_moves[:30])
        ctx += f"It's your turn. Legal moves: {moves_str}\n"
        ctx += "Choose a move and include it as [move:your_move] in your response.\n"

    ctx += "---"

    return message + ctx
```

In `_stream_chat_sse()`:
```python
augmented_message = inject_game_context(request.message, request.game_context)
# Use augmented_message instead of request.message when sending to Clawdbot
```

**Acceptance:** Backend compiles, game context with prompt instructions flows to Clawdbot, `[move:x]` tags are parsed from responses.

### Step 1.5b: Create OpenClaw Game Awareness Skill

**File:** `emilia-thai/skills/games/SKILL.md`

Create the Layer 1 workspace skill. This replaces the `## Playing Games` section in SOUL.md. Contains tag format reference, general gaming personality, and a note that game-specific instructions come in message context. See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md).

**File:** `emilia-thai/SOUL.md`

Remove the `## Playing Games` section. The games skill handles this now.

**Acceptance:** Agent loads the games skill at session start. General gaming awareness in system prompt, no game-specific instructions.

### Step 1.6: Extend Frontend API Layer

**File:** `frontend/src/utils/api.ts`

Modify `streamChat()` to accept optional game context:

```typescript
export async function streamChat(
  message: string,
  onChunk: (chunk: string) => void,
  onAvatar: (data: AvatarCommand) => void,
  onDone: (data: StreamResponse) => void,
  onError: (error: Error) => void,
  options?: { signal?: AbortSignal; gameContext?: GameContext }
): Promise<void> {
  // ...
  body: JSON.stringify({
    message,
    game_context: options?.gameContext ?? undefined,
  }),
  // ...
}
```

Also extend the `AvatarCommand` type to include optional `move` and `game_action` fields:

```typescript
// types/index.ts or types.ts
interface AvatarCommand {
  intent?: string;
  mood?: string;
  intensity?: number;
  energy?: string;
  // New:
  move?: string;
  game_action?: string;
}
```

Extend `stripAvatarTags()` and `stripAvatarTagsStreaming()` to also strip `[move:x]` and `[game:x]` tags:

```typescript
const AVATAR_TAG_REGEX = /\[(?:mood|intent|energy|move|game):[^\]]*\]/gi;
```

**Acceptance:** `streamChat()` sends game context, avatar events include move data, move tags stripped from displayed text.

### Step 1.7: Create useGame Hook

**File:** `frontend/src/hooks/useGame.ts`

The bridge between game store, game modules, and useChat:

```typescript
export function useGame() {
  const activeGameId = useGameStore(s => s.activeGameId);
  const gameState = useGameStore(s => s.gameState);
  const currentTurn = useGameStore(s => s.currentTurn);
  const gameStatus = useGameStore(s => s.gameStatus);
  const moveHistory = useGameStore(s => s.moveHistory);

  const [isAvatarThinking, setIsAvatarThinking] = useState(false);

  // Start a new game
  const startGame = useCallback((gameId: string, config?: GameConfig) => {
    useGameStore.getState().startGame(gameId, config);
  }, []);

  // User makes a move
  const makeUserMove = useCallback((move: unknown) => {
    const success = useGameStore.getState().applyUserMove(move);
    if (success) {
      handleAvatarTurn();
    }
    return success;
  }, []);

  // Build game context for chat API (includes Layer 2 promptInstructions)
  const getGameContext = useCallback((): GameContext | null => {
    if (!activeGameId) return null;
    const module = getGame(activeGameId);
    if (!module) return null;

    // Build context based on move provider
    // Includes module.promptInstructions for Layer 2 injection
    // ... (see ARCHITECTURE.md for full flow)
  }, [activeGameId, gameState, currentTurn, moveHistory]);

  // Handle avatar move from LLM response
  const handleAvatarResponse = useCallback((moveTag: string | undefined) => {
    // Parse and apply move, or use fallback
    // ... (see LLM-INTEGRATION.md for error handling)
  }, [activeGameId, gameState]);

  return {
    activeGame: activeGameId,
    gameState,
    currentTurn,
    gameStatus,
    moveHistory,
    isAvatarThinking,
    startGame,
    makeUserMove,
    getGameContext,
    handleAvatarResponse,
  };
}
```

**Acceptance:** Hook composes game store + registry. Can start game, make moves, build context.

### Step 1.8: Wire useGame into useChat

**File:** `frontend/src/hooks/useChat.ts`

Modify `sendMessage()` to include game context and process game responses:

```typescript
// In sendMessage():
const { getGameContext, handleAvatarResponse } = useGame();

// Before streamChat():
const gameContext = getGameContext();

// In streamChat() call:
await streamChat(
  message,
  onChunk,
  (avatarData) => {
    applyAvatarCommand(avatarData);
    // New: handle game move from response
    if (avatarData.move) {
      handleAvatarResponse(avatarData.move);
    }
  },
  onDone,
  onError,
  { signal: abortController.signal, gameContext: gameContext ?? undefined }
);
```

**Acceptance:** Full round-trip: user message with game context → LLM → move parsed → game state updated.

---

## Phase 2: First Game (Tic-Tac-Toe)

**Goal:** Playable tic-tac-toe game. End-to-end proof of concept.

### Step 2.1: Implement TicTacToe Module

**Files:**
- `frontend/src/games/tic-tac-toe/TicTacToeModule.ts`
- `frontend/src/games/tic-tac-toe/TicTacToeBoard.tsx`

Implement the full `GameModule<TicTacToeState, number>` interface as shown in [GAME-INTERFACE-SPEC.md](./GAME-INTERFACE-SPEC.md). Include `promptInstructions` with tic-tac-toe-specific narration/personality.

Register in `games/registry.ts`.

**Test:** Unit test game logic -- createGame, applyMove, getValidMoves, getStatus, serializeState, parseMove, and verify promptInstructions is present and concise.

### Step 2.2: Create GamePanel Component

**File:** `frontend/src/components/GamePanel.tsx`

Floating panel container. Renders the active game's component. See [FRONTEND-DESIGN.md](./FRONTEND-DESIGN.md) for layout and styling.

### Step 2.3: Create GameSelector Component

**File:** `frontend/src/components/GameSelector.tsx`

Modal/popover listing available games. Opens from InputControls.

### Step 2.4: Integrate into InputControls

**File:** `frontend/src/components/InputControls.tsx`

Add game button. When clicked, opens GameSelector. When game is active, shows active indicator.

### Step 2.5: Add GamePanel to App Layout

**File:** `frontend/src/App.tsx` (or the chat route component)

Render `<GamePanel />` alongside existing `<AvatarPanel />` and `<ChatPanel />`.

### Step 2.6: End-to-End Test

Manual test:
1. Open chat with avatar
2. Click game button → select Tic-Tac-Toe
3. Game panel appears with empty board
4. Click a cell → X placed, avatar thinks, places O
5. Continue playing until win/lose/draw
6. Avatar reacts emotionally to outcome
7. "Play Again" or close game

---

## Phase 3: Complex Game (Chess)

**Goal:** Chess with engine-provided moves and LLM narration.

### Step 3.1: Install chess.js

```bash
cd frontend && npm install chess.js
```

### Step 3.2: Implement Chess Module

**Files:**
- `frontend/src/games/chess/ChessModule.ts`
- `frontend/src/games/chess/ChessBoard.tsx`

Key differences from tic-tac-toe:
- `defaultMoveProvider: 'engine'` -- chess.js provides avatar moves
- `engineMove()` implementation with difficulty levels
- `serializeState()` uses FEN notation + move history
- `parseMove()` handles algebraic notation
- Board renderer is more complex (8x8, piece rendering, move highlighting)

### Step 3.3: Difficulty Settings

Add difficulty config to GameConfig:
```typescript
startGame('chess', { difficulty: 0.5 }); // 0=random, 1=best
```

The `engineMove()` function uses difficulty to decide move quality:
- 0.0-0.3: Random legal moves
- 0.3-0.7: Prefer captures and checks
- 0.7-1.0: Simple evaluation (material counting, center control)

For truly strong play (Phase 5), consider integrating Stockfish.js WASM.

### Step 3.4: Test Hybrid Flow

1. User plays e4
2. Engine immediately picks e5
3. Board updates with both moves
4. LLM receives: "User played e4. You played e5. React naturally."
5. LLM narrates the game, avatar reacts
6. User's turn again

---

## Phase 4: Word & Creative Games

**Goal:** Games that are purely conversational, proving the architecture's flexibility.

### Step 4.1: Twenty Questions

- No board UI needed -- just a small status panel showing question count
- LLM picks the secret word, answers questions
- Game state: `{ secret: string, questionsAsked: number, maxQuestions: 20, history: QA[] }`
- `defaultMoveProvider: 'llm'` -- the LLM's response IS the game action

### Step 4.2: Word Association

- Minimal UI: show last word, input for next word
- LLM and user take turns saying related words
- State: `{ chain: string[], currentTurn: PlayerRole }`
- LLM picks related words naturally

### Step 4.3: Trivia

- LLM generates questions on topics
- Multiple choice UI component
- Score tracking
- State: `{ score: { user: number, avatar: number }, currentQuestion: string, round: number }`

---

## Phase 5: Polish & Expansion (Future)

### Game-Specific Avatar Animations
- Victory dance animation
- Thinking pose when deciding moves
- Frustrated gesture when losing
- Add to behavior-mappings.ts under new `game_*` intents

### Game History & Statistics
- Track wins/losses per game type in localStorage
- Show stats in user profile or game selector
- "Your record: 5W 3L 2D against Emilia in Chess"

### Sound Effects
- Move sounds (click, piece placement)
- Victory/defeat jingles
- Clock ticking during avatar's "thinking" time
- Use Web Audio API, same pattern as TTS audio

### Proactive Game Suggestions
- Avatar can suggest playing a game during idle conversation
- "Hey, wanna play some chess? I've been practicing~"
- Triggered by conversation length or detected boredom patterns

### Stockfish Integration (Hard Mode)
- `npm install stockfish.js` (WASM build)
- New `StockfishMoveProvider` wrapping the engine
- Adjustable ELO via search depth
- Only loaded when difficulty > 0.7

---

## Testing Strategy

### Unit Tests (Vitest)

For each GameModule:
```typescript
describe('TicTacToeModule', () => {
  it('creates initial state', () => { ... });
  it('validates legal moves', () => { ... });
  it('rejects illegal moves', () => { ... });
  it('detects win conditions', () => { ... });
  it('detects draw', () => { ... });
  it('serializes state for LLM', () => { ... });
  it('parses [move:x] from text', () => { ... });
  it('parses natural language moves', () => { ... });
  it('handles invalid LLM output gracefully', () => { ... });
});
```

For gameStore:
```typescript
describe('gameStore', () => {
  it('starts and ends games', () => { ... });
  it('applies user moves', () => { ... });
  it('applies avatar moves', () => { ... });
  it('tracks move history', () => { ... });
  it('detects game over', () => { ... });
});
```

### Integration Tests

- Mock Clawdbot responses with `[move:x]` tags
- Verify full flow: user move → context sent → response parsed → state updated
- Test error cases: invalid moves, missing tags, timeout

### Manual E2E Tests

- Play through full games of each type
- Verify avatar reacts appropriately
- Test on mobile viewport
- Test with TTS enabled (avatar speaks game commentary)

---

## Estimated Complexity by Phase

| Phase | New Files | Modified Files | Lines (est.) | Dependencies |
|-------|-----------|---------------|-------------|--------------|
| Phase 1 | 4 | 5 | ~500 | None |
| Phase 2 | 4 | 2 | ~600 | None |
| Phase 3 | 2 | 1 | ~500 | chess.js |
| Phase 4 | 3 | 0 | ~400 | None |
| Phase 5 | varies | varies | varies | Optional: stockfish.js |

Total for playable MVP (Phase 1+2): ~1100 lines across 8 new files and 7 modified files.
