import type { GameLoaderContract } from '../types';

export type GameLoaderImport = () => Promise<{ default: GameLoaderContract }>;

export const gameLoaderManifest: Record<string, GameLoaderImport> = {
  chess: () => import('../modules/chess'),
  'tic-tac-toe': () => import('../modules/tic-tac-toe'),
};
