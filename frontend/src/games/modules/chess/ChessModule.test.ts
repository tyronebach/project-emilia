import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChessState } from './ChessModule';
import { chessModule, normalizeChessMove } from './ChessModule';

function makeState(overrides: Partial<ChessState> = {}): ChessState {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '',
    userColor: 'w',
    avatarColor: 'b',
    lastMove: null,
    moveCount: 0,
    ...overrides,
  };
}

describe('chessModule strict mode pilot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes legal opening moves for the side to move only', () => {
    const state = chessModule.createGame({ firstPlayer: 'user' });
    const userMoves = chessModule.getValidMoves(state, 'user');

    expect(userMoves).toHaveLength(20);
    expect(userMoves).toContain('e2e4');
    expect(chessModule.getValidMoves(state, 'avatar')).toEqual([]);
  });

  it('rejects illegal moves in strict mode', () => {
    const state = makeState();
    const result = chessModule.applyMove(state, 'e2e5', 'user');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Illegal move.');
  });

  it('applies a legal move and updates turn + move metadata', () => {
    const state = makeState();
    const result = chessModule.applyMove(state, 'e2e4', 'user');

    expect(result.success).toBe(true);
    expect(result.newState.lastMove).toBe('e2e4');
    expect(result.newState.moveCount).toBe(1);
    expect(result.status.displayText).toContain("Avatar's turn");
  });

  it('defaults to queen promotion when promotion piece is omitted', () => {
    const state = makeState({
      fen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
      pgn: '',
      userColor: 'w',
      avatarColor: 'b',
    });

    const result = chessModule.applyMove(state, 'a7a8', 'user');
    expect(result.success).toBe(true);
    expect(result.newState.lastMove).toBe('a7a8q');
  });

  it('detects checkmate winner in strict status evaluation', () => {
    const state = makeState({
      fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      pgn: '1. f3 e5 2. g4 Qh4#',
      lastMove: 'd8h4',
      moveCount: 4,
    });

    const status = chessModule.getStatus(state);
    expect(status.isOver).toBe(true);
    expect(status.winner).toBe('avatar');
  });

  it('engine selects a mate-in-one under high difficulty', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const state = makeState({
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',
      pgn: '1. f3 e5 2. g4',
      moveCount: 3,
    });

    const move = chessModule.engineMove?.(state, 1);
    expect(move).toBe('d8h4');
  });

  it('normalizes and parses UCI-style move text', () => {
    expect(normalizeChessMove('e2-e4')).toBe('e2e4');
    expect(normalizeChessMove('E7E8=Q')).toBe('e7e8q');

    const parsed = chessModule.parseMove('[move:e2e4]', ['e2e4', 'd2d4']);
    expect(parsed).toBe('e2e4');
    expect(chessModule.parseMove('[move:e2e5]', ['e2e4'])).toBeNull();
  });
});
