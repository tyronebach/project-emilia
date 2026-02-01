import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Session management
  const [sessionId, setSessionIdState] = useState(() => {
    return localStorage.getItem('emilia-session-id') || 'thai-emilia-main';
  });
  
  // TTS toggle
  const [ttsEnabled, setTtsEnabledState] = useState(() => {
    return localStorage.getItem('emilia-tts-enabled') === 'true';
  });
  
  // Chat messages
  const [messages, setMessages] = useState([]);
  
  // App status: ready | recording | thinking | speaking | error
  const [status, setStatus] = useState('ready');
  
  // Avatar state (mood, intensity, animation)
  const [avatarState, setAvatarState] = useState(null);
  
  // Reference to avatar renderer instance
  const avatarRendererRef = useRef(null);
  
  // Persist sessionId to localStorage
  const setSessionId = useCallback((id) => {
    setSessionIdState(id);
    localStorage.setItem('emilia-session-id', id);
  }, []);
  
  // Persist ttsEnabled to localStorage
  const setTtsEnabled = useCallback((enabled) => {
    setTtsEnabledState(enabled);
    localStorage.setItem('emilia-tts-enabled', enabled ? 'true' : 'false');
  }, []);
  
  // Add a message to the chat
  const addMessage = useCallback((role, content, meta = {}) => {
    const message = {
      id: Date.now() + Math.random(),
      role, // 'user' | 'assistant'
      content,
      timestamp: new Date(),
      meta
    };
    setMessages(prev => [...prev, message]);
    return message.id;
  }, []);
  
  // Update a message (for streaming)
  const updateMessage = useCallback((id, updates) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);
  
  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Apply avatar command (mood/animation)
  const applyAvatarCommand = useCallback((command) => {
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

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
