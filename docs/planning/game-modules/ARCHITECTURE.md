# Game Modules Architecture

**Parent:** [README.md](./README.md)

---

## System Overview

The game system is a frontend-first addon layer that plugs into the existing Emilia chat architecture. It introduces no new backend services -- only extends the existing chat flow with game context.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Browser)                        │
│                                                                  │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │  Avatar   │  │  Game Panel   │  │     Chat Panel            │ │
│  │  (VRM)    │  │  ┌─────────┐  │  │                           │ │
│  │           │  │  │ Board / │  │  │  User messages            │ │
│  │  reacts   │  │  │ Canvas  │  │  │  Avatar responses         │ │
│  │  to game  │  │  └─────────┘  │  │  + game commentary        │ │
│  │  events   │  │  Score/Status │  │                           │ │
│  └──────────┘  └───────────────┘  └───────────────────────────┘ │
│                         │                        │               │
│  ┌──────────────────────┴────────────────────────┘              │
│  │                                                               │
│  │  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  │  gameStore   │   │  useGame     │   │  GameModule      │  │
│  │  │  (Zustand)   │◄──│  (hook)      │──►│  (interface)     │  │
│  │  │              │   │              │   │                  │  │
│  │  │  activeGame  │   │  lifecycle   │   │  createGame()    │  │
│  │  │  state       │   │  turn mgmt  │   │  applyMove()     │  │
│  │  │  turn        │   │  LLM bridge │   │  getValidMoves() │  │
│  │  └──────────────┘   └──────────────┘   │  serializeState()│  │
│  │                           │             └──────────────────┘  │
│  │                           │                     │             │
│  │                    ┌──────┴───────┐      ┌──────┴──────┐     │
│  │                    │   useChat    │      │ MoveProvider │     │
│  │                    │  (existing)  │      │ llm/engine/  │     │
│  │                    │  + game ctx  │      │ random       │     │
│  │                    └──────┬───────┘      └─────────────┘     │
│  │                           │                                   │
│  └───────────────────────────┘                                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ POST /api/chat
                               │ { message, gameContext }
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                            │
│                                                                  │
│  chat.py                                                        │
│  ├── Receives gameContext in request body                        │
│  ├── Builds game prompt injection                                │
│  ├── Appends to user message before sending to Clawdbot         │
│  └── Extracts [move:x] from response (alongside existing tags)  │
│                                                                  │
│  parse_chat.py                                                  │
│  ├── Existing: [mood:x:y], [intent:x], [energy:x]              │
│  └── New: [move:x], [game:x]                                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Clawdbot (LLM Gateway)                        │
│                                                                  │
│  System prompt includes (Layer 1):                               │
│  - SOUL.md (personality, no game-specific content)               │
│  - skills/games/SKILL.md (tag format, gaming personality ~80tok) │
│                                                                  │
│  Receives message with game context appended (Layer 2+3):       │
│  "User says: I moved my pawn to e4                              │
│                                                                  │
│   ---                                                            │
│   [game: chess]                                                  │
│                                                                  │
│   ## Chess — How You Play (Layer 2: promptInstructions)          │
│   Your move has already been decided. Narrate as if YOU chose it.│
│   - Never mention an engine, algorithm, or calculation           │
│   ...                                                            │
│                                                                  │
│   Chess - You are Black (Layer 3: serializeState)                │
│   Position (FEN): rnbqkbnr/pppp...                               │
│   User just played: e4                                          │
│   You played: e5                                                │
│   React to this game state naturally.                            │
│   ---"                                                           │
│                                                                  │
│  LLM responds with dialogue + tags:                             │
│  "[intent:playful] [mood:confident] [move:e5] Ah, the King's Pawn!" │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. GameModule (Interface)

The central abstraction. Every game implements this interface. It defines:
- **Identity**: id, name, description
- **Lifecycle**: createGame, game over detection
- **State**: apply moves, get valid moves, check status
- **LLM Bridge**: serialize state for prompts, parse moves from text
- **Rendering**: React component for the game UI
- **Move Provider**: default strategy for avatar's moves

Full spec in [GAME-INTERFACE-SPEC.md](./GAME-INTERFACE-SPEC.md).

### 2. Game Registry

A simple TypeScript map that registers available games:

