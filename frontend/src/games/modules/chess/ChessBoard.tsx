import { useEffect, useMemo, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { cn } from '../../../lib/utils';
import type { GameRendererProps } from '../../types';
import type { ChessState } from './ChessModule';
import { normalizeChessMove } from './ChessModule';

type ParsedMove = {
  uci: string;
  from: string;
  to: string;
  promotion?: string;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS_ASC = ['1', '2', '3', '4', '5', '6', '7', '8'];
const RANKS_DESC = ['8', '7', '6', '5', '4', '3', '2', '1'];
const FILES_REVERSED = [...FILES].reverse();

const WHITE_PIECES: Record<PieceSymbol, string> = {
  p: '♙',
  n: '♘',
  b: '♗',
  r: '♖',
  q: '♕',
  k: '♔',
};

const BLACK_PIECES: Record<PieceSymbol, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

function parseMove(move: string): ParsedMove | null {
  const normalized = normalizeChessMove(move);
  if (!normalized) return null;
  return {
    uci: normalized,
    from: normalized.slice(0, 2),
    to: normalized.slice(2, 4),
    promotion: normalized.slice(4, 5) || undefined,
  };
}

function pieceGlyph(type: PieceSymbol, color: 'w' | 'b'): string {
  return color === 'w' ? WHITE_PIECES[type] : BLACK_PIECES[type];
}

function isDarkSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square.charAt(1));
  return (file + rank) % 2 === 1;
}

function ChessBoard({
  state,
  currentTurn,
  validMoves,
  onUserMove,
  isAvatarThinking,
}: GameRendererProps<ChessState, string>) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  const chess = useMemo(() => new Chess(state.fen), [state.fen]);

  const squares = useMemo(() => {
    const files = state.userColor === 'w' ? FILES : FILES_REVERSED;
    const ranks = state.userColor === 'w' ? RANKS_DESC : RANKS_ASC;
    return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
  }, [state.userColor]);

  const legalMovesByFrom = useMemo(() => {
    const map: Record<string, ParsedMove[]> = {};
    for (const move of validMoves) {
      const parsed = parseMove(move);
      if (!parsed) continue;
      if (!map[parsed.from]) {
        map[parsed.from] = [];
      }
      map[parsed.from].push(parsed);
    }
    return map;
  }, [validMoves]);

  const selectableSquares = useMemo(
    () => new Set(Object.keys(legalMovesByFrom)),
    [legalMovesByFrom]
  );

  const selectedTargets = useMemo(() => {
    if (!selectedSquare) return new Set<string>();
    return new Set((legalMovesByFrom[selectedSquare] ?? []).map((move) => move.to));
  }, [legalMovesByFrom, selectedSquare]);

  const canUserMove = currentTurn === 'user' && !isAvatarThinking;
  const lastMoveFrom = state.lastMove?.slice(0, 2) ?? null;
  const lastMoveTo = state.lastMove?.slice(2, 4) ?? null;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSelectedSquare(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.fen, currentTurn]);

  const handleSquareClick = (square: string) => {
    if (!canUserMove) return;

    if (selectedSquare) {
      const options = legalMovesByFrom[selectedSquare] ?? [];
      const candidates = options.filter((option) => option.to === square);
      if (candidates.length > 0) {
        const preferred = candidates.find((move) => move.promotion === 'q') ?? candidates[0];
        onUserMove(preferred.uci);
        setSelectedSquare(null);
        return;
      }
    }

    const piece = chess.get(square as Square);
    if (piece && piece.color === state.userColor && selectableSquares.has(square)) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid grid-cols-8 gap-1 rounded-xl border border-white/10 bg-black/20 p-2">
        {squares.map((square) => {
          const piece = chess.get(square as Square);
          const isDark = isDarkSquare(square);
          const isSelected = selectedSquare === square;
          const isTarget = selectedTargets.has(square);
          const isLastMove = square === lastMoveFrom || square === lastMoveTo;
          const isSelectable = selectableSquares.has(square);

          return (
            <button
              key={square}
              type="button"
              onClick={() => handleSquareClick(square)}
              disabled={!canUserMove}
              aria-label={`Square ${square}${piece ? ` occupied by ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
              className={cn(
                'h-10 w-10 rounded-md border text-2xl transition-colors sm:h-11 sm:w-11',
                isDark
                  ? 'border-amber-900/40 bg-amber-900/50'
                  : 'border-amber-100/40 bg-amber-100/90 text-black',
                !canUserMove && 'opacity-85',
                canUserMove && isSelectable && 'ring-1 ring-accent/25',
                isTarget && 'ring-2 ring-accent/65',
                isSelected && 'ring-2 ring-sky-400',
                isLastMove && 'ring-2 ring-emerald-400/70',
              )}
            >
              {piece ? pieceGlyph(piece.type, piece.color) : ''}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-text-secondary">
        {isAvatarThinking
          ? 'Avatar is calculating...'
          : canUserMove
            ? 'Select a piece, then pick a destination.'
            : "Waiting for avatar's move..."}
      </div>
    </div>
  );
}

export default ChessBoard;
