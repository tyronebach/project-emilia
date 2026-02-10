import { useEffect, useRef, useState } from 'react';
import { getGame, loadGame } from '../registry';
import { useGame } from '../../hooks/useGame';
import { useChat } from '../../hooks/useChat';
import { useGameStore } from '../../store/gameStore';
import { useGameWindowStore } from '../../store/gameWindowStore';
import { useAppStore } from '../../store';
import type { AvatarCommand } from '../../types';
import type { GameModule } from '../types';
import GameWindowShell from './GameWindowShell';

const GAME_EVENT_BEHAVIORS: Record<string, AvatarCommand> = {
  game_start: { intent: 'playful', mood: 'happy', energy: 'medium', intensity: 0.7 },
  avatar_wins: { intent: 'playful', mood: 'happy', energy: 'high', intensity: 0.9 },
  avatar_loses: { intent: 'embarrassed', mood: 'sad', energy: 'low', intensity: 0.4 },
  draw: { intent: 'agreement', mood: 'neutral', energy: 'medium', intensity: 0.5 },
};

function GameWindowManager() {
  const activeGameId = useGameStore((state) => state.activeGameId);
  const gameState = useGameStore((state) => state.gameState);
  const currentTurn = useGameStore((state) => state.currentTurn);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const moveHistory = useGameStore((state) => state.moveHistory);
  const gameConfig = useGameStore((state) => state.gameConfig);

  const { makeUserMove, isAvatarThinking, startGame } = useGame();
  const { sendMessage } = useChat();
  const applyAvatarCommand = useAppStore((state) => state.applyAvatarCommand);

  const ensureWindow = useGameWindowStore((state) => state.ensureWindow);
  const setViewport = useGameWindowStore((state) => state.setViewport);
  const bringToFront = useGameWindowStore((state) => state.bringToFront);
  const moveWindow = useGameWindowStore((state) => state.moveWindow);
  const snapWindow = useGameWindowStore((state) => state.snapWindow);
  const toggleMinimized = useGameWindowStore((state) => state.toggleMinimized);
  const closeWindow = useGameWindowStore((state) => state.closeWindow);
  const windowState = useGameWindowStore((state) => (
    activeGameId ? state.windows[activeGameId] : undefined
  ));

  const wasThinking = useRef(false);
  const wasGameOver = useRef(false);
  const wasActive = useRef(false);
  const [module, setModule] = useState<GameModule | null>(null);

  useEffect(() => {
    if (!activeGameId) return;
    ensureWindow(activeGameId);
    bringToFront(activeGameId);
  }, [activeGameId, ensureWindow, bringToFront]);

  useEffect(() => {
    const scheduleModuleUpdate = (nextModule: GameModule | null, cancelledRef: { value: boolean }) => {
      queueMicrotask(() => {
        if (!cancelledRef.value) {
          setModule(nextModule);
        }
      });
    };

    const cancelledRef = { value: false };

    if (!activeGameId) {
      scheduleModuleUpdate(null, cancelledRef);
      return () => {
        cancelledRef.value = true;
      };
    }

    const cached = getGame(activeGameId);
    if (cached) {
      scheduleModuleUpdate(cached, cancelledRef);
      return () => {
        cancelledRef.value = true;
      };
    }

    scheduleModuleUpdate(null, cancelledRef);
    void loadGame(activeGameId)
      .then((loaded) => {
        if (!cancelledRef.value) {
          setModule(loaded);
        }
      })
      .catch((error) => {
        if (!cancelledRef.value) {
          console.warn('[GameWindowManager] Failed to load game module:', activeGameId, error);
          setModule(null);
        }
      });

    return () => {
      cancelledRef.value = true;
    };
  }, [activeGameId]);

  useEffect(() => {
    const syncViewport = () => {
      setViewport(window.innerWidth, window.innerHeight);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [setViewport]);

  useEffect(() => {
    if (activeGameId && !wasActive.current) {
      applyAvatarCommand(GAME_EVENT_BEHAVIORS.game_start);
    }
    wasActive.current = Boolean(activeGameId);
  }, [activeGameId, applyAvatarCommand]);

  useEffect(() => {
    if (isAvatarThinking && !wasThinking.current) {
      void sendMessage('Your turn!', { runtimeTrigger: true });
    }
    wasThinking.current = isAvatarThinking;
  }, [isAvatarThinking, sendMessage]);

  useEffect(() => {
    if (gameStatus.isOver && !wasGameOver.current && activeGameId) {
      const outcome = gameStatus.winner === 'user'
        ? 'I won!'
        : gameStatus.winner === 'avatar'
          ? 'You won!'
          : "It's a draw!";
      void sendMessage(outcome, { runtimeTrigger: true });

      const eventKey = gameStatus.winner === 'avatar'
        ? 'avatar_wins'
        : gameStatus.winner === 'user'
          ? 'avatar_loses'
          : 'draw';
      applyAvatarCommand(GAME_EVENT_BEHAVIORS[eventKey]);
    }
    wasGameOver.current = gameStatus.isOver;
  }, [gameStatus.isOver, gameStatus.winner, activeGameId, sendMessage, applyAvatarCommand]);

  if (!activeGameId || !module || gameState == null || !windowState) {
    return null;
  }

  const GameComponent = module.component;
  const validMoves = currentTurn === 'user' && !gameStatus.isOver
    ? module.getValidMoves(gameState, 'user')
    : [];

  const handleClose = () => {
    useGameStore.getState().resetGame();
    closeWindow(activeGameId);
  };

  const handleReset = () => {
    void startGame(activeGameId, gameConfig);
  };

  return (
    <GameWindowShell
      title={module.name}
      minimized={windowState.minimized}
      x={windowState.x}
      y={windowState.y}
      z={windowState.z}
      statusText={gameStatus.displayText}
      moveCount={moveHistory.length}
      highlight={isAvatarThinking}
      onMove={(x, y) => moveWindow(activeGameId, x, y)}
      onDragEnd={() => snapWindow(activeGameId)}
      onBringToFront={() => bringToFront(activeGameId)}
      onToggleMinimized={() => toggleMinimized(activeGameId)}
      onClose={handleClose}
      onReset={handleReset}
    >
      <GameComponent
        state={gameState}
        currentTurn={currentTurn}
        validMoves={validMoves}
        onUserMove={(move) => {
          makeUserMove(move);
        }}
        isAvatarThinking={isAvatarThinking}
        moveHistory={moveHistory}
      />
    </GameWindowShell>
  );
}

export default GameWindowManager;
