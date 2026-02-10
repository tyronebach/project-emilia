import type { GameLoaderContract, GameModule } from './types';
import { gameLoaderManifest } from './loaders/manifest';

type LoaderImport = {
  default?: GameLoaderContract;
  loaderContract?: GameLoaderContract;
};

const registry = new Map<string, GameModule>();
const pendingLoads = new Map<string, Promise<GameModule>>();

function resolveContract(gameId: string, loaded: LoaderImport): GameLoaderContract {
  const contract = loaded.default ?? loaded.loaderContract;
  if (!contract) {
    throw new Error(`[games] Loader contract missing for "${gameId}".`);
  }
  if (contract.id !== gameId) {
    throw new Error(`[games] Loader contract mismatch for "${gameId}". Received "${contract.id}".`);
  }
  return contract;
}

export function hasGameLoader(gameId: string): boolean {
  return Object.prototype.hasOwnProperty.call(gameLoaderManifest, gameId);
}

export function getGame(id: string): GameModule | undefined {
  return registry.get(id);
}

export async function loadGame(gameId: string): Promise<GameModule> {
  const existing = registry.get(gameId);
  if (existing) {
    return existing;
  }

  const inFlight = pendingLoads.get(gameId);
  if (inFlight) {
    return inFlight;
  }

  const loader = gameLoaderManifest[gameId];
  if (!loader) {
    throw new Error(`[games] No loader configured for "${gameId}".`);
  }

  const loadPromise = (async () => {
    const loaded = await loader();
    const contract = resolveContract(gameId, loaded);
    const module = await contract.load();
    if (module.id !== gameId) {
      throw new Error(`[games] Loaded module mismatch for "${gameId}". Received "${module.id}".`);
    }
    registry.set(gameId, module);
    return module;
  })();

  pendingLoads.set(gameId, loadPromise);

  try {
    return await loadPromise;
  } finally {
    pendingLoads.delete(gameId);
  }
}

export async function preloadGame(gameId: string): Promise<void> {
  await loadGame(gameId);
}

export function __resetGameRegistryForTests(): void {
  if (import.meta.env.MODE !== 'test') return;
  registry.clear();
  pendingLoads.clear();
}
