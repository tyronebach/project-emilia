import { create } from 'zustand';
import type { AppStatus, AvatarState, AvatarCommand } from '../types';
import type { AvatarRenderer } from '../avatar/AvatarRenderer';

interface AppState {
  // Session
  sessionId: string;
  setSessionId: (id: string) => void;
  clearSessionId: () => void;

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
  ttsVoiceId: string;
  setTtsVoiceId: (voiceId: string) => void;

  // Voice input
  handsFreeEnabled: boolean;
  setHandsFreeEnabled: (enabled: boolean) => void;

  // Avatar
  avatarState: AvatarState | null;
  setAvatarState: (state: AvatarState | null) => void;
  avatarRenderer: AvatarRenderer | null;
  setAvatarRenderer: (renderer: AvatarRenderer | null) => void;
  applyAvatarCommand: (command: AvatarCommand) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Session - kept only in memory, not persisted to avoid issues when switching users/agents
  sessionId: '',
  setSessionId: (id) => {
    // Allow empty string for new sessions
    if (id === undefined || id === null) {
      console.warn('[Store] Attempted to set undefined/null sessionId');
      return;
    }
    set({ sessionId: id });
  },
  clearSessionId: () => set({ sessionId: '' }),

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
  ttsVoiceId: '',
  setTtsVoiceId: (voiceId) => set({ ttsVoiceId: voiceId }),

  // Voice input
  handsFreeEnabled: localStorage.getItem('emilia-voice-handsfree') === 'true',
  setHandsFreeEnabled: (enabled) => {
    localStorage.setItem('emilia-voice-handsfree', String(enabled));
    set({ handsFreeEnabled: enabled });
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

    if (command.animation && renderer.animationPlayer) {
      console.log('[Store] Playing animation:', command.animation);
      renderer.animationPlayer.play(command.animation);
    }
  },
}));

export { useUserStore } from './userStore';
