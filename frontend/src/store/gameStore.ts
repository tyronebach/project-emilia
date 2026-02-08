// # Phase 1.2 COMPLETE - 2026-02-08
import { create } from 'zustand';
import type { GameConfig, GameStatus, MoveRecord, PlayerRole, Turn } from '../games/types';
import { getGame } from '../games/registry';

interface GameStoreState {
  // State
  activeGameId: string | null;
  gameState: unknown;
  currentTurn: Turn;
  gameStatus: GameStatus;
  moveHistory: MoveRecord[];
  gameConfig: GameConfig;
  isAvatarThinking: boolean;

  // Actions
  startGame: (gameId: string, config?: GameConfig) => void;
  applyUserMove: (move: unknown) => boolean;
  applyAvatarMove: (move: unknown) => boolean;
  endGame: () => void;
  resetGame: () => void;
  setIsAvatarThinking: (thinking: boolean) => void;

  // Internal
  _setGameState: (state: unknown) => void;
  _setTurn: (turn: Turn) => void;
  _setStatus: (status: GameStatus) => void;
  _addMoveRecord: (record: MoveRecord) => void;
}

const defaultStatus: GameStatus = {
  isOver: false,
  winner: null,
  displayText: 'Not started',
};

const endedStatus: GameStatus = {
  isOver: true,
  winner: null,
  displayText: 'Game ended',
};

const defaultConfig: GameConfig = {
  firstPlayer: 'user',
};

function resolveConfig(config?: GameConfig): GameConfig {
  if (!config) {
    return { ...defaultConfig };
  }

  return {
    ...config,
    firstPlayer: config.firstPlayer ?? 'user',
  };
}

export const useGameStore = create<GameStoreState>((set, get) => {
  const applyMove = (player: PlayerRole, move: unknown): boolean => {
    const { activeGameId, gameState, currentTurn, gameStatus } = get();

    if (!activeGameId) {
      console.warn('[GameStore] No active game to apply move.');
      return false;
    }

    if (gameStatus.isOver) {
      console.warn('[GameStore] Game is already over.');
      return false;
    }

    if (currentTurn !== player) {
      console.warn('[GameStore] Not this player\'s turn:', player);
      return false;
    }

    const module = getGame(activeGameId);
    if (!module) {
      console.warn('[GameStore] Game module not found:', activeGameId);
      return false;
    }

    const result = module.applyMove(gameState, move, player);

    if (!result.success) {
      console.warn('[GameStore] Invalid move:', result.error ?? 'Unknown error');
      return false;
    }

    const record: MoveRecord = {
      player,
      move,
      description: result.moveDescription,
      stateAfter: result.newState,
      timestamp: Date.now(),
    };

    const nextTurn: Turn = result.status.isOver
      ? null
      : player === 'user'
        ? 'avatar'
        : 'user';

    set((state) => ({
      gameState: result.newState,
      gameStatus: result.status,
      currentTurn: nextTurn,
      moveHistory: [...state.moveHistory, record],
    }));

    return true;
  };

  return {
    // State
    activeGameId: null,
    gameState: null,
    currentTurn: null,
    gameStatus: { ...defaultStatus },
    moveHistory: [],
    gameConfig: { ...defaultConfig },
    isAvatarThinking: false,

    // Actions
    startGame: (gameId, config) => {
      const module = getGame(gameId);
      if (!module) {
        console.warn('[GameStore] Game module not found:', gameId);
        return;
      }

      const resolvedConfig = resolveConfig(config);
      const initialState = module.createGame(resolvedConfig);
      const status = module.getStatus(initialState);
      const firstPlayer = status.isOver ? null : (resolvedConfig.firstPlayer ?? 'user');

      set({
        activeGameId: gameId,
        gameState: initialState,
        currentTurn: firstPlayer,
        gameStatus: status,
        moveHistory: [],
        gameConfig: resolvedConfig,
      });
    },
    applyUserMove: (move) => applyMove('user', move),
    applyAvatarMove: (move) => applyMove('avatar', move),
    endGame: () => {
      if (!get().activeGameId) {
        return;
      }

      set({
        gameStatus: { ...endedStatus },
        currentTurn: null,
      });
    },
    resetGame: () => set({
      activeGameId: null,
      gameState: null,
      currentTurn: null,
      gameStatus: { ...defaultStatus },
      moveHistory: [],
      gameConfig: { ...defaultConfig },
      isAvatarThinking: false,
    }),
    setIsAvatarThinking: (thinking) => set({ isAvatarThinking: thinking }),

    // Internal
    _setGameState: (state) => set({ gameState: state }),
    _setTurn: (turn) => set({ currentTurn: turn }),
    _setStatus: (status) => set({ gameStatus: status }),
    _addMoveRecord: (record) => set((state) => ({
      moveHistory: [...state.moveHistory, record],
    })),
  };
});
