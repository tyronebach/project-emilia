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

export const useAppStore = create<AppState>((set, get) => ({
  // Session
  sessionId: localStorage.getItem('emilia-session-id') || 'thai-emilia-main',
  setSessionId: (id) => {
    localStorage.setItem('emilia-session-id', id);
    set({ sessionId: id });
  },
  
  // Status
  status: 'ready',
  setStatus: (status) => set({ status }),
  
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
    set({ avatarState: command });
    
    const renderer = get().avatarRenderer;
    if (!renderer) return;
    
    if (command.mood && renderer.expressionController) {
      renderer.expressionController.setMood(command.mood, command.intensity || 1.0);
    }
    
    if (command.animation && renderer.animationTrigger) {
      renderer.animationTrigger.trigger(command.animation);
    }
  },
}));
