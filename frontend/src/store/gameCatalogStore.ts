import { create } from 'zustand';
import { getGameCatalog, type GameCatalogItem } from '../utils/api';

interface GameCatalogState {
  games: GameCatalogItem[];
  loadedForAgentId: string | null;
  loading: boolean;
  hasFetched: boolean;
  error: string | null;
  refresh: (agentId: string) => Promise<void>;
  clear: () => void;
}

export const useGameCatalogStore = create<GameCatalogState>((set) => ({
  games: [],
  loadedForAgentId: null,
  loading: false,
  hasFetched: false,
  error: null,

  refresh: async (agentId) => {
    set({ loading: true, error: null });
    try {
      const games = await getGameCatalog();
      set({ games, loadedForAgentId: agentId, loading: false, hasFetched: true, error: null });
    } catch (error) {
      set({
        loadedForAgentId: agentId,
        loading: false,
        hasFetched: true,
        error: error instanceof Error ? error.message : 'Failed to fetch game catalog',
      });
    }
  },

  clear: () => set({ games: [], loadedForAgentId: null, loading: false, hasFetched: false, error: null }),
}));

export default useGameCatalogStore;
