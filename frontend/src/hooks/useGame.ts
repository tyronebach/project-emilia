// # Phase 1.7 COMPLETE - 2026-02-08
// # Phase 2.5 FIX - 2026-02-07: Move isAvatarThinking to Zustand store
import { useCallback } from 'react';
import { getGame } from '../games/registry';
import type { GameConfig, GameContext, GameModule, MoveProviderType } from '../games/types';
import { useGameStore } from '../store/gameStore';

const MAX_VALID_MOVES = 30;
const DEFAULT_DIFFICULTY = 0.5;

function resolveMoveProvider(module: GameModule, config: GameConfig): MoveProviderType {
  return config.moveProvider ?? module.defaultMoveProvider;
}

export function useGame() {
  const activeGameId = useGameStore((state) => state.activeGameId);
  const gameState = useGameStore((state) => state.gameState);
  const currentTurn = useGameStore((state) => state.currentTurn);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const moveHistory = useGameStore((state) => state.moveHistory);
  const gameConfig = useGameStore((state) => state.gameConfig);
  const isAvatarThinking = useGameStore((state) => state.isAvatarThinking);
  const setIsAvatarThinking = useGameStore((state) => state.setIsAvatarThinking);

  const handleAvatarTurn = useCallback(() => {
    const {
      activeGameId: activeId,
      gameState: state,
      currentTurn: turn,
      gameStatus: status,
      gameConfig: config,
    } = useGameStore.getState();

    if (!activeId || state == null || status.isOver || turn !== 'avatar') {
      setIsAvatarThinking(false);
      return;
    }

    const module = getGame(activeId);
    if (!module) {
      console.warn('[useGame] Game module not found:', activeId);
      setIsAvatarThinking(false);
      return;
    }

    const moveProvider = resolveMoveProvider(module, config);

    if (moveProvider === 'llm') {
      setIsAvatarThinking(true);
      return;
    }

    const validMoves = module.getValidMoves(state, 'avatar');
    if (!validMoves.length) {
      console.warn('[useGame] No valid moves for avatar.');
      setIsAvatarThinking(false);
      return;
    }

    let move: unknown | null = null;

    if (moveProvider === 'engine' && module.engineMove) {
      move = module.engineMove(state, config.difficulty ?? DEFAULT_DIFFICULTY);
    }

    if (move == null) {
      const index = Math.floor(Math.random() * validMoves.length);
      move = validMoves[index];
    }

    if (move == null) {
      setIsAvatarThinking(false);
      return;
    }

    const applied = useGameStore.getState().applyAvatarMove(move);
    if (!applied) {
      console.warn('[useGame] Failed to apply avatar move.');
    }

    setIsAvatarThinking(false);
  }, [setIsAvatarThinking]);

  const startGame = useCallback((gameId: string, config?: GameConfig) => {
    setIsAvatarThinking(false);
    useGameStore.getState().startGame(gameId, config);
    handleAvatarTurn();
  }, [handleAvatarTurn, setIsAvatarThinking]);

  const makeUserMove = useCallback((move: unknown) => {
    const success = useGameStore.getState().applyUserMove(move);
    if (success) {
      handleAvatarTurn();
    }
    return success;
  }, [handleAvatarTurn]);

  const getGameContext = useCallback((): GameContext | null => {
    if (!activeGameId || gameState == null) return null;

    const module = getGame(activeGameId);
    if (!module) return null;

    const moveProvider = resolveMoveProvider(module, gameConfig);
    const lastUserMoveRecord = [...moveHistory].reverse().find((record) => record.player === 'user');
    const lastAvatarMoveRecord = [...moveHistory].reverse().find((record) => record.player === 'avatar');

    const lastUserMove = lastUserMoveRecord ? module.formatMove(lastUserMoveRecord.move) : null;

    let avatarMove: string | null = null;
    if (moveProvider !== 'llm' && lastAvatarMoveRecord) {
      avatarMove = module.formatMove(lastAvatarMoveRecord.move);
    }

    let validMoves: string[] | null = null;
    if (!gameStatus.isOver && moveProvider === 'llm' && currentTurn === 'avatar') {
      const moves = module.getValidMoves(gameState, 'avatar');
      validMoves = moves
        .slice(0, MAX_VALID_MOVES)
        .map((move) => module.formatMove(move));
    }

    return {
      gameId: activeGameId,
      state: module.serializeState(gameState, 'avatar'),
      lastUserMove,
      avatarMove,
      validMoves,
      status: gameStatus.isOver ? 'game_over' : 'in_progress',
      moveCount: moveHistory.length,
      promptInstructions: module.promptInstructions,
    };
  }, [activeGameId, gameState, currentTurn, gameStatus.isOver, moveHistory, gameConfig]);

  const handleAvatarResponse = useCallback((moveTag?: string) => {
    const {
      activeGameId: activeId,
      gameState: state,
      currentTurn: turn,
      gameStatus: status,
      gameConfig: config,
    } = useGameStore.getState();

    if (!activeId || state == null) {
      setIsAvatarThinking(false);
      return;
    }

    const module = getGame(activeId);
    if (!module) {
      setIsAvatarThinking(false);
      return;
    }

    if (status.isOver || turn !== 'avatar') {
      setIsAvatarThinking(false);
      return;
    }

    const moveProvider = resolveMoveProvider(module, config);
    if (moveProvider !== 'llm') {
      setIsAvatarThinking(false);
      return;
    }

    const validMoves = module.getValidMoves(state, 'avatar');
    if (!validMoves.length) {
      setIsAvatarThinking(false);
      return;
    }

    let selectedMove: unknown | null = null;
    const trimmedMove = moveTag?.trim();

    if (trimmedMove) {
      selectedMove = module.parseMove(trimmedMove, validMoves);
      if (selectedMove == null && !trimmedMove.includes('[move:')) {
        selectedMove = module.parseMove(`[move:${trimmedMove}]`, validMoves);
      }
      if (selectedMove == null) {
        const normalized = trimmedMove.toLowerCase();
        const match = validMoves.find((move) => module.formatMove(move).toLowerCase() === normalized);
        if (match !== undefined) {
          selectedMove = match;
        }
      }
    }

    if (selectedMove == null) {
      console.warn('[useGame] LLM returned invalid or missing move, using fallback.');
      if (module.engineMove) {
        selectedMove = module.engineMove(state, config.difficulty ?? DEFAULT_DIFFICULTY);
      } else {
        const index = Math.floor(Math.random() * validMoves.length);
        selectedMove = validMoves[index];
      }
    }

    if (selectedMove == null) {
      setIsAvatarThinking(false);
      return;
    }

    const applied = useGameStore.getState().applyAvatarMove(selectedMove);
    if (!applied) {
      console.warn('[useGame] Failed to apply avatar move.');
    }

    setIsAvatarThinking(false);
  }, [setIsAvatarThinking]);

  return {
    activeGame: activeGameId,
    gameState,
    currentTurn,
    gameStatus,
    moveHistory,
    isAvatarThinking,
    startGame,
    makeUserMove,
    getGameContext,
    handleAvatarResponse,
  };
}

export default useGame;
