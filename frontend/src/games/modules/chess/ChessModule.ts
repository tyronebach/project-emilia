import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { GameConfig, GameModule, GameStatus, MoveResult, PlayerRole } from '../../types';
import ChessBoard from './ChessBoard';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3.1,
  b: 3.3,
  r: 5,
  q: 9,
  k: 0,
};

const CENTER_SQUARES = new Set(['d4', 'e4', 'd5', 'e5']);
const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([nbrq])?$/i;
const UCI_WITH_SEPARATOR_PATTERN = /^([a-h][1-8])\s*(?:-|to|x)\s*([a-h][1-8])\s*([nbrq])?$/i;

export interface ChessState {
  fen: string;
  pgn: string;
  userColor: Color;
  avatarColor: Color;
  lastMove: string | null;
  moveCount: number;
}

type MoveInput = {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
};

function getPlayerColor(state: ChessState, player: PlayerRole): Color {
  return player === 'user' ? state.userColor : state.avatarColor;
}

function normalizePromotionSymbol(symbol: string | undefined): PieceSymbol | undefined {
  if (!symbol) return undefined;
  const normalized = symbol.toLowerCase();
  if (normalized === 'n' || normalized === 'b' || normalized === 'r' || normalized === 'q') {
    return normalized;
  }
  return undefined;
}

export function normalizeChessMove(input: string): string | null {
  const lowered = input
    .trim()
    .toLowerCase()
    .replace(/[+#?!]/g, '')
    .replace(/=/g, '');

  const compact = lowered.replace(/\s+/g, '');
  const directMatch = compact.match(UCI_MOVE_PATTERN);
  if (directMatch) {
    const promotion = normalizePromotionSymbol(directMatch[3]);
    return `${directMatch[1]}${directMatch[2]}${promotion ?? ''}`;
  }

  const separatedMatch = lowered.match(UCI_WITH_SEPARATOR_PATTERN);
  if (separatedMatch) {
    const promotion = normalizePromotionSymbol(separatedMatch[3]);
    return `${separatedMatch[1]}${separatedMatch[2]}${promotion ?? ''}`;
  }

  return null;
}

function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase();
}

function parseMoveInput(move: string): MoveInput | null {
  const normalized = normalizeChessMove(move);
  if (!normalized) return null;
  const from = normalized.slice(0, 2) as Square;
  const to = normalized.slice(2, 4) as Square;
  const promotion = normalizePromotionSymbol(normalized.slice(4, 5));
  return {
    from,
    to,
    promotion,
  };
}

function resolveLegalMove(normalizedMove: string, legalMoves: Set<string>): string | null {
  if (legalMoves.has(normalizedMove)) {
    return normalizedMove;
  }
  if (normalizedMove.length === 4) {
    const queenPromotion = `${normalizedMove}q`;
    if (legalMoves.has(queenPromotion)) {
      return queenPromotion;
    }
  }
  return null;
}

function evaluateMaterial(chess: Chess, perspective: Color): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type];
      score += piece.color === perspective ? value : -value;
    }
  }
  return score;
}

function createStatus(state: ChessState): GameStatus {
  const chess = new Chess(state.fen);

  if (chess.isCheckmate()) {
    const loserColor = chess.turn();
    const winner = loserColor === state.userColor ? 'avatar' : 'user';
    return {
      isOver: true,
      winner,
      displayText: winner === 'user' ? 'You win by checkmate!' : 'Avatar wins by checkmate!',
    };
  }

  if (chess.isDraw()) {
    let reason = 'Draw';
    if (chess.isStalemate()) {
      reason = 'Draw by stalemate';
    } else if (chess.isInsufficientMaterial()) {
      reason = 'Draw by insufficient material';
    } else if (chess.isThreefoldRepetition()) {
      reason = 'Draw by repetition';
    } else if (chess.isDrawByFiftyMoves()) {
      reason = 'Draw by fifty-move rule';
    }

    return {
      isOver: true,
      winner: 'draw',
      displayText: reason,
    };
  }

  const userTurn = chess.turn() === state.userColor;
  return {
    isOver: false,
    winner: null,
    displayText: userTurn
      ? (chess.isCheck() ? 'Your turn (check)' : 'Your turn')
      : (chess.isCheck() ? "Avatar's turn (check)" : "Avatar's turn"),
  };
}

