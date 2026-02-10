// # Phase 2.3 COMPLETE - 2026-02-07
import { useEffect, useMemo } from 'react';
import { Grid3x3, Type, Sparkles, Spade } from 'lucide-react';
import type { GameCategory } from '../games/types';
import { getGame } from '../games/registry';
import { useGame } from '../hooks/useGame';
import { useGameCatalogStore } from '../store/gameCatalogStore';
import { useUserStore } from '../store/userStore';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { cn } from '../lib/utils';

interface GameSelectorProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<GameCategory, typeof Grid3x3> = {
  board: Grid3x3,
  card: Spade,
  word: Type,
  creative: Sparkles,
};

function GameSelector({ open, onClose }: GameSelectorProps) {
  const currentAgent = useUserStore((state) => state.currentAgent);
  const catalogGames = useGameCatalogStore((state) => state.games);
  const loading = useGameCatalogStore((state) => state.loading);
  const error = useGameCatalogStore((state) => state.error);
  const refreshCatalog = useGameCatalogStore((state) => state.refresh);
  const { startGame } = useGame();

  useEffect(() => {
    if (!open || !currentAgent?.id) return;
    void refreshCatalog(currentAgent.id);
  }, [open, currentAgent?.id, refreshCatalog]);

  const games = useMemo(() => {
    return catalogGames
      .map((catalogGame) => {
        const module = getGame(catalogGame.id);
        if (!module) return null;
        return {
          id: module.id,
          name: module.name,
          description: catalogGame.description || module.description,
          category: module.category,
        };
      })
      .filter((game): game is { id: string; name: string; description: string; category: GameCategory } => game !== null);
  }, [catalogGames]);

  const handleSelect = (gameId: string) => {
    startGame(gameId);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="w-[min(92vw,420px)] p-5">
        <DialogTitle className="font-display text-lg">Play a Game</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a game to play with your avatar.
        </DialogDescription>

        <div className="mt-4 grid grid-cols-1 gap-3">
          {loading && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-text-secondary">
              Loading games...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-text-secondary">
              {error}
            </div>
          )}

          {!loading && !error && games.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-text-secondary">
              No games available yet.
            </div>
          )}

          {games.map((game) => {
            const Icon = CATEGORY_ICONS[game.category] ?? Grid3x3;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => handleSelect(game.id)}
                className={cn(
                  'w-full rounded-xl border border-white/10 bg-bg-tertiary/40 px-4 py-3 text-left transition-colors',
                  'hover:bg-bg-tertiary/70 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-bg-secondary/80 text-text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-sm text-text-primary">{game.name}</div>
                    <div className="text-xs text-text-secondary">{game.description}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
                      {game.category} game
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GameSelector;
