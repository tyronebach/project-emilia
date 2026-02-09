import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DebugPanelStore {
  toggles: Record<string, boolean>;
  isEnabled: (id: string, defaultEnabled?: boolean) => boolean;
  setEnabled: (id: string, enabled: boolean) => void;
}

export const useDebugPanelStore = create<DebugPanelStore>()(
  persist(
    (set, get) => ({
      toggles: {},
      isEnabled: (id, defaultEnabled = true) => {
        const { toggles } = get();
        return id in toggles ? toggles[id] : defaultEnabled;
      },
      setEnabled: (id, enabled) => {
        set((state) => ({
          toggles: { ...state.toggles, [id]: enabled },
        }));
      },
    }),
    {
      name: 'emilia-debug-panel-toggles',
      partialize: (state) => ({ toggles: state.toggles }),
    },
  ),
);
