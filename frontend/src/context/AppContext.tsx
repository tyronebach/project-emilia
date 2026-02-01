/**
 * AppContext - Compatibility layer using Zustand stores
 * This provides backward compatibility while using Zustand under the hood
 */

import { createContext, useContext, useRef, ReactNode, MutableRefObject, useEffect } from 'react';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import type { AppStatus, Message, AvatarState, AvatarCommand } from '../types';
import type { AvatarRenderer } from '../avatar/AvatarRenderer';

interface AppContextType {
  // Session
  sessionId: string;
  setSessionId: (id: string) => void;
  
  // TTS
  ttsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
  
  // Messages
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (role: 'user' | 'assistant', content: string, meta?: Partial<Message['meta']>) => number;
  updateMessage: (id: number | string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  
  // Status
  status: AppStatus;
  setStatus: (status: AppStatus) => void;
  
  // Avatar
  avatarState: AvatarState | null;
  setAvatarState: (state: AvatarState | null) => void;
  avatarRendererRef: MutableRefObject<AvatarRenderer | null>;
  applyAvatarCommand: (command: AvatarCommand) => void;
}

const AppContext = createContext<AppContextType | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // Get values from Zustand stores
  const sessionId = useAppStore((state) => state.sessionId);
  const setSessionId = useAppStore((state) => state.setSessionId);
  const status = useAppStore((state) => state.status);
  const setStatus = useAppStore((state) => state.setStatus);
  const ttsEnabled = useAppStore((state) => state.ttsEnabled);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);
  const avatarState = useAppStore((state) => state.avatarState);
  const setAvatarState = useAppStore((state) => state.setAvatarState);
  const setAvatarRenderer = useAppStore((state) => state.setAvatarRenderer);
  const applyAvatarCommand = useAppStore((state) => state.applyAvatarCommand);
  
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setMessagesStore = useChatStore((state) => state.setMessages);
  
  // Ref for avatar renderer (kept for backward compatibility)
  const avatarRendererRef = useRef<AvatarRenderer | null>(null);
  
  // Sync ref with store
  useEffect(() => {
    const current = avatarRendererRef.current;
    setAvatarRenderer(current);
  }, [setAvatarRenderer]);
  
  // Wrapper for setMessages to support both formats
  const setMessages = (messagesOrFn: Message[] | ((prev: Message[]) => Message[])) => {
    if (typeof messagesOrFn === 'function') {
      const currentMessages = useChatStore.getState().messages;
      setMessagesStore(messagesOrFn(currentMessages));
    } else {
      setMessagesStore(messagesOrFn);
    }
  };
  
  // Debug logging
  useEffect(() => {
    console.log('[AppContext] Status:', status);
  }, [status]);
  
  useEffect(() => {
    console.log('[AppContext] SessionId:', sessionId);
  }, [sessionId]);
  
  return (
    <AppContext.Provider value={{
      // Session
      sessionId,
      setSessionId,
      
      // TTS
      ttsEnabled,
      setTtsEnabled,
      
      // Messages
      messages,
      setMessages,
      addMessage,
      updateMessage,
      clearMessages,
      
      // Status
      status,
      setStatus,
      
      // Avatar
      avatarState,
      setAvatarState,
      avatarRendererRef,
      applyAvatarCommand,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
