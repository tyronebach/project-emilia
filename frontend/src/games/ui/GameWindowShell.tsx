import { useCallback, useEffect, useRef } from 'react';
import { GripHorizontal, Maximize2, Minimize2, RotateCcw, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

type GameWindowShellProps = {
  title: string;
  minimized: boolean;
  x: number;
  y: number;
  z: number;
  statusText: string;
  moveCount: number;
  highlight?: boolean;
  onMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  onBringToFront: () => void;
  onToggleMinimized: () => void;
  onClose: () => void;
  onReset?: () => void;
  children?: React.ReactNode;
};

type DragState = {
  originX: number;
  originY: number;
  pointerStartX: number;
  pointerStartY: number;
};

function GameWindowShell({
  title,
  minimized,
  x,
  y,
  z,
  statusText,
  moveCount,
  highlight = false,
  onMove,
  onDragEnd,
  onBringToFront,
  onToggleMinimized,
  onClose,
  onReset,
  children,
}: GameWindowShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const moveListenerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const endListenerRef = useRef<(() => void) | null>(null);
  const prevMinimizedRef = useRef(minimized);

  const cleanupDragListeners = useCallback(() => {
    if (moveListenerRef.current) {
      window.removeEventListener('pointermove', moveListenerRef.current);
      moveListenerRef.current = null;
    }
    if (endListenerRef.current) {
      window.removeEventListener('pointerup', endListenerRef.current);
      window.removeEventListener('pointercancel', endListenerRef.current);
      endListenerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupDragListeners();
    };
  }, [cleanupDragListeners]);

  useEffect(() => {
    if (prevMinimizedRef.current === minimized) return;

    if (minimized) {
      toggleButtonRef.current?.focus();
    } else {
      shellRef.current?.focus();
    }
    prevMinimizedRef.current = minimized;
  }, [minimized]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    onBringToFront();
  }, [onBringToFront]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    onBringToFront();
    dragRef.current = {
      originX: x,
      originY: y,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
    };

    const handleDragMove = (pointerEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = pointerEvent.clientX - drag.pointerStartX;
      const deltaY = pointerEvent.clientY - drag.pointerStartY;
      onMove(drag.originX + deltaX, drag.originY + deltaY);
    };

    const handleDragEnd = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      cleanupDragListeners();
      onDragEnd();
    };

    moveListenerRef.current = handleDragMove;
    endListenerRef.current = handleDragEnd;

    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', handleDragEnd);
  }, [cleanupDragListeners, onBringToFront, onDragEnd, onMove, x, y]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      onToggleMinimized();
    }
  }, [onClose, onToggleMinimized]);

  const shellWidth = minimized ? 'min(82vw, 300px)' : 'min(92vw, 420px)';

  return (
    <div
      ref={shellRef}
      tabIndex={0}
      aria-label={`${title} game window`}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className={cn(
        'fixed z-[30] rounded-2xl border border-white/10 bg-bg-secondary/90 p-4 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.8)] backdrop-blur-md outline-none',
        highlight && 'ring-2 ring-accent/30',
      )}
      style={{
        transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
        zIndex: z,
        width: shellWidth,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          data-testid="game-window-drag-handle"
          onPointerDown={handleDragStart}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 touch-none active:cursor-grabbing"
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-text-secondary">Game</div>
            <div className="truncate font-display text-lg text-text-primary">{title}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onReset && !minimized && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onReset}
              title="Play again"
              className="text-text-secondary hover:text-text-primary"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            ref={toggleButtonRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggleMinimized}
            title={minimized ? 'Restore game window' : 'Minimize game window'}
            className="text-text-secondary hover:text-text-primary"
          >
            {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            title="Close game"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <div className="mt-4">
          {children}
        </div>
      )}

      <div className={cn('mt-4 flex items-center justify-between text-xs text-text-secondary', minimized && 'mt-3')}>
        <span>{statusText}</span>
        <span>{moveCount} moves</span>
      </div>
    </div>
  );
}

export default GameWindowShell;
