import { beforeEach, describe, expect, test } from 'vitest';
import { GAME_WINDOW_LAYOUT, useGameWindowStore } from './gameWindowStore';

function resetWindowStore() {
  useGameWindowStore.setState({
    windows: {},
    viewport: { width: 1280, height: 720 },
    nextZ: 20,
  });
}

describe('gameWindowStore', () => {
  beforeEach(() => {
    resetWindowStore();
  });

  test('creates and tracks a window', () => {
    const store = useGameWindowStore.getState();
    store.ensureWindow('tic-tac-toe');

    const win = useGameWindowStore.getState().windows['tic-tac-toe'];
    expect(win).toBeDefined();
    expect(win.minimized).toBe(false);
    expect(win.z).toBe(20);
  });

  test('clamps movement to viewport bounds', () => {
    const store = useGameWindowStore.getState();
    store.ensureWindow('tic-tac-toe');
    store.moveWindow('tic-tac-toe', -500, -800);

    const win = useGameWindowStore.getState().windows['tic-tac-toe'];
    expect(win.x).toBe(GAME_WINDOW_LAYOUT.sideMargin);
    expect(win.y).toBe(GAME_WINDOW_LAYOUT.topMargin);
  });

  test('snaps a dragged window to nearby edges', () => {
    const store = useGameWindowStore.getState();
    store.ensureWindow('tic-tac-toe');

    store.moveWindow('tic-tac-toe', GAME_WINDOW_LAYOUT.sideMargin + 10, GAME_WINDOW_LAYOUT.topMargin + 8);
    store.snapWindow('tic-tac-toe');

    const win = useGameWindowStore.getState().windows['tic-tac-toe'];
    expect(win.x).toBe(GAME_WINDOW_LAYOUT.sideMargin);
    expect(win.y).toBe(GAME_WINDOW_LAYOUT.topMargin);
  });

  test('keeps minimized windows in bounds after viewport shrink', () => {
    const store = useGameWindowStore.getState();
    store.ensureWindow('tic-tac-toe');
    store.toggleMinimized('tic-tac-toe');
    store.moveWindow('tic-tac-toe', 1200, 800);
    store.setViewport(420, 520);

    const win = useGameWindowStore.getState().windows['tic-tac-toe'];
    expect(win.minimized).toBe(true);
    expect(win.x).toBeGreaterThanOrEqual(GAME_WINDOW_LAYOUT.sideMargin);
    expect(win.y).toBeGreaterThanOrEqual(GAME_WINDOW_LAYOUT.topMargin);
  });
});
