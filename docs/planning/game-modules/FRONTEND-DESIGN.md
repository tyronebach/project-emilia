# Frontend Design

**Parent:** [README.md](./README.md)

---

## Layout Strategy

The existing Emilia UI is a full-screen 3D avatar with chat messages as a transparent overlay and a floating input bar at the bottom. The game panel must coexist with this layout without replacing the avatar or disrupting the conversation flow.

### Current Layout

```
┌─────────────────────────────────────────┐
│  [Menu]          Header          [Debug]│
│                                         │
│                                         │
│           Avatar (Three.js)             │
│           (fills viewport)              │
│                                         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Chat messages (semi-transparent│    │
│  │  overlay, scrollable)           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  [Input field] [Mic] [Send]     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### With Game Active

```
┌─────────────────────────────────────────┐
│  [Menu]          Header       [X Close] │
│                                         │
│         Avatar (Three.js)               │
│         (fills viewport)                │
│                                         │
│    ┌──────────────────┐                 │
│    │   Game Panel     │                 │
│    │   (floating)     │                 │
│    │   ┌────────────┐ │                 │
│    │   │  Board /   │ │                 │
│    │   │  Canvas    │ │                 │
│    │   └────────────┘ │                 │
│    │   Score / Status │                 │
│    └──────────────────┘                 │
│                                         │
│  Chat messages (overlay, compressed)    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  [Input field] [Mic] [🎮] [Send]│    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Key decisions:**
- Game panel floats over the avatar, similar to chat messages
- Semi-transparent background so the avatar is still visible behind it
- Positioned in the upper-center or center area
- Draggable (optional, Phase 5 polish)
- Can be minimized/collapsed
- Chat area stays at bottom, slightly compressed when game is active
- New game button (gamepad icon) in input bar

---

## Component Tree

```
App.tsx
├── AvatarPanel.tsx (existing, unchanged)
├── Header.tsx (existing, minor: add game close button when active)
├── GamePanel.tsx (NEW)
│   ├── GameHeader (game name, score, close button)
│   ├── {ActiveGame.component} (dynamic game renderer)
│   └── GameStatusBar (turn indicator, move count, timer)
├── ChatPanel.tsx (existing, unchanged)
├── InputControls.tsx (existing, add game selector button)
└── GameSelector.tsx (NEW, modal/popover for picking a game)
```

---

## GamePanel Component

The main container for the active game.

```typescript
// components/GamePanel.tsx

interface GamePanelProps {
  // All state comes from hooks/stores, no props needed
}

function GamePanel() {
  const activeGameId = useGameStore(s => s.activeGameId);
  const gameState = useGameStore(s => s.gameState);
  const currentTurn = useGameStore(s => s.currentTurn);
  const moveHistory = useGameStore(s => s.moveHistory);
  const gameStatus = useGameStore(s => s.gameStatus);
  const { makeUserMove, isAvatarThinking } = useGame();

  if (!activeGameId) return null;

  const module = getGame(activeGameId);
  if (!module) return null;

  const GameComponent = module.component;
  const validMoves = currentTurn === 'user'
    ? module.getValidMoves(gameState, 'user')
    : [];

  return (
    <div className="game-panel">
      <GamePanelHeader
        gameName={module.name}
        status={gameStatus}
        onClose={() => useGameStore.getState().endGame()}
        onReset={() => useGameStore.getState().resetGame()}
      />

      <GameComponent
        state={gameState}
        currentTurn={currentTurn}
        validMoves={validMoves}
        onUserMove={makeUserMove}
        isAvatarThinking={isAvatarThinking}
        moveHistory={moveHistory}
      />

      <GameStatusBar
        turn={currentTurn}
        status={gameStatus}
        moveCount={moveHistory.length}
      />
    </div>
  );
}
```

### Styling

```css
.game-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 30;  /* Above avatar (10), below modals (50) */

  background: rgba(15, 15, 25, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;

  min-width: 300px;
  max-width: 500px;
  max-height: 70vh;

  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

Matches the existing glass-morphism style used by ChatPanel and Drawer.

---

## GameSelector Component

A popover/modal triggered by the game button in InputControls.

```typescript
// components/GameSelector.tsx

