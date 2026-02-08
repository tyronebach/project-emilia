# Game Interface Specification

**Parent:** [README.md](./README.md)

---

## Core Types

```typescript
// games/types.ts

// ============================================================
// Player & Turn
// ============================================================

/** Who is acting: the human user or the AI avatar */
type PlayerRole = 'user' | 'avatar';

/** Whose turn it is, or null if game hasn't started */
type Turn = PlayerRole | null;

// ============================================================
// Game Status
// ============================================================

interface GameStatus {
  /** Is the game still in progress? */
  isOver: boolean;
  /** Who won? null if in progress or draw */
  winner: PlayerRole | 'draw' | null;
  /** Human-readable status for display */
  displayText: string;
}

// ============================================================
// Move Result
// ============================================================

interface MoveResult {
  /** Was the move legal and applied? */
  success: boolean;
  /** New state after the move (if success) */
  newState: unknown;
  /** Updated game status */
  status: GameStatus;
  /** Human-readable description of the move for chat */
  moveDescription: string;
  /** Error message if move was invalid */
  error?: string;
}

// ============================================================
// Move Record (History)
// ============================================================

interface MoveRecord {
  /** Who made this move */
  player: PlayerRole;
  /** The move value (game-specific) */
  move: unknown;
  /** Human-readable description */
  description: string;
  /** State after this move */
  stateAfter: unknown;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// Game Configuration
// ============================================================

interface GameConfig {
  /** Who goes first? Default: 'user' */
  firstPlayer?: PlayerRole;
  /** Difficulty level for engine-based moves (0-1) */
  difficulty?: number;
  /** Move provider override */
  moveProvider?: MoveProviderType;
  /** Game-specific options */
  options?: Record<string, unknown>;
}

// ============================================================
// Move Provider
// ============================================================

type MoveProviderType = 'llm' | 'engine' | 'random';

// ============================================================
// Game Context (sent to backend)
// ============================================================

interface GameContext {
  /** Game module ID */
  gameId: string;
  /** Serialized state (human-readable for LLM) */
  state: string;
  /** Last move made by user */
  lastUserMove: string | null;
  /** Avatar's move (if already decided by engine) */
  avatarMove: string | null;
  /** Valid moves for avatar (if LLM needs to choose) */
  validMoves: string[] | null;
  /** Current game status */
  status: 'in_progress' | 'game_over';
  /** Total moves played */
  moveCount: number;
  /** Game-specific LLM prompt instructions (narration style, strategy personality) */
  promptInstructions: string;
}

// ============================================================
// Renderer Props
// ============================================================

interface GameRendererProps<TState = unknown, TMove = unknown> {
  /** Current game state */
  state: TState;
  /** Whose turn it is */
  currentTurn: Turn;
  /** Valid moves for the current player */
  validMoves: TMove[];
  /** Called when user makes a move */
  onUserMove: (move: TMove) => void;
  /** Is the avatar "thinking"? */
  isAvatarThinking: boolean;
  /** Move history */
  moveHistory: MoveRecord[];
}
```

---

## GameModule Interface

The core contract every game implements:

