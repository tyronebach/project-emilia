import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetGameRegistryForTests,
  getGame,
  hasGameLoader,
  loadGame,
  preloadGame,
} from './registry';

describe('games registry lazy loading', () => {
  beforeEach(() => {
    __resetGameRegistryForTests();
  });

  it('loads a module from the manifest and caches it', async () => {
    expect(getGame('tic-tac-toe')).toBeUndefined();

    const module = await loadGame('tic-tac-toe');

    expect(module.id).toBe('tic-tac-toe');
    expect(getGame('tic-tac-toe')).toBe(module);
    expect(hasGameLoader('tic-tac-toe')).toBe(true);
  });

  it('fails when no loader is configured', async () => {
    expect(hasGameLoader('not-real')).toBe(false);
    await expect(loadGame('not-real')).rejects.toThrow('No loader configured');
  });

  it('preload resolves and keeps the module available', async () => {
    await preloadGame('tic-tac-toe');
    expect(getGame('tic-tac-toe')).toBeDefined();
  });
});
