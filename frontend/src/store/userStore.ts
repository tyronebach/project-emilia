import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, User } from '../utils/api';
import { useAppStore } from './index';
import { useChatStore } from './chatStore';

interface UserState {
  currentUser: User | null;
  currentAgent: Agent | null;
  setUser: (user: User | null) => void;
  setAgent: (agent: Agent | null) => void;
  updatePreferences: (preferences: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentAgent: null,
      setUser: (user) => {
        // Clear sessionId and messages when user changes
        useAppStore.getState().clearSessionId();
        useChatStore.getState().clearMessages();
        set({ currentUser: user });
      },
      setAgent: (agent) => {
        // Clear sessionId and messages when agent changes
        useAppStore.getState().clearSessionId();
        useChatStore.getState().clearMessages();
        set({ currentAgent: agent });
      },
      updatePreferences: (preferences) => {
        set((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, preferences }
            : state.currentUser,
        }));
      },
      logout: () => {
        // Clear sessionId and messages on logout
        useAppStore.getState().clearSessionId();
        useChatStore.getState().clearMessages();
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