function describeMove(move: Move, player: PlayerRole): string {
  const actor = player === 'user' ? 'You' : 'Avatar';
  if (move.isKingsideCastle()) {
    return `${actor} castled kingside (${move.san}).`;
  }
  if (move.isQueensideCastle()) {
    return `${actor} castled queenside (${move.san}).`;
  }

  let description = `${actor} played ${move.san}.`;
  if (move.isPromotion() && move.promotion) {
    const promotionName = move.promotion === 'n'
      ? 'knight'
      : move.promotion === 'b'
        ? 'bishop'
        : move.promotion === 'r'
          ? 'rook'
          : 'queen';
    description = `${actor} promoted to ${promotionName} with ${move.san}.`;
  }
  return description;
}

function getSerializedTurnLabel(chess: Chess, perspectiveColor: Color): string {
  if (chess.turn() === perspectiveColor) {
    return 'You';
  }
  return 'Opponent';
}

export const chessModule: GameModule<ChessState, string> = {
  id: 'chess',
  name: 'Chess',
  description: 'Classic 8x8 strategy game with strict legal-move validation.',
  category: 'board',
  minPlayers: 2,
  maxPlayers: 2,
  defaultMoveProvider: 'engine',
  promptInstructions: [
    '## Chess — How You Play',
    '- React in character to each move and evaluate the position briefly.',
    '- Mention tactical ideas when relevant (checks, forks, pins, development).',
    '- Keep the tone playful and concise; avoid long lectures.',
    '- The engine chooses your move in strict mode, so narrate confidently.',
  ].join('\n'),

  createGame(config?: GameConfig): ChessState {
    const firstPlayer = config?.firstPlayer ?? 'user';
    const userColor: Color = firstPlayer === 'user' ? 'w' : 'b';
    const avatarColor: Color = userColor === 'w' ? 'b' : 'w';
    const chess = new Chess();
    return {
      fen: chess.fen(),
      pgn: '',
      userColor,
      avatarColor,
      lastMove: null,
      moveCount: 0,
    };
  },

  getValidMoves(state: ChessState, player: PlayerRole): string[] {
    const chess = new Chess(state.fen);
    const playerColor = getPlayerColor(state, player);
    if (chess.turn() !== playerColor || chess.isGameOver()) {
      return [];
    }
    return chess.moves({ verbose: true }).map(moveToUci);
  },

  applyMove(state: ChessState, move: string, player: PlayerRole): MoveResult<ChessState> {
    const chess = new Chess(state.fen);
    const status = createStatus(state);

    if (status.isOver) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Game is already over.',
      };
    }

    const playerColor = getPlayerColor(state, player);
    if (chess.turn() !== playerColor) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Not your turn.',
      };
    }

    const normalizedMove = normalizeChessMove(move);
    if (!normalizedMove) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Move must use UCI format like e2e4.',
      };
    }

    const legalMoves = new Set(this.getValidMoves(state, player));
    const resolvedMove = resolveLegalMove(normalizedMove, legalMoves);
    if (!resolvedMove) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Illegal move.',
      };
    }

    const moveInput = parseMoveInput(resolvedMove);
    if (!moveInput) {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Could not parse move input.',
      };
    }

    let appliedMove: Move;
    try {
      appliedMove = chess.move(moveInput, { strict: true });
    } catch {
      return {
        success: false,
        newState: state,
        status,
        moveDescription: '',
        error: 'Illegal move.',
      };
    }

    const nextState: ChessState = {
      ...state,
      fen: chess.fen(),
      pgn: chess.pgn(),
      lastMove: moveToUci(appliedMove),
      moveCount: state.moveCount + 1,
    };
    const nextStatus = createStatus(nextState);

    return {
      success: true,
      newState: nextState,
      status: nextStatus,
      moveDescription: describeMove(appliedMove, player),
    };
  },

  getStatus(state: ChessState): GameStatus {
    return createStatus(state);
  },

  serializeState(state: ChessState, perspective: PlayerRole): string {
    const chess = new Chess(state.fen);
    const perspectiveColor = getPlayerColor(state, perspective);

    return [
      'Chess',
      `You are ${perspectiveColor === 'w' ? 'White' : 'Black'}.`,
      `Turn: ${getSerializedTurnLabel(chess, perspectiveColor)} (${chess.turn() === 'w' ? 'White' : 'Black'}).`,
      chess.isCheck() ? 'Check is on the board.' : 'No check currently.',
      `FEN: ${state.fen}`,
      state.lastMove ? `Last move (UCI): ${state.lastMove}` : null,
      state.pgn ? `PGN: ${state.pgn}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  },

  serializeMoves(moves: string[]): string {
    return moves.join(', ');
  },

  parseMove(text: string, validMoves: string[]): string | null {
    if (!validMoves.length) return null;
    const legalMoves = new Set(validMoves.map((move) => move.toLowerCase()));

    const extract = (candidate: string): string | null => {
      const normalized = normalizeChessMove(candidate);
      if (!normalized) return null;
      const resolved = resolveLegalMove(normalized, legalMoves);
      return resolved;
    };

    const tagMatch = text.match(/\[move:([^\]]+)\]/i);
    if (tagMatch) {
      const tagged = extract(tagMatch[1]);
      if (tagged) return tagged;
    }

    const direct = extract(text);
    if (direct) return direct;

    const words = text.split(/\s+/);
    for (const word of words) {
      const fromWord = extract(word);
      if (fromWord) return fromWord;
    }

    return null;
  },

  formatMove(move: string): string {
    return normalizeChessMove(move) ?? move.toLowerCase();
  },

  describeMove(move: string, player: PlayerRole): string {
    const normalized = normalizeChessMove(move);
    if (!normalized) {
      const actor = player === 'user' ? 'You' : 'Avatar';
      return `${actor} played ${move}.`;
    }
    const actor = player === 'user' ? 'You' : 'Avatar';
    const from = normalized.slice(0, 2);
    const to = normalized.slice(2, 4);
    const promotion = normalizePromotionSymbol(normalized.slice(4, 5));
    if (promotion) {
      const pieceName = promotion === 'n'
        ? 'knight'
        : promotion === 'b'
          ? 'bishop'
          : promotion === 'r'
            ? 'rook'
            : 'queen';
      return `${actor} moved from ${from} to ${to} and promoted to ${pieceName}.`;
    }
    return `${actor} moved from ${from} to ${to}.`;
  },

  engineMove(state: ChessState, difficulty: number): string {
    const chess = new Chess(state.fen);
    const legalMoves = chess.moves({ verbose: true });
    if (!legalMoves.length) {
      return '';
    }

    const avatarColor = state.avatarColor;
    const normalizedDifficulty = Math.min(1, Math.max(0, difficulty));
    if (normalizedDifficulty <= 0.2) {
      const randomIndex = Math.floor(Math.random() * legalMoves.length);
      return moveToUci(legalMoves[randomIndex]);
    }

    const scoredMoves = legalMoves
      .map((candidate) => {
        const branch = new Chess(state.fen);
        const applied = branch.move(
          {
            from: candidate.from,
            to: candidate.to,
            promotion: candidate.promotion,
          },
          { strict: true }
        );

        let score = evaluateMaterial(branch, avatarColor);
        if (applied.isCapture()) {
          score += (applied.captured ? PIECE_VALUES[applied.captured] : 0.5) * 1.2;
        }
        if (applied.isPromotion()) {
          score += 7.5;
        }
        if (branch.isCheckmate()) {
          score += 10000;
        } else if (branch.isCheck()) {
          score += 1.1;
        }
        if (CENTER_SQUARES.has(applied.to)) {
          score += 0.2;
        }
        score += Math.random() * (1 - normalizedDifficulty) * 0.25;

        return {
          move: moveToUci(applied),
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    const poolSize = normalizedDifficulty >= 0.9
      ? 1
      : normalizedDifficulty >= 0.75
        ? 2
        : normalizedDifficulty >= 0.55
          ? 3
          : normalizedDifficulty >= 0.35
            ? 4
            : Math.min(6, scoredMoves.length);

    const index = Math.floor(Math.random() * Math.min(poolSize, scoredMoves.length));
    return scoredMoves[index].move;
  },

  component: ChessBoard,
};

export default chessModule;
