import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, User } from '../utils/api';
import { useAppStore } from './index';

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
      setUser: (user) => {
        // Clear sessionId when user changes
        useAppStore.getState().clearSessionId();
        set({ currentUser: user });
      },
      setAgent: (agent) => {
        // Clear sessionId when agent changes
        useAppStore.getState().clearSessionId();
        set({ currentAgent: agent });
      },
      logout: () => {
        // Clear sessionId on logout
        useAppStore.getState().clearSessionId();
        set({ currentUser: null, currentAgent: null });
      },
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