```typescript
interface GameModule<TState = unknown, TMove = unknown> {
  // ========== IDENTITY ==========

  /** Unique identifier: 'tic-tac-toe', 'chess', etc. */
  readonly id: string;

  /** Display name: 'Tic-Tac-Toe', 'Chess', etc. */
  readonly name: string;

  /** Short description for the game selector */
  readonly description: string;

  /** Category for grouping: 'board', 'card', 'word', 'creative' */
  readonly category: GameCategory;

  /** Minimum players (always 2 for avatar games) */
  readonly minPlayers: number;

  /** Maximum players (always 2 for avatar games) */
  readonly maxPlayers: number;

  /** Default move provider for this game */
  readonly defaultMoveProvider: MoveProviderType;

  /**
   * Game-specific LLM prompt instructions.
   * Injected into the message context when this game is active.
   * Contains narration style, strategy personality, tag format reminders.
   * Should be concise (~80-150 tokens).
   * See PROMPTING-STRATEGY.md for the three-layer architecture.
   */
  readonly promptInstructions: string;

  // ========== LIFECYCLE ==========

  /**
   * Create a new game with initial state.
   * @param config - Optional configuration (who goes first, difficulty, etc.)
   * @returns Initial game state
   */
  createGame(config?: GameConfig): TState;

  // ========== STATE ==========

  /**
   * Get all legal moves for a player in the current state.
   * @param state - Current game state
   * @param player - Who is moving
   * @returns Array of legal moves
   */
  getValidMoves(state: TState, player: PlayerRole): TMove[];

  /**
   * Apply a move and return the new state.
   * Must validate the move is legal.
   * @param state - Current state
   * @param move - The move to apply
   * @param player - Who is making the move
   * @returns Result with new state or error
   */
  applyMove(state: TState, move: TMove, player: PlayerRole): MoveResult;

  /**
   * Check the current game status (in progress, winner, draw).
   */
  getStatus(state: TState): GameStatus;

  // ========== LLM BRIDGE ==========

  /**
   * Serialize the game state into a human-readable string for the LLM.
   * Should include board visualization, whose turn it is, relevant context.
   * @param state - Current state
   * @param perspective - From whose point of view (affects "you" vs "opponent")
   */
  serializeState(state: TState, perspective: PlayerRole): string;

  /**
   * Serialize a list of moves into a compact, LLM-readable format.
   * @param moves - Array of legal moves
   * @returns Comma-separated or formatted string of moves
   */
  serializeMoves(moves: TMove[]): string;

  /**
   * Parse a move from LLM text output.
   * Looks for [move:x] tag first, then falls back to natural language patterns.
   * @param text - Raw LLM output text
   * @param validMoves - Legal moves to match against
   * @returns Parsed move or null if not found
   */
  parseMove(text: string, validMoves: TMove[]): TMove | null;

  /**
   * Format a move for the [move:x] tag.
   * @param move - The move to format
   * @returns String representation suitable for [move:x]
   */
  formatMove(move: TMove): string;

  /**
   * Generate a human-readable description of a move for chat.
   * @param move - The move
   * @param player - Who made it
   * @returns e.g., "moved pawn to e4", "placed X in top-right"
   */
  describeMove(move: TMove, player: PlayerRole): string;

  // ========== ENGINE (Optional) ==========

  /**
   * Built-in engine for computer moves.
   * Only required if defaultMoveProvider is 'engine'.
   * @param state - Current state
   * @param difficulty - 0 (random) to 1 (best play)
   * @returns A legal move
   */
  engineMove?(state: TState, difficulty: number): TMove;

  // ========== RENDERING ==========

  /**
   * React component that renders the game UI.
   * Receives standardized props (state, turn, valid moves, callbacks).
   */
  readonly component: React.ComponentType<GameRendererProps<TState, TMove>>;
}

type GameCategory = 'board' | 'card' | 'word' | 'creative';
```

---

## Example: Tic-Tac-Toe Implementation

Shows how the interface maps to a concrete game:

```typescript
// games/tic-tac-toe/TicTacToeModule.ts

type TicTacToeState = {
  board: ('X' | 'O' | null)[];  // 9 cells, index 0-8
  players: { user: 'X' | 'O'; avatar: 'X' | 'O' };
};

type TicTacToeMove = number;  // 0-8 (board position)

const ticTacToeModule: GameModule<TicTacToeState, TicTacToeMove> = {
  id: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  description: 'Classic 3x3 grid game',
  category: 'board',
  minPlayers: 2,
  maxPlayers: 2,
  defaultMoveProvider: 'llm',  // Simple enough for LLM to play directly
  promptInstructions: `## Tic-Tac-Toe — How You Play