function GameSelector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const games = listGames();
  const { startGame } = useGame();

  const handleSelect = (gameId: string) => {
    startGame(gameId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Play a Game</DialogTitle>
        </DialogHeader>

        <div className="game-grid">
          {games.map(game => (
            <button
              key={game.id}
              onClick={() => handleSelect(game.id)}
              className="game-card"
            >
              <span className="game-icon">{getGameIcon(game.category)}</span>
              <span className="game-name">{game.name}</span>
              <span className="game-desc">{game.description}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Game Card Layout

```
┌─────────────────┐  ┌─────────────────┐
│  ♟  Chess       │  │  #  Tic-Tac-Toe │
│  Strategy game  │  │  Classic 3x3    │
└─────────────────┘  └─────────────────┘
┌─────────────────┐  ┌─────────────────┐
│  ?  20 Questions│  │  Aa Word Games  │
│  Guessing game  │  │  Word play      │
└─────────────────┘  └─────────────────┘
```

Uses the existing Radix Dialog component from `components/ui/dialog.tsx`.

---

## Game Renderers

Each game provides its own React component. These are standard React components receiving `GameRendererProps`.

### Tic-Tac-Toe Board

```typescript
// games/tic-tac-toe/TicTacToeBoard.tsx

function TicTacToeBoard({ state, currentTurn, validMoves, onUserMove, isAvatarThinking }: GameRendererProps<TicTacToeState, number>) {
  const isUserTurn = currentTurn === 'user';

  return (
    <div className="ttt-board">
      {state.board.map((cell, i) => {
        const isValid = isUserTurn && validMoves.includes(i);
        return (
          <button
            key={i}
            className={cn(
              'ttt-cell',
              cell === 'X' && 'ttt-x',
              cell === 'O' && 'ttt-o',
              isValid && 'ttt-valid',
              !isValid && 'ttt-disabled',
            )}
            onClick={() => isValid && onUserMove(i)}
            disabled={!isValid}
          >
            {cell}
          </button>
        );
      })}

      {isAvatarThinking && (
        <div className="ttt-thinking">Thinking...</div>
      )}
    </div>
  );
}
```

Styling:
```css
.ttt-board {
  display: grid;
  grid-template-columns: repeat(3, 80px);
  grid-template-rows: repeat(3, 80px);
  gap: 4px;
  margin: 16px auto;
}

.ttt-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: background 0.15s;
}

.ttt-valid:hover {
  background: rgba(255, 255, 255, 0.15);
}

.ttt-x { color: #60a5fa; }  /* blue */
.ttt-o { color: #f472b6; }  /* pink */
.ttt-disabled { cursor: default; opacity: 0.6; }
```

### Chess Board

For chess, avoid the full chessboard.js dependency (it requires jQuery). Instead, use a lightweight approach:

**Option A: Pure CSS grid board** (recommended for Phase 3)
- 8x8 grid of styled divs
- Piece unicode characters or small SVG sprites
- Click-to-select, click-to-move interaction
- Highlight valid moves on piece selection
- ~200 lines of React + CSS

**Option B: react-chessboard** (if richer features needed)
- `npm install react-chessboard` (~40KB)
- Handles drag-and-drop, animations, promotions
- Integrates cleanly with chess.js
- Recommended if users expect polished chess UX

```typescript
// games/chess/ChessBoard.tsx (Option A sketch)

function ChessBoard({ state, currentTurn, validMoves, onUserMove }: GameRendererProps<ChessState, string>) {
  const [selected, setSelected] = useState<string | null>(null);
  const chess = useMemo(() => new Chess(state.fen), [state.fen]);
  const board = chess.board();  // 8x8 array

  const handleSquareClick = (square: string) => {
    if (currentTurn !== 'user') return;

    if (selected) {
      // Try to make a move
      const move = `${selected}${square}`;
      // chess.js accepts 'e2e4' format moves
      if (validMoves.some(m => m.from === selected && m.to === square)) {
        onUserMove(chess.move({ from: selected, to: square })?.san ?? move);
      }
      setSelected(null);
    } else {
      // Select a piece
      setSelected(square);
    }
  };

  return (
    <div className="chess-board">
      {board.flat().map((piece, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const square = `${'abcdefgh'[col]}${8 - row}`;
        const isDark = (row + col) % 2 === 1;

        return (
          <div
            key={square}
            className={cn('chess-square', isDark ? 'dark' : 'light',
                          selected === square && 'selected')}
            onClick={() => handleSquareClick(square)}
          >
            {piece && <span className="chess-piece">{pieceToUnicode(piece)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function pieceToUnicode(piece: { type: string; color: string }): string {
  const map: Record<string, string> = {
    'wk': '\u2654', 'wq': '\u2655', 'wr': '\u2656',
    'wb': '\u2657', 'wn': '\u2658', 'wp': '\u2659',
    'bk': '\u265A', 'bq': '\u265B', 'br': '\u265C',
    'bb': '\u265D', 'bn': '\u265E', 'bp': '\u265F',
  };
  return map[`${piece.color}${piece.type}`] ?? '';
}
```

---

## Input Controls Integration

Add a game button to the existing `InputControls.tsx`:

```typescript
// In InputControls.tsx - add alongside existing mic/send buttons

const [gameSelectorOpen, setGameSelectorOpen] = useState(false);
const activeGame = useGameStore(s => s.activeGameId);

// In the button bar:
<button
  onClick={() => setGameSelectorOpen(true)}
  className={cn('control-btn', activeGame && 'active')}
  title={activeGame ? 'Game active' : 'Play a game'}
>
  {/* Gamepad icon - use an SVG or text icon */}
  <GamepadIcon />
</button>

<GameSelector open={gameSelectorOpen} onClose={() => setGameSelectorOpen(false)} />
```

---

## Responsive Behavior

### Mobile (< 640px)
- Game panel takes full width with small margins
- Board cells scale down (60px instead of 80px)
- Game panel positioned at top, chat at bottom
- Touch-friendly tap targets (minimum 44px)

### Tablet (640px - 1024px)
- Game panel centered, max-width 400px
- Standard sizing

### Desktop (> 1024px)
- Game panel can be positioned off-center if avatar is visible
- Larger board cells possible
- Room for move history sidebar in game panel

---

## Animation & Transitions

### Game Panel Entrance
```css
.game-panel {
  animation: game-panel-in 0.3s ease-out;
}

@keyframes game-panel-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
```

### Move Animation
When a move is applied (user or avatar), briefly highlight the affected cell/square:

```css
.cell-just-moved {
  animation: move-flash 0.5s ease;
}

@keyframes move-flash {
  0% { background: rgba(255, 200, 0, 0.3); }
  100% { background: transparent; }
}
```

### Avatar Thinking Indicator
When it's the avatar's turn and we're waiting for the LLM:
- Subtle pulsing border on the game panel
- "Thinking..." text with animated dots
- Avatar plays thinking animation (via existing behavior system)

---

## Game State in Chat Messages

When a game is active, chat messages can include game context visually:

```
┌──────────────────────────────┐
│ You: I'll take the center!   │
│ [Placed X at center]         │  ← Game move annotation
│                              │
│ Emilia: Nice move! But I'll  │
│ block your diagonal~         │
│ [Placed O at top-right]      │  ← Avatar move annotation
└──────────────────────────────┘
```

Move annotations are rendered as small, muted badges below the message text. They come from `GameModule.describeMove()`.

---

## Game Over Screen

When the game ends, the GamePanel transitions to a result screen:

```
┌──────────────────────┐
│      YOU WIN!        │
│    (or DRAW, etc.)   │
│                      │
│  Moves: 7            │
│                      │
│  [Play Again] [Close]│
└──────────────────────┘
```

"Play Again" resets the game state. "Close" removes the game panel.

The avatar's reaction to game results is handled by the behavior system (see LLM-INTEGRATION.md).

---

## Accessibility

- All game board cells are `<button>` elements with `aria-label`
- Turn indicator announced to screen readers
- Keyboard navigation: Tab through cells, Enter to select
- High contrast mode: visible cell borders, distinct piece colors
- Move history available as text for screen reader users
