import type { GameConfig, GameModule, GameStatus, MoveResult, PlayerRole } from '../../types';
import TicTacToeBoard from './TicTacToeBoard';

export type TicTacToeMark = 'X' | 'O';
export type TicTacToeCell = TicTacToeMark | null;

export interface TicTacToeState {
  board: TicTacToeCell[];
  userMark: TicTacToeMark;
  avatarMark: TicTacToeMark;
  winningLine: number[] | null;
  lastMove: number | null;
}

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const POSITION_LABELS = [
  'top-left',
  'top-middle',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-middle',
  'bottom-right',
];

const NAMED_MOVE_PATTERNS: Array<{ index: number; pattern: RegExp }> = [
  { index: 0, pattern: /top\s*left|upper\s*left/ },
  { index: 2, pattern: /top\s*right|upper\s*right/ },
  { index: 6, pattern: /bottom\s*left|lower\s*left/ },
  { index: 8, pattern: /bottom\s*right|lower\s*right/ },
  { index: 1, pattern: /top\s*(middle|center)|upper\s*(middle|center)/ },
  { index: 3, pattern: /(middle|center)\s*left|left\s*(middle|center)/ },
  { index: 5, pattern: /(middle|center)\s*right|right\s*(middle|center)/ },
  { index: 7, pattern: /bottom\s*(middle|center)|lower\s*(middle|center)/ },
  { index: 4, pattern: /\b(center|middle)\b/ },
];

function createEmptyBoard(): TicTacToeCell[] {
  return Array.from({ length: 9 }, () => null);
}

function getMarkForPlayer(state: TicTacToeState, player: PlayerRole): TicTacToeMark {
  return player === 'user' ? state.userMark : state.avatarMark;
}

function getNextPlayer(state: TicTacToeState): PlayerRole {
  const xCount = state.board.filter((cell) => cell === 'X').length;
  const oCount = state.board.filter((cell) => cell === 'O').length;
  const nextMark: TicTacToeMark = xCount <= oCount ? 'X' : 'O';
  return nextMark === state.userMark ? 'user' : 'avatar';
}

function getWinnerLine(board: TicTacToeCell[]): number[] | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const cell = board[a];
    if (cell && cell === board[b] && cell === board[c]) {
      return line;
    }
  }
  return null;
}

function boardIsFull(board: TicTacToeCell[]): boolean {
  return board.every((cell) => cell !== null);
}

function isValidMoveIndex(move: number): boolean {
  return Number.isInteger(move) && move >= 0 && move < 9;
}

function formatMoveIndex(move: number): string {
  return String(move + 1);
}

function describePosition(move: number): string {
  return POSITION_LABELS[move] ?? 'unknown position';
}

function parseMoveToken(token: string, validMoves: number[]): number | null {
  const normalized = token.toLowerCase();
  const numberMatch = normalized.match(/\b([0-9])\b/);
  if (numberMatch) {
    const value = Number(numberMatch[1]);
    if (value >= 1 && value <= 9) {
      const index = value - 1;
      if (validMoves.includes(index)) return index;
    }
    if (value >= 0 && value <= 8 && validMoves.includes(value)) {
      return value;
    }
  }

  for (const { index, pattern } of NAMED_MOVE_PATTERNS) {
    if (pattern.test(normalized) && validMoves.includes(index)) {
      return index;
    }
  }

  return null;
}

function getMoveDescription(move: number, player: PlayerRole): string {
  const actor = player === 'user' ? 'You' : 'Avatar';
  return `${actor} placed a mark in ${describePosition(move)}.`;
}

function createStatus(state: TicTacToeState): GameStatus {
  const winnerLine = getWinnerLine(state.board);

  if (winnerLine) {
    const winnerMark = state.board[winnerLine[0]];
    const winner = winnerMark === state.userMark ? 'user' : 'avatar';
    return {
      isOver: true,
      winner,
      displayText: winner === 'user' ? 'You win!' : 'Avatar wins!'
    };
  }

  if (boardIsFull(state.board)) {
    return {
      isOver: true,
      winner: 'draw',
      displayText: 'Draw'
    };
  }

  const nextPlayer = getNextPlayer(state);

  return {
    isOver: false,
    winner: null,
    displayText: nextPlayer === 'user' ? 'Your turn' : 'Avatar\'s turn'
  };
}

function serializeBoard(state: TicTacToeState): string {
  const cells = state.board.map((cell, index) => cell ?? String(index + 1));
  const rows = [0, 1, 2].map((row) => {
    const start = row * 3;
    return cells.slice(start, start + 3).join(' | ');
  });

  return rows.join('\n---------\n');
}

function pickRandomMove(validMoves: number[]): number {
  const index = Math.floor(Math.random() * validMoves.length);
  return validMoves[index];
}

function findWinningMove(board: TicTacToeCell[], mark: TicTacToeMark, validMoves: number[]): number | null {
  for (const move of validMoves) {
    const nextBoard = [...board];
    nextBoard[move] = mark;
    if (getWinnerLine(nextBoard)) {
      return move;
    }
  }
  return null;
}