- Think out loud about your strategy: "If I go here, you might..."
- When blocking: notice the threat and comment on it
- When setting up a fork: be sneaky about it
- When winning: build up excitement before revealing your move
- Keep it light — it's a quick, casual game
- Positions are numbered 1-9 (top-left to bottom-right)
- Include your move as [move:N] where N is the position number`,

  createGame(config) {
    const userFirst = (config?.firstPlayer ?? 'user') === 'user';
    return {
      board: Array(9).fill(null),
      players: { user: userFirst ? 'X' : 'O', avatar: userFirst ? 'O' : 'X' },
    };
  },

  getValidMoves(state) {
    return state.board
      .map((cell, i) => cell === null ? i : -1)
      .filter(i => i !== -1);
  },

  applyMove(state, move, player) {
    if (state.board[move] !== null) {
      return {
        success: false, newState: state,
        status: this.getStatus(state),
        moveDescription: '', error: 'Cell already occupied',
      };
    }
    const newBoard = [...state.board];
    newBoard[move] = state.players[player];
    const newState = { ...state, board: newBoard };
    const status = this.getStatus(newState);
    const row = Math.floor(move / 3) + 1;
    const col = (move % 3) + 1;
    return {
      success: true, newState, status,
      moveDescription: `placed ${state.players[player]} at row ${row}, column ${col}`,
    };
  },

  getStatus(state) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, b, c] of lines) {
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        const winnerMark = state.board[a];
        const winner = winnerMark === state.players.user ? 'user' : 'avatar';
        return { isOver: true, winner, displayText: `${winner === 'user' ? 'You' : 'Avatar'} wins!` };
      }
    }
    if (state.board.every(cell => cell !== null)) {
      return { isOver: true, winner: 'draw', displayText: "It's a draw!" };
    }
    return { isOver: false, winner: null, displayText: 'Game in progress' };
  },

  serializeState(state, perspective) {
    const mark = state.players[perspective];
    const rows = [
      state.board.slice(0, 3),
      state.board.slice(3, 6),
      state.board.slice(6, 9),
    ];
    const boardStr = rows.map(row =>
      row.map((cell, i) => cell ?? (rows.indexOf(row) * 3 + i + 1).toString()).join(' | ')
    ).join('\n---------\n');

    return `Tic-Tac-Toe\nYou are ${mark}.\n\n${boardStr}\n\nEmpty positions are shown as numbers (1-9).`;
  },

  serializeMoves(moves) {
    return moves.map(m => m + 1).join(', ');  // 1-indexed for humans
  },

  parseMove(text, validMoves) {
    // Try [move:x] tag first
    const tagMatch = text.match(/\[MOVE:(\d)\]/i);
    if (tagMatch) {
      const pos = parseInt(tagMatch[1]) - 1;  // Convert 1-indexed to 0-indexed
      if (validMoves.includes(pos)) return pos;
    }
    // Fallback: look for single digit in context
    const numMatch = text.match(/(?:position|square|spot|place|move)\s*(\d)/i);
    if (numMatch) {
      const pos = parseInt(numMatch[1]) - 1;
      if (validMoves.includes(pos)) return pos;
    }
    return null;
  },

  formatMove(move) {
    return (move + 1).toString();  // 1-indexed for display
  },

  describeMove(move, player) {
    const row = Math.floor(move / 3) + 1;
    const col = (move % 3) + 1;
    const names = ['top-left','top-center','top-right','middle-left','center',
                   'middle-right','bottom-left','bottom-center','bottom-right'];
    return `${player === 'user' ? 'You' : 'I'} placed in ${names[move]}`;
  },

  engineMove(state, difficulty) {
    const valid = this.getValidMoves(state, 'avatar');
    if (difficulty < 0.3) {
      // Random move
      return valid[Math.floor(Math.random() * valid.length)];
    }
    // Simple strategy: center > corners > edges
    const priority = [4, 0, 2, 6, 8, 1, 3, 5, 7];
    for (const pos of priority) {
      if (valid.includes(pos)) return pos;
    }
    return valid[0];
  },

  component: TicTacToeBoard,  // React component (see FRONTEND-DESIGN.md)
};
```

---

## Example: Chess Implementation (Sketch)

Shows how a complex game with an engine provider works:

```typescript
// games/chess/ChessModule.ts
import { Chess } from 'chess.js';

type ChessState = {
  fen: string;       // FEN notation
  pgn: string;       // Move history in PGN
  players: { user: 'w' | 'b'; avatar: 'w' | 'b' };
};

type ChessMove = string;  // Standard algebraic notation (e.g., 'e4', 'Nf3')

const chessModule: GameModule<ChessState, ChessMove> = {
  id: 'chess',
  name: 'Chess',
  description: 'The classic strategy game',
  category: 'board',
  minPlayers: 2,
  maxPlayers: 2,
  defaultMoveProvider: 'engine',  // Chess.js or lightweight engine
  promptInstructions: `## Chess — How You Play
