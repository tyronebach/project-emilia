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
  ttsEnabled: false,
  setTtsEnabled: (enabled) => set({ ttsEnabled: enabled }),
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
    if (!renderer?.expressionController) return;

    // Route all commands through BehaviorPlanner
    console.log('[Store] handleIntent:', command.intent, command.mood, command.energy);
    /* eslint-disable @typescript-eslint/no-explicit-any -- runtime strings from backend */
    renderer.expressionController.handleIntent({
      intent: (command.intent ?? 'neutral') as any,
      mood: command.mood as any,
      energy: command.energy as any,
    } as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  },
}));

export { useUserStore } from './userStore';
