# Game Modules Architecture

**Parent:** [README.md](./README.md)

---

## System Overview

The game system is a frontend-first addon layer that plugs into the existing Emilia chat architecture. Game logic still runs in the browser, while backend routes provide catalog/config resolution and trusted prompt-context injection.

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
                               │ { message, game_context, runtime_trigger }
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                            │
│                                                                  │
│  games.py + admin.py                                            │
│  ├── Resolves per-agent catalog/config                           │
│  └── Manages game registry and per-agent overrides               │
│                                                                  │
│  chat.py                                                         │
│  ├── Receives typed game_context in request body                 │
│  ├── Resolves trusted prompt instructions from backend registry  │
│  ├── Appends context to user message before Clawdbot call        │
│  └── Extracts [move:x] from response (with existing behavior tags)│
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
│   ## Chess — How You Play (Layer 2: trusted backend instructions)│
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

A loader manifest maps `gameId` to lazy imports, while a runtime cache stores loaded modules:

```typescript
// games/loaders/manifest.ts
export const gameLoaderManifest = {
  chess: () => import('../modules/chess'),
  'tic-tac-toe': () => import('../modules/tic-tac-toe'),
};

// games/registry.ts
const registry = new Map<string, GameModule>();

export function hasGameLoader(gameId: string): boolean {
  return Object.prototype.hasOwnProperty.call(gameLoaderManifest, gameId);
}

export async function loadGame(gameId: string): Promise<GameModule> {
  if (registry.has(gameId)) return registry.get(gameId)!;
  const loader = gameLoaderManifest[gameId];
  if (!loader) throw new Error(`No loader configured for "${gameId}"`);
  const loaded = await loader();
  const module = await loaded.default.load();
  registry.set(gameId, module);
  return module;
}

export function getGame(gameId: string): GameModule | undefined {
  return registry.get(gameId);
}
```

Games are lazy-loaded on demand, so inactive games stay out of the initial bundle. A new game requires module code + loader manifest entry + backend catalog registration.

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

State is persisted in `sessionStorage` with context scoping (`userId`, `agentId`, `sessionId`, `gameId`) to prevent cross-session leakage.

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

`useGame` owns game-state orchestration and context payload building. Runtime chat triggers (turn prompts/outcome prompts) are emitted by shared runtime UI flow (`GameWindowManager` + `useChat`), not by individual game modules.

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
   a. Extracts `game_context` from body
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
| `frontend/src/games/loaders/manifest.ts` | Declares `gameId -> dynamic import` mapping | Medium - lazy loading contract |
| `frontend/src/games/registry.ts` | Loads/caches modules at runtime (`loadGame`, `preloadGame`, `hasGameLoader`) | Medium - runtime module lifecycle |
| `frontend/src/games/modules/*` | Game packages (logic + renderer + loader contract) | Medium - per-game implementation |
| `frontend/src/store/gameCatalogStore.ts` | Agent-scoped catalog state + refresh lifecycle | Medium - capability gating |
| `frontend/src/hooks/useGame.ts` | Runtime orchestration, move handling, context payload building | High - core game flow |
| `frontend/src/hooks/useChat.ts` | Sends `game_context` / `runtime_trigger`, processes avatar move tags | High - chat bridge |
| `frontend/src/games/ui/GameWindowManager.tsx` | Shared runtime triggers for turn/outcome messages | Medium - runtime messaging path |
| `backend/schemas/requests.py` | Typed `GameContextRequest` validation | Medium - contract enforcement |
| `backend/routers/chat.py` | Trusted prompt resolution + context injection + runtime-origin handling | High - backend bridge |
| `backend/routers/games.py` | Public catalog endpoints (`/api/games/catalog*`) | Medium - runtime capabilities |
| `backend/routers/admin.py` | Manage registry/agent config (`/api/manage/games*`) | Medium - operator controls |
| `backend/db/repositories/games.py` | Registry/config persistence and effective config resolution | Medium - source of truth |

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

The backend transforms validated `game_context` into a natural-language prompt segment for the LLM. Prompt instructions are resolved from backend registry/config (trusted source), while state/move context comes from runtime payload. See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md) for the three-layer model.

### Request Schema Extension

```python
class ChatRequest(BaseModel):
    message: str
    game_context: GameContextRequest | None = None
    runtime_trigger: bool = False
```

### Prompt Injection Strategy

The game context is appended before the Clawdbot call. The backend first resolves trusted prompt instructions for `agent_id + game_id`, then injects those with state/turn instructions:

```python
trusted_prompt = _resolve_trusted_prompt_instructions(agent_id, game_context)
llm_message = inject_game_context(
    user_message,
    game_context,
    prompt_instructions=trusted_prompt,
)
```

This approach:
- Keeps the backend stateless regarding game logic
- Uses natural language the LLM can understand
- Only sends context when a game is active
- Uses backend-authoritative game prompt instructions (agent overrides supported)
- Limits valid moves list to prevent token bloat
- Keeps chat API contract stable as games are added via catalog + loader manifest

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

- Game modules are lazy-loaded through `gameLoaderManifest`, so inactive engines stay out of the initial bundle
- Build guardrails (`npm run check:game-loaders`) verify chunking assumptions
- Chess engine code is loaded only when the chess module is requested
- Game state serialization is cheap (FEN is 60 chars, tic-tac-toe is 9 chars)
- No additional API calls -- game context piggybacks on existing chat messages
- Game renders are lightweight DOM (no canvas needed for board games)
- Three.js avatar performance is unaffected -- game UI is separate DOM
