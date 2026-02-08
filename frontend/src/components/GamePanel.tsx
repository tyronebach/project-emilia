// # Phase 2.2 COMPLETE - 2026-02-07
// # Phase 2.5 FIX - 2026-02-07: Auto-trigger chat for LLM avatar turn
// # Upgrade: Game event avatar emotion fallbacks - 2026-02-07
import { useMemo, useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useAppStore } from '../store';
import { getGame } from '../games/registry';
import { useGame } from '../hooks/useGame';
import { useChat } from '../hooks/useChat';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { AvatarCommand } from '../types';

/**
 * Fallback avatar behaviors for game events.
 * Applied when the LLM doesn't provide mood/intent tags.
 * See LLM-INTEGRATION.md "Avatar Emotional Reactions to Game Events".
 */
const GAME_EVENT_BEHAVIORS: Record<string, AvatarCommand> = {
  game_start:   { intent: 'playful',     mood: 'happy',   energy: 'medium', intensity: 0.7 },
  avatar_wins:  { intent: 'playful',     mood: 'happy',   energy: 'high',   intensity: 0.9 },
  avatar_loses: { intent: 'embarrassed', mood: 'sad',     energy: 'low',    intensity: 0.4 },
  draw:         { intent: 'agreement',   mood: 'neutral', energy: 'medium', intensity: 0.5 },
};

function GamePanel() {
  const activeGameId = useGameStore((state) => state.activeGameId);
  const gameState = useGameStore((state) => state.gameState);
  const currentTurn = useGameStore((state) => state.currentTurn);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const moveHistory = useGameStore((state) => state.moveHistory);
  const gameConfig = useGameStore((state) => state.gameConfig);
  const { makeUserMove, isAvatarThinking, startGame } = useGame();
  const { sendMessage } = useChat();
  const applyAvatarCommand = useAppStore((s) => s.applyAvatarCommand);
  const wasThinking = useRef(false);
  const wasGameOver = useRef(false);
  const wasActive = useRef(false);

  // Fallback avatar emotion when a game starts
  useEffect(() => {
    if (activeGameId && !wasActive.current) {
      applyAvatarCommand(GAME_EVENT_BEHAVIORS.game_start);
    }
    wasActive.current = Boolean(activeGameId);
  }, [activeGameId, applyAvatarCommand]);

  // Auto-trigger chat when avatar needs to make a move (LLM mode)
  useEffect(() => {
    if (isAvatarThinking && !wasThinking.current) {
      sendMessage('Your turn!');
    }
    wasThinking.current = isAvatarThinking;
  }, [isAvatarThinking, sendMessage]);

  // Auto-trigger chat when game ends so avatar can react + fallback emotion
  useEffect(() => {
    if (gameStatus.isOver && !wasGameOver.current && activeGameId) {
      const outcome = gameStatus.winner === 'user'
        ? 'I won!'
        : gameStatus.winner === 'avatar'
          ? 'You won!'
          : "It's a draw!";
      sendMessage(outcome);

      // Apply fallback avatar emotion for game outcome
      const eventKey = gameStatus.winner === 'avatar'
        ? 'avatar_wins'
        : gameStatus.winner === 'user'
          ? 'avatar_loses'
          : 'draw';
      applyAvatarCommand(GAME_EVENT_BEHAVIORS[eventKey]);
    }
    wasGameOver.current = gameStatus.isOver;
  }, [gameStatus.isOver, gameStatus.winner, activeGameId, sendMessage, applyAvatarCommand]);

  const module = useMemo(() => {
    if (!activeGameId) return null;
    return getGame(activeGameId) ?? null;
  }, [activeGameId]);

  if (!activeGameId || !module || gameState == null) return null;

  const GameComponent = module.component;

  const validMoves = currentTurn === 'user' && !gameStatus.isOver
    ? module.getValidMoves(gameState, 'user')
    : [];

  const handleClose = () => useGameStore.getState().resetGame();
  const handleReset = () => startGame(activeGameId, gameConfig);

  return (
    <div
      className={cn(
        'fixed left-1/2 top-1/2 z-[25] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-bg-secondary/85 p-4 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.8)] backdrop-blur-md',
        isAvatarThinking && 'ring-2 ring-accent/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-text-secondary">Game</div>
          <div className="font-display text-lg text-text-primary">{module.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleReset}
            title="Play again"
            className="text-text-secondary hover:text-text-primary"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            title="Close game"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4">
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
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-text-secondary">
        <span>{gameStatus.displayText}</span>
        <span>{moveHistory.length} moves</span>
      </div>

      {gameStatus.isOver && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button type="button" variant="secondary" onClick={handleReset}>
            Play again
          </Button>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export default GamePanel;