```typescript
// games/registry.ts
import { ticTacToeModule } from './tic-tac-toe/TicTacToeModule';
import { chessModule } from './chess/ChessModule';

export const gameRegistry = new Map<string, GameModule>([
  ['tic-tac-toe', ticTacToeModule],
  ['chess', chessModule],
]);

export function getGame(id: string): GameModule | undefined {
  return gameRegistry.get(id);
}

export function listGames(): GameModule[] {
  return Array.from(gameRegistry.values());
}
```

No dynamic loading, no webpack magic. Just imports. New games are added by implementing the interface and adding a line to the registry.

### 3. Game Store (Zustand)

New store managing active game state:

```typescript
// store/gameStore.ts
interface GameStoreState {
  // Active game
  activeGameId: string | null;
  gameState: unknown;
  currentTurn: 'user' | 'avatar';
  gameStatus: GameStatus;
  moveHistory: MoveRecord[];

  // Actions
  startGame: (gameId: string, config?: GameConfig) => void;
  applyUserMove: (move: unknown) => MoveResult;
  applyAvatarMove: (move: unknown) => MoveResult;
  endGame: () => void;
  resetGame: () => void;
}
```

State is stored in memory per session. When the user navigates away or starts a new session, the game ends. Optionally persisted to `sessionStorage` for page refresh survival.

### 4. useGame Hook

The bridge between the game system and the chat system:

```typescript
function useGame() {
  // From gameStore
  const activeGame = useGameStore(s => s.activeGameId);
  const gameState = useGameStore(s => s.gameState);
  const currentTurn = useGameStore(s => s.currentTurn);

  // Methods
  const startGame = (gameId: string) => { ... };
  const makeUserMove = (move: unknown) => { ... };
  const getGameContext = () => { ... };  // For injecting into chat

  return { activeGame, gameState, currentTurn, startGame, makeUserMove, getGameContext };
}
```

### 5. Move Provider

Strategy pattern for deciding the avatar's moves:

```
MoveProvider
├── LLMMoveProvider
│   └── Waits for LLM response, parses [move:x], validates
├── EngineMoveProvider
│   └── Uses game engine (chess.js AI, minimax, etc.)
└── RandomMoveProvider
    └── Picks random legal move (testing/casual)
```

The provider is selected per-game via `GameModule.defaultMoveProvider` and can be overridden per-session (e.g., difficulty settings).

---

## Data Flow: Complete Turn Cycle

### User's Turn

```
1. User interacts with GamePanel (clicks board square, drags piece, etc.)
       │
2. GamePanel calls gameStore.applyUserMove(move)
       │
3. gameStore:
   a. Gets GameModule from registry
   b. Calls module.applyMove(state, move, 'user')
   c. Validates move is legal
   d. Updates gameState with new state
   e. Checks module.getStatus() for game over
   f. If game continues, sets currentTurn = 'avatar'
   g. Pushes to moveHistory
       │
4. GamePanel re-renders with updated state
```

### Avatar's Turn

```
1. useGame detects currentTurn === 'avatar'
       │
2. MoveProvider determines avatar's move:
   ├── engine: calls engine immediately, gets move
   ├── random: picks random from getValidMoves()
   └── llm: move will come from LLM response
       │
3. If engine/random: move is applied to gameState immediately
   If llm: move is pending until LLM responds
       │
4. useChat.sendMessage() fires with game context:
   {
     message: "[user's chat text or auto-generated move description]",
     gameContext: {
       gameId: "chess",
       state: module.serializeState(state, 'avatar'),
       lastUserMove: "e4",
       avatarMove: "e5",          // null if llm provider
       validMoves: ["e5","d5"...], // only if llm provider
       status: "in_progress",
       moveCount: 3
     }
   }
       │
5. Backend receives request:
   a. Extracts gameContext from body
   b. Builds game prompt injection (appended to user message)
   c. Sends augmented message to Clawdbot
       │
6. LLM responds: "[intent:playful] [mood:thinking] [energy:medium] [move:e5] Nice opening!"
       │
7. Backend processes response:
   a. parse_chat.py extracts [move:e5] + behavior tags
   b. Returns move data in SSE stream alongside content
       │
8. Frontend receives response:
   a. Chat displays dialogue text
   b. Avatar applies behavior (mood/intent/energy)
   c. If llm provider: validate and apply [move:e5] to gameState
   d. If engine provider: [move:e5] is informational (already applied)
   e. currentTurn = 'user'
```

