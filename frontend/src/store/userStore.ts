import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, User } from '../utils/api';
import { useAppStore } from './index';
import { useChatStore } from './chatStore';
import { useRenderStore } from './renderStore';

interface UserState {
  currentUser: User | null;
  currentAgent: Agent | null;
  setUser: (user: User | null) => void;
  setAgent: (agent: Agent | null) => void;
  clearUser: () => void;
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
        // Load user's render settings
        useRenderStore.getState().setCurrentUser(user?.id ?? null);
        set({ currentUser: user });
      },
      setAgent: (agent) => {
        // Clear sessionId and messages when agent changes
        useAppStore.getState().clearSessionId();
        useChatStore.getState().clearMessages();
        set({ currentAgent: agent });
      },
      clearUser: () => {
        // Reset to default render settings when user context is removed.
        useRenderStore.getState().setCurrentUser(null);
        set({ currentUser: null, currentAgent: null });
      },
      updatePreferences: (preferences) => {
        set((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, preferences }
            : state.currentUser,
        }));
      },
      logout: () => {
        useRenderStore.getState().setCurrentUser(null);
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
