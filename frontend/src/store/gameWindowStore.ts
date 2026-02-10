import { create } from 'zustand';

export const GAME_WINDOW_LAYOUT = {
  sideMargin: 12,
  topMargin: 72,
  bottomMargin: 156,
  width: 420,
  height: 560,
  minimizedWidth: 300,
  minimizedHeight: 68,
  snapThreshold: 24,
  minWidth: 240,
} as const;

type Viewport = {
  width: number;
  height: number;
};

export type GameWindowState = {
  x: number;
  y: number;
  z: number;
  minimized: boolean;
};

type GameWindowStoreState = {
  windows: Record<string, GameWindowState>;
  viewport: Viewport;
  nextZ: number;
  ensureWindow: (gameId: string) => void;
  bringToFront: (gameId: string) => void;
  moveWindow: (gameId: string, x: number, y: number) => void;
  snapWindow: (gameId: string) => void;
  toggleMinimized: (gameId: string) => void;
  setMinimized: (gameId: string, minimized: boolean) => void;
  closeWindow: (gameId: string) => void;
  setViewport: (width: number, height: number) => void;
  reset: () => void;
};

function getInitialViewport(): Viewport {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function resolveWindowSize(viewport: Viewport, minimized: boolean): { width: number; height: number } {
  const maxUsableWidth = Math.max(
    GAME_WINDOW_LAYOUT.minWidth,
    viewport.width - GAME_WINDOW_LAYOUT.sideMargin * 2,
  );
  const width = Math.min(
    minimized ? GAME_WINDOW_LAYOUT.minimizedWidth : GAME_WINDOW_LAYOUT.width,
    maxUsableWidth,
  );
  const height = minimized ? GAME_WINDOW_LAYOUT.minimizedHeight : GAME_WINDOW_LAYOUT.height;
  return { width, height };
}

function clampWindowPosition(
  x: number,
  y: number,
  viewport: Viewport,
  minimized: boolean,
): { x: number; y: number } {
  const { width, height } = resolveWindowSize(viewport, minimized);

  const maxX = Math.max(
    GAME_WINDOW_LAYOUT.sideMargin,
    viewport.width - width - GAME_WINDOW_LAYOUT.sideMargin,
  );
  const maxY = Math.max(
    GAME_WINDOW_LAYOUT.topMargin,
    viewport.height - height - GAME_WINDOW_LAYOUT.bottomMargin,
  );

  return {
    x: Math.min(Math.max(x, GAME_WINDOW_LAYOUT.sideMargin), maxX),
    y: Math.min(Math.max(y, GAME_WINDOW_LAYOUT.topMargin), maxY),
  };
}

function getCenteredPosition(viewport: Viewport): { x: number; y: number } {
  const { width, height } = resolveWindowSize(viewport, false);
  const centeredX = (viewport.width - width) / 2;
  const centeredY = (viewport.height - height) / 2 - 24;
  return clampWindowPosition(centeredX, centeredY, viewport, false);
}

export const useGameWindowStore = create<GameWindowStoreState>((set, get) => ({
  windows: {},
  viewport: getInitialViewport(),
  nextZ: 20,

  ensureWindow: (gameId) => {
    const state = get();
    if (state.windows[gameId]) {
      return;
    }

    const nextPosition = getCenteredPosition(state.viewport);
    const z = state.nextZ;
    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          x: nextPosition.x,
          y: nextPosition.y,
          z,
          minimized: false,
        },
      },
      nextZ: z + 1,
    }));
  },

  bringToFront: (gameId) => {
    const state = get();
    const existing = state.windows[gameId];
    if (!existing) return;

    const z = state.nextZ;
    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          ...existing,
          z,
        },
      },
      nextZ: z + 1,
    }));
  },

  moveWindow: (gameId, x, y) => {
    const state = get();
    const existing = state.windows[gameId];
    if (!existing) return;

    const clamped = clampWindowPosition(x, y, state.viewport, existing.minimized);
    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          ...existing,
          x: clamped.x,
          y: clamped.y,
        },
      },
    }));
  },

  snapWindow: (gameId) => {
    const state = get();
    const existing = state.windows[gameId];
    if (!existing) return;

    const clamped = clampWindowPosition(existing.x, existing.y, state.viewport, existing.minimized);
    const { width, height } = resolveWindowSize(state.viewport, existing.minimized);
    const maxX = Math.max(
      GAME_WINDOW_LAYOUT.sideMargin,
      state.viewport.width - width - GAME_WINDOW_LAYOUT.sideMargin,
    );
    const maxY = Math.max(
      GAME_WINDOW_LAYOUT.topMargin,
      state.viewport.height - height - GAME_WINDOW_LAYOUT.bottomMargin,
    );

    let snappedX = clamped.x;
    let snappedY = clamped.y;

    if (Math.abs(clamped.x - GAME_WINDOW_LAYOUT.sideMargin) <= GAME_WINDOW_LAYOUT.snapThreshold) {
      snappedX = GAME_WINDOW_LAYOUT.sideMargin;
    } else if (Math.abs(maxX - clamped.x) <= GAME_WINDOW_LAYOUT.snapThreshold) {
      snappedX = maxX;
    }

    if (Math.abs(clamped.y - GAME_WINDOW_LAYOUT.topMargin) <= GAME_WINDOW_LAYOUT.snapThreshold) {
      snappedY = GAME_WINDOW_LAYOUT.topMargin;
    } else if (Math.abs(maxY - clamped.y) <= GAME_WINDOW_LAYOUT.snapThreshold) {
      snappedY = maxY;
    }

    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          ...existing,
          x: snappedX,
          y: snappedY,
        },
      },
    }));
  },

  toggleMinimized: (gameId) => {
    const state = get();
    const existing = state.windows[gameId];
    if (!existing) return;

    const nextMinimized = !existing.minimized;
    const clamped = clampWindowPosition(existing.x, existing.y, state.viewport, nextMinimized);
    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          ...existing,
          minimized: nextMinimized,
          x: clamped.x,
          y: clamped.y,
        },
      },
    }));
  },

  setMinimized: (gameId, minimized) => {
    const state = get();
    const existing = state.windows[gameId];
    if (!existing || existing.minimized === minimized) return;

    const clamped = clampWindowPosition(existing.x, existing.y, state.viewport, minimized);
    set((prev) => ({
      windows: {
        ...prev.windows,
        [gameId]: {
          ...existing,
          minimized,
          x: clamped.x,
          y: clamped.y,
        },
      },
    }));
  },

  closeWindow: (gameId) => {
    set((prev) => {
      if (!prev.windows[gameId]) return prev;
      const nextWindows = { ...prev.windows };
      delete nextWindows[gameId];
      return { windows: nextWindows };
    });
  },

  setViewport: (width, height) => {
    const safeViewport: Viewport = {
      width: Math.max(320, Math.floor(width)),
      height: Math.max(320, Math.floor(height)),
    };

    set((prev) => {
      const nextWindows: Record<string, GameWindowState> = {};
      Object.entries(prev.windows).forEach(([gameId, win]) => {
        const clamped = clampWindowPosition(win.x, win.y, safeViewport, win.minimized);
        nextWindows[gameId] = { ...win, ...clamped };
      });
      return {
        viewport: safeViewport,
        windows: nextWindows,
      };
    });
  },

  reset: () => {
    set({
      windows: {},
      viewport: getInitialViewport(),
      nextZ: 20,
    });
  },
}));

export default useGameWindowStore;
