// # Phase 1.1 COMPLETE - 2026-02-08
import type { ComponentType } from 'react';

// ============================================================
// Player & Turn
// ============================================================

/** Who is acting: the human user or the AI avatar */
export type PlayerRole = 'user' | 'avatar';

/** Whose turn it is, or null if game hasn't started */
export type Turn = PlayerRole | null;

// ============================================================
// Game Status
// ============================================================

export interface GameStatus {
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

export interface MoveResult<TState = unknown> {
  /** Was the move legal and applied? */
  success: boolean;
  /** New state after the move (if success) */
  newState: TState;
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

export interface MoveRecord<TState = unknown, TMove = unknown> {
  /** Who made this move */
  player: PlayerRole;
  /** The move value (game-specific) */
  move: TMove;
  /** Human-readable description */
  description: string;
  /** State after this move */
  stateAfter: TState;
  /** Timestamp */
  timestamp: number;
}

// ============================================================
// Game Configuration
// ============================================================

export interface GameConfig {
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

export type MoveProviderType = 'llm' | 'engine' | 'random';

// ============================================================
// Game Context (sent to backend)
// ============================================================

export interface GameContext {
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
}

// ============================================================
// Renderer Props
// ============================================================

export interface GameRendererProps<TState = unknown, TMove = unknown> {
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
  moveHistory: MoveRecord<TState, TMove>[];
}

// ============================================================
// GameModule Interface
// ============================================================

export interface GameModule<TState = unknown, TMove = unknown> {
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
  applyMove(state: TState, move: TMove, player: PlayerRole): MoveResult<TState>;

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
  readonly component: ComponentType<GameRendererProps<TState, TMove>>;
}

export type GameCategory = 'board' | 'card' | 'word' | 'creative';