---

## Integration Points with Existing Code

### Modified Files

| File | Change | Impact |
|------|--------|--------|
| `frontend/src/games/types.ts` | Add `promptInstructions` to `GameModule` and `GameContext` interfaces | Low - new required field |
| `frontend/src/utils/api.ts` | `streamChat()` accepts optional `gameContext` param, sends in request body | Low - additive parameter |
| `frontend/src/hooks/useChat.ts` | Calls `useGame.getGameContext()` before sending, processes game events from response | Medium - hook composition |
| `frontend/src/hooks/useGame.ts` | `getGameContext()` includes `promptInstructions` from active GameModule | Low - one extra field |
| `backend/parse_chat.py` | Add `MOVE_PATTERN` and `GAME_PATTERN` regex for `[move:x]` / `[game:x]` extraction | Low - additive patterns |
| `backend/routers/chat.py` | Read `gameContext` from request body, inject prompt instructions + state into Clawdbot prompt | Medium - prompt augmentation |
| `backend/schemas.py` | Extend `ChatRequest` with optional `game_context` field | Low - optional field |
| `frontend/src/store/index.ts` | No changes needed | None |

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/games/types.ts` | GameModule interface (incl. `promptInstructions`), shared types |
| `frontend/src/games/registry.ts` | Game module map |
| `frontend/src/games/tic-tac-toe/TicTacToeModule.ts` | First game implementation (logic + prompt instructions) |
| `frontend/src/games/tic-tac-toe/TicTacToeBoard.tsx` | First game renderer |
| `frontend/src/store/gameStore.ts` | Game state Zustand store |
| `frontend/src/hooks/useGame.ts` | Game lifecycle hook |
| `frontend/src/components/GamePanel.tsx` | Floating game container |
| `frontend/src/components/GameSelector.tsx` | Game picker |
| `emilia-thai/skills/games/SKILL.md` | OpenClaw game awareness skill (Layer 1) |

---

## State Management Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  appStore    │     │  chatStore   │     │  gameStore   │
│              │     │              │     │              │
│  sessionId   │     │  messages[]  │     │  activeGame  │
│  status      │◄────│  streaming   │────►│  gameState   │
│  ttsEnabled  │     │              │     │  currentTurn │
│  avatarState │     │              │     │  moveHistory │
│  avatarRndr  │     │              │     │  gameStatus  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                     │
       │              ┌─────┴──────┐              │
       └──────────────│  useChat   │──────────────┘
                      │  useGame   │
                      └────────────┘
```

**Cross-store communication:**
- `useGame` reads from `gameStore` and writes game context into `useChat`
- `useChat` reads game context and includes it in API calls
- When game events come back from the API, `useChat` delegates to `useGame` for processing
- `useGame` triggers `applyAvatarCommand` on `appStore` for game-specific avatar reactions

---

## Game Context Injection (Backend)

The backend's role is minimal but important: it transforms the game context into a natural language prompt segment that the LLM can understand. This includes both the per-game prompt instructions (Layer 2) and the game state (Layer 3). See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md) for the full three-layer architecture.

### Request Schema Extension

```python
class ChatRequest(BaseModel):
    message: str
    game_context: dict | None = None  # Optional game context
```

### Prompt Injection Strategy

The game context is appended to the user's message before sending to Clawdbot. It includes the game-specific prompt instructions from the GameModule, followed by the serialized state and turn instructions:

