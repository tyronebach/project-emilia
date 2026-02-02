import { create } from 'zustand';
import type { AppStatus, AvatarState, AvatarCommand } from '../types';
import type { AvatarRenderer } from '../avatar/AvatarRenderer';

interface AppState {
  // Session
  sessionId: string;
  setSessionId: (id: string) => void;

  // Status
  status: AppStatus;
  setStatus: (status: AppStatus) => void;

  // Errors
  errors: string[];
  addError: (error: string) => void;
  clearErrors: () => void;

  // TTS
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;

  // Avatar
  avatarState: AvatarState | null;
  setAvatarState: (state: AvatarState | null) => void;
  avatarRenderer: AvatarRenderer | null;
  setAvatarRenderer: (renderer: AvatarRenderer | null) => void;
  applyAvatarCommand: (command: AvatarCommand) => void;
}

// Safe localStorage getter
const getStoredSessionId = (): string => {
  try {
    const stored = localStorage.getItem('emilia-session-id');
    return stored || '';  // No hardcoded default - must come from backend
  } catch {
    return '';
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  // Session
  sessionId: getStoredSessionId(),
  setSessionId: (id) => {
    // Allow empty string for new sessions
    if (id === undefined || id === null) {
      console.warn('[Store] Attempted to set undefined/null sessionId');
      return;
    }
    try {
      if (id) {
        localStorage.setItem('emilia-session-id', id);
      } else {
        // Clear localStorage for new sessions
        localStorage.removeItem('emilia-session-id');
      }
    } catch (e) {
      console.warn('[Store] Failed to update sessionId in localStorage:', e);
    }
    set({ sessionId: id });
  },

  // Status
  status: 'ready',
  setStatus: (status) => set({ status }),

  // Errors
  errors: [],
  addError: (error) => set((state) => ({
    errors: [...state.errors.slice(-9), error] // Keep last 10
  })),
  clearErrors: () => set({ errors: [] }),

  // TTS
  ttsEnabled: localStorage.getItem('emilia-tts-enabled') === 'true',
  setTtsEnabled: (enabled) => {
    localStorage.setItem('emilia-tts-enabled', String(enabled));
    set({ ttsEnabled: enabled });
  },

  // Avatar
  avatarState: null,
  setAvatarState: (state) => set({ avatarState: state }),
  avatarRenderer: null,
  setAvatarRenderer: (renderer) => set({ avatarRenderer: renderer }),
  applyAvatarCommand: (command) => {
    console.log('[Store] applyAvatarCommand:', command);
    set({ avatarState: command });

    const renderer = get().avatarRenderer;
    console.log('[Store] renderer:', !!renderer);
    if (!renderer) return;

    if (command.mood && renderer.expressionController) {
      console.log('[Store] Setting mood:', command.mood, command.intensity || 1.0);
      renderer.expressionController.setMood(command.mood, command.intensity || 1.0);
    }

    if (command.animation && renderer.animationTrigger) {
      console.log('[Store] Triggering animation:', command.animation);
      renderer.animationTrigger.trigger(command.animation);
    }
  },
}));

export { useUserStore } from './userStore';
