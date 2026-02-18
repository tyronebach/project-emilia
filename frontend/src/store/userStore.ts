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
  updateCurrentAgent: (updates: Partial<Agent>) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUser: null,
      currentAgent: null,
      setUser: (user) => {
        // Clear roomId and messages when user changes
        useAppStore.getState().clearRoomId();
        useChatStore.getState().clearMessages();
        // Load user's render settings
        useRenderStore.getState().setCurrentUser(user?.id ?? null);
        set({ currentUser: user });
      },
      setAgent: (agent) => {
        // Clear roomId and messages when agent changes
        useAppStore.getState().clearRoomId();
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
      updateCurrentAgent: (updates) => {
        set((state) => ({
          currentAgent: state.currentAgent
            ? { ...state.currentAgent, ...updates }
            : state.currentAgent,
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