```python
def inject_game_context(user_message: str, game_context: dict | None) -> str:
    if not game_context:
        return user_message

    game_id = game_context.get("gameId", "unknown")
    prompt_instructions = game_context.get("promptInstructions", "")
    state = game_context.get("state", "")
    last_move = game_context.get("lastUserMove", "")
    avatar_move = game_context.get("avatarMove")
    valid_moves = game_context.get("validMoves", [])
    status = game_context.get("status", "in_progress")

    # Start context block
    context_block = f"\n\n---\n[game: {game_id}]\n"

    # Layer 2: Per-game prompt instructions (from GameModule.promptInstructions)
    if prompt_instructions:
        context_block += f"\n{prompt_instructions}\n"

    # Layer 3: Game state (from GameModule.serializeState())
    context_block += f"\n{state}\n"

    if last_move:
        context_block += f"The user just played: {last_move}\n"

    if avatar_move:
        context_block += f"You played: {avatar_move}\nReact to this game state naturally.\n"
    elif valid_moves:
        moves_str = ", ".join(str(m) for m in valid_moves[:30])
        context_block += f"It's your turn. Legal moves: {moves_str}\n"
        context_block += "Choose a move and include it as [move:your_move] in your response.\n"

    if status == "game_over":
        context_block += "The game is over. React to the outcome.\n"

    context_block += "---"

    return user_message + context_block
```

This approach:
- Keeps the backend stateless regarding game logic
- Uses natural language the LLM can understand
- Only sends context when a game is active
- Includes game-specific personality only for the active game
- Limits valid moves list to prevent token bloat
- Requires zero backend changes when adding new games (instructions come from frontend)

---

## Tag Parsing Extension

### New Patterns (parse_chat.py)

```python
MOVE_PATTERN = re.compile(r'\[MOVE:([^\]]+)\]', re.IGNORECASE)
GAME_PATTERN = re.compile(r'\[GAME:([^\]]+)\]', re.IGNORECASE)
```

These are extracted alongside existing behavior tags and returned in the SSE response:

```python
def extract_avatar_commands(text: str) -> tuple[str, dict]:
    behavior = { ... }  # existing

    # New: game actions
    move_match = MOVE_PATTERN.search(text)
    if move_match:
        behavior["move"] = move_match.group(1)

    game_match = GAME_PATTERN.search(text)
    if game_match:
        behavior["game_action"] = game_match.group(1).lower()

    # Clean tags from text (strips [move:x], [game:x], etc.)
    clean_text = MOVE_PATTERN.sub('', clean_text)
    clean_text = GAME_PATTERN.sub('', clean_text)

    return clean_text, behavior
```

### New SSE Event

Game move data is sent as part of the existing `avatar` event (or a new `game` event):

```
event: avatar
data: {"intent":"playful","mood":"confident","intensity":0.7,"move":"e5"}
```

Or as a separate event:

```
event: game
data: {"move":"e5","game_action":null}
```

**Recommendation:** Extend the existing `avatar` event with optional `move` and `game_action` fields (from `[move:x]` and `[game:x]` tags). This avoids adding new event types and keeps the SSE protocol simple.

---

## Error Handling

### Invalid Moves from LLM

When the LLM returns an invalid move:

1. **First attempt:** Check if the move is a fuzzy match (e.g., "Nf3" vs "nf3", "knight f3")
2. **If no match:** Ignore the move, pick a fallback via engine/random provider
3. **Don't re-prompt:** Re-prompting adds latency and complexity. Just use the fallback and let the conversation continue naturally.

### Game State Desync

If the frontend and LLM somehow disagree on game state:

- The frontend (game engine) is always authoritative
- If the LLM references a different state, the frontend ignores it
- The next message will include the correct state, naturally re-syncing

### LLM Doesn't Include a Move Tag

This happens. Fallback chain:
1. Try to parse natural language ("I'll play e5", "my move is e5")
2. If that fails and it's the LLM provider, pick a random valid move
3. If engine provider, the move was already decided anyway

---

## Security Considerations

- Game state is client-side only -- no database writes, no new attack surface
- Move validation happens in the game engine (JavaScript), not from LLM output
- The LLM cannot execute arbitrary game actions -- all moves are validated against legal moves
- Game context sent to backend is treated as untrusted input (validated, size-limited)
- No user-to-user game state sharing (single-player vs avatar only in Phase 1)

---

## Performance Considerations

- Game modules are statically imported (no lazy loading needed for small modules)
- Chess.js is ~30KB gzipped -- acceptable bundle impact
- Game state serialization is cheap (FEN is 60 chars, tic-tac-toe is 9 chars)
- No additional API calls -- game context piggybacks on existing chat messages
- Game renders are lightweight DOM (no canvas needed for board games)
- Three.js avatar performance is unaffected -- game UI is separate DOM