Your move has already been decided. Narrate as if YOU chose it.
- Never mention an engine, algorithm, or calculation
- Comment on strategy: openings, tactics, positional ideas
- Reference real chess concepts when relevant (pins, forks, development, tempo)
- React to captures and checks with appropriate emotion
- If losing: show determination and look for counterplay
- If winning: stay humble but confident
- Describe your move naturally: "I'll develop my knight to f3"`,

  createGame(config) {
    const userWhite = (config?.firstPlayer ?? 'user') === 'user';
    return {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      pgn: '',
      players: { user: userWhite ? 'w' : 'b', avatar: userWhite ? 'b' : 'w' },
    };
  },

  getValidMoves(state) {
    const chess = new Chess(state.fen);
    return chess.moves();  // Returns ['e4', 'd4', 'Nf3', ...]
  },

  applyMove(state, move, player) {
    const chess = new Chess(state.fen);
    const result = chess.move(move);
    if (!result) {
      return {
        success: false, newState: state,
        status: this.getStatus(state),
        moveDescription: '', error: `Invalid move: ${move}`,
      };
    }
    const newState = {
      ...state,
      fen: chess.fen(),
      pgn: chess.pgn(),
    };
    return {
      success: true, newState,
      status: this.getStatus(newState),
      moveDescription: `played ${result.san}`,
    };
  },

  getStatus(state) {
    const chess = new Chess(state.fen);
    if (chess.isCheckmate()) {
      // The player whose turn it is has been checkmated
      const loser = chess.turn();
      const winner = loser === state.players.user ? 'avatar' : 'user';
      return { isOver: true, winner, displayText: 'Checkmate!' };
    }
    if (chess.isDraw() || chess.isStalemate()) {
      return { isOver: true, winner: 'draw', displayText: 'Draw!' };
    }
    if (chess.isCheck()) {
      return { isOver: false, winner: null, displayText: 'Check!' };
    }
    return { isOver: false, winner: null, displayText: 'In progress' };
  },

  serializeState(state, perspective) {
    const chess = new Chess(state.fen);
    const color = perspective === 'user' ? state.players.user : state.players.avatar;
    const colorName = color === 'w' ? 'White' : 'Black';
    const turnColor = chess.turn() === 'w' ? 'White' : 'Black';

    let desc = `Chess - You are ${colorName}\n`;
    desc += `Position (FEN): ${state.fen}\n`;
    desc += `It is ${turnColor}'s turn.\n`;

    if (state.pgn) {
      desc += `Moves so far: ${state.pgn}\n`;
    }

    if (chess.isCheck()) {
      desc += `${turnColor} is in check!\n`;
    }

    return desc;
  },

  serializeMoves(moves) {
    // Limit to avoid token bloat
    if (moves.length <= 20) return moves.join(', ');
    return moves.slice(0, 20).join(', ') + ` (and ${moves.length - 20} more)`;
  },

  parseMove(text, validMoves) {
    // [move:e4] tag
    const tagMatch = text.match(/\[MOVE:([^\]]+)\]/i);
    if (tagMatch) {
      const move = tagMatch[1].trim();
      if (validMoves.includes(move)) return move;
      // Try case-insensitive match
      const lower = move.toLowerCase();
      const found = validMoves.find(m => m.toLowerCase() === lower);
      if (found) return found;
    }
    // Natural language fallback: "I play e4", "my move is Nf3"
    for (const m of validMoves) {
      if (text.includes(m)) return m;
    }
    return null;
  },

  formatMove(move) {
    return move;  // Already in algebraic notation
  },

  describeMove(move, player) {
    return `${player === 'user' ? 'You' : 'I'} played ${move}`;
  },

  engineMove(state, difficulty) {
    const chess = new Chess(state.fen);
    const moves = chess.moves();
    if (difficulty < 0.3) {
      // Random legal move
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Medium: prefer captures, checks, center control
    // (Real implementation would use a proper evaluation)
    const captures = moves.filter(m => m.includes('x'));
    const checks = moves.filter(m => m.includes('+'));
    if (checks.length > 0 && Math.random() < difficulty) return checks[0];
    if (captures.length > 0 && Math.random() < difficulty) return captures[0];
    return moves[Math.floor(Math.random() * moves.length)];
  },

  component: ChessBoard,
};
```

---

## Type Safety Notes

The `GameModule` interface uses generics (`TState`, `TMove`) for type safety within each game's implementation. However, the game store and registry work with `unknown` types since they need to handle any game dynamically:

```typescript
// The registry stores modules as GameModule (no generics)
const registry = new Map<string, GameModule>();

// The store uses unknown for state/moves
interface GameStoreState {
  gameState: unknown;
  // ...
}
```

Each game module internally has full type safety. The boundary between "typed game logic" and "generic game system" is at the GameModule interface level. This is intentional -- it keeps the system flexible without sacrificing type safety where it matters (inside each game's logic).

---

## Adding a New Game: Checklist

1. Create directory: `frontend/src/games/your-game/`
2. Define state and move types
3. Implement `GameModule` interface, including `promptInstructions` for LLM personality
4. Create React renderer component accepting `GameRendererProps`
5. Add to `games/registry.ts`
6. Test: create game, make moves, serialize for LLM, parse LLM moves
7. Done -- no SOUL.md changes, no new skills, no backend changes needed

See [PROMPTING-STRATEGY.md](./PROMPTING-STRATEGY.md) for how promptInstructions fits into the three-layer architecture.
