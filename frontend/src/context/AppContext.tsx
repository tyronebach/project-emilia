import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode, MutableRefObject } from 'react';
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
  // Session management
  const [sessionId, setSessionIdState] = useState(() => {
    return localStorage.getItem('emilia-session-id') || 'thai-emilia-main';
  });
  
  // TTS toggle
  const [ttsEnabled, setTtsEnabledState] = useState(() => {
    return localStorage.getItem('emilia-tts-enabled') === 'true';
  });
  
  // Chat messages
  const [messages, setMessages] = useState<Message[]>([]);
  
  // App status: ready | recording | thinking | speaking | error
  const [status, setStatus] = useState<AppStatus>('ready');
  
  // Avatar state (mood, intensity, animation)
  const [avatarState, setAvatarState] = useState<AvatarState | null>(null);
  
  // Reference to avatar renderer instance
  const avatarRendererRef = useRef<AvatarRenderer | null>(null);
  
  // Persist sessionId to localStorage
  const setSessionId = useCallback((id: string) => {
    setSessionIdState(id);
    localStorage.setItem('emilia-session-id', id);
  }, []);
  
  // Persist ttsEnabled to localStorage
  const setTtsEnabled = useCallback((enabled: boolean) => {
    setTtsEnabledState(enabled);
    localStorage.setItem('emilia-tts-enabled', enabled ? 'true' : 'false');
  }, []);
  
  // Add a message to the chat
  const addMessage = useCallback((role: 'user' | 'assistant', content: string, meta: Partial<Message['meta']> = {}) => {
    const message: Message = {
      id: Date.now() + Math.random(),
      role,
      content,
      timestamp: new Date(),
      meta
    };
    setMessages(prev => [...prev, message]);
    return message.id as number;
  }, []);
  
  // Update a message (for streaming)
  const updateMessage = useCallback((id: number | string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);
  
  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Apply avatar command (mood/animation)
  const applyAvatarCommand = useCallback((command: AvatarCommand) => {
    setAvatarState(command);
    
    const renderer = avatarRendererRef.current;
    if (!renderer) return;
    
    if (command.mood && renderer.expressionController) {
      renderer.expressionController.setMood(command.mood, command.intensity || 1.0);
    }
    
    if (command.animation && renderer.animationTrigger) {
      renderer.animationTrigger.trigger(command.animation);
    }
  }, []);
  
  // Debug logging
  useEffect(() => {
    console.log('[AppContext] Status:', status);
  }, [status]);
  
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
