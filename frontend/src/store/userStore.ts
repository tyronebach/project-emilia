import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, User } from '../utils/api';

interface UserState {
  currentUser: User | null;
  currentAgent: Agent | null;
  setUser: (user: User | null) => void;
  setAgent: (agent: Agent | null) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentAgent: null,
      setUser: (user) => set({ currentUser: user }),
      setAgent: (agent) => set({ currentAgent: agent }),
      logout: () => set({ currentUser: null, currentAgent: null }),
    }),
    {
      name: 'emilia-user-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentAgent: state.currentAgent,
      }),
    }
  )
);

export default useUserStore;