export const ticTacToeModule: GameModule<TicTacToeState, number> = {
  id: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  description: 'Classic 3x3 strategy game.',
  category: 'board',
  minPlayers: 2,
  maxPlayers: 2,
  defaultMoveProvider: 'llm',
  promptInstructions: [
    '## Tic-Tac-Toe — How You Play',
    '- Think out loud about your strategy: "If I go here, you might..."',
    '- When blocking: notice the threat and comment on it',
    '- When setting up a fork: be sneaky about it',
    '- When winning: build up excitement before revealing your move',
    '- Keep it light — it\'s a quick, casual game',
    '- Positions are numbered 1-9 (top-left to bottom-right)',
    '- Include your move as [move:N] where N is the position number',
  ].join('\n'),

  createGame(config?: GameConfig): TicTacToeState {
    const firstPlayer = config?.firstPlayer ?? 'user';
    const userMark: TicTacToeMark = firstPlayer === 'user' ? 'X' : 'O';
    const avatarMark: TicTacToeMark = userMark === 'X' ? 'O' : 'X';

    return {
      board: createEmptyBoard(),
      userMark,
      avatarMark,
      winningLine: null,
      lastMove: null,
    };
  },

  getValidMoves(state: TicTacToeState, player: PlayerRole): number[] {
    if (createStatus(state).isOver) return [];

    const nextPlayer = getNextPlayer(state);
    if (player !== nextPlayer) return [];

    return state.board
      .map((cell, index) => (cell == null ? index : null))
      .filter((index): index is number => index !== null);
  },

  applyMove(state: TicTacToeState, move: number, player: PlayerRole): MoveResult<TicTacToeState> {
    if (!isValidMoveIndex(move)) {
      return {
        success: false,
        newState: state,
        status: createStatus(state),
        moveDescription: '',
        error: 'Move must be a number between 0 and 8.'
      };
    }

    const status = createStatus(state);
    if (status.isOver) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Game is already over.'
      };
    }

    const nextPlayer = getNextPlayer(state);
    if (player !== nextPlayer) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Not your turn.'
      };
    }

    if (state.board[move] !== null) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Cell is already occupied.'
      };
    }

    const nextBoard = [...state.board];
    nextBoard[move] = getMarkForPlayer(state, player);

    const winningLine = getWinnerLine(nextBoard);
    const nextState: TicTacToeState = {
      ...state,
      board: nextBoard,
      winningLine,
      lastMove: move,
    };

    const nextStatus = createStatus(nextState);

    return {
      success: true,
      newState: nextState,
      status: nextStatus,
      moveDescription: getMoveDescription(move, player),
    };
  },

  getStatus(state: TicTacToeState): GameStatus {
    return createStatus(state);
  },

  serializeState(state: TicTacToeState, perspective: PlayerRole): string {
    const youMark = perspective === 'user' ? state.userMark : state.avatarMark;
    const status = createStatus(state);
    const nextPlayer = getNextPlayer(state);
    const nextLabel = nextPlayer === perspective ? 'You' : nextPlayer === 'user' ? 'User' : 'Avatar';
    const nextMark = nextPlayer === 'user' ? state.userMark : state.avatarMark;

    return [
      'Tic-Tac-Toe',
      `You are ${youMark}.`,
      '',
      serializeBoard(state),
      '',
      'Positions: 1=top-left, 2=top-center, 3=top-right, 4=middle-left, 5=center, 6=middle-right, 7=bottom-left, 8=bottom-center, 9=bottom-right.',
      status.isOver
        ? `Game over. Result: ${status.displayText}`
        : `Current turn: ${nextLabel} (${nextMark}).`
    ].join('\n');
  },

  serializeMoves(moves: number[]): string {
    return moves.map(formatMoveIndex).join(', ');
  },

  parseMove(text: string, validMoves: number[]): number | null {
    if (!validMoves.length) return null;

    const tagMatch = text.match(/\[move:([^\]]+)\]/i);
    if (tagMatch) {
      const parsed = parseMoveToken(tagMatch[1], validMoves);
      if (parsed !== null) return parsed;
    }

    const parsed = parseMoveToken(text, validMoves);
    if (parsed !== null) return parsed;

    return null;
  },

  formatMove(move: number): string {
    return formatMoveIndex(move);
  },

  describeMove(move: number, player: PlayerRole): string {
    return getMoveDescription(move, player);
  },

  engineMove(state: TicTacToeState, difficulty: number): number {
    const validMoves = state.board
      .map((cell, index) => (cell == null ? index : null))
      .filter((index): index is number => index !== null);

    if (!validMoves.length) {
      return 0;
    }

    if (difficulty < 0.25) {
      return pickRandomMove(validMoves);
    }

    const avatarMark = state.avatarMark;
    const userMark = state.userMark;

    const winningMove = findWinningMove(state.board, avatarMark, validMoves);
    if (winningMove !== null) {
      return winningMove;
    }

    if (difficulty >= 0.4) {
      const blockingMove = findWinningMove(state.board, userMark, validMoves);
      if (blockingMove !== null) {
        return blockingMove;
      }
    }

    if (difficulty >= 0.5 && validMoves.includes(4)) {
      return 4;
    }

    if (difficulty >= 0.6) {
      const corners = validMoves.filter((move) => [0, 2, 6, 8].includes(move));
      if (corners.length) {
        return pickRandomMove(corners);
      }
    }

    return pickRandomMove(validMoves);
  },

  component: TicTacToeBoard,
};

export default ticTacToeModule;
