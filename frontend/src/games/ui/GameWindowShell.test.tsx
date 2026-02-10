import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GameWindowShell from './GameWindowShell';

function renderShell(minimized = false) {
  const onMove = vi.fn();
  const onDragEnd = vi.fn();
  const onBringToFront = vi.fn();
  const onToggleMinimized = vi.fn();
  const onClose = vi.fn();
  const onReset = vi.fn();

  const view = render(
    <GameWindowShell
      title="Tic-Tac-Toe"
      minimized={minimized}
      x={100}
      y={120}
      z={30}
      statusText="Your turn"
      moveCount={3}
      onMove={onMove}
      onDragEnd={onDragEnd}
      onBringToFront={onBringToFront}
      onToggleMinimized={onToggleMinimized}
      onClose={onClose}
      onReset={onReset}
    >
      <div>Game body</div>
    </GameWindowShell>
  );

  return {
    view,
    onMove,
    onDragEnd,
    onBringToFront,
    onToggleMinimized,
    onClose,
  };
}

describe('GameWindowShell', () => {
  it('toggles minimized and restores content lifecycle', () => {
    const { onToggleMinimized, view } = renderShell(false);

    expect(screen.getByText('Game body')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Minimize game window'));
    expect(onToggleMinimized).toHaveBeenCalledTimes(1);

    view.rerender(
      <GameWindowShell
        title="Tic-Tac-Toe"
        minimized
        x={100}
        y={120}
        z={30}
        statusText="Your turn"
        moveCount={3}
        onMove={vi.fn()}
        onDragEnd={vi.fn()}
        onBringToFront={vi.fn()}
        onToggleMinimized={onToggleMinimized}
        onClose={vi.fn()}
      >
        <div>Game body</div>
      </GameWindowShell>
    );

    expect(screen.queryByText('Game body')).toBeNull();
    fireEvent.click(screen.getByTitle('Restore game window'));
    expect(onToggleMinimized).toHaveBeenCalledTimes(2);
  });

  it('emits drag callbacks and keyboard controls', () => {
    const {
      onMove,
      onDragEnd,
      onBringToFront,
      onToggleMinimized,
      onClose,
    } = renderShell(false);

    const dragHandle = screen.getByTestId('game-window-drag-handle');
    fireEvent.pointerDown(dragHandle, { button: 0, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 170 });
    fireEvent.pointerUp(window);

    expect(onBringToFront).toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledWith(140, 170);
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    const shell = screen.getByLabelText('Tic-Tac-Toe game window');
    fireEvent.keyDown(shell, { key: 'm' });
    expect(onToggleMinimized).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(shell, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
