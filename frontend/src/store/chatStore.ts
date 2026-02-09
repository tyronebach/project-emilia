import { create } from 'zustand';
import type { Message, MessageMeta } from '../types';
import type { EmotionDebug } from '../utils/api';

interface ChatState {
  messages: Message[];
  addMessage: (role: 'user' | 'assistant', content: string, meta?: Partial<MessageMeta>) => number;
  updateMessage: (id: number | string, updates: Partial<Message>) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  streamingContent: string;
  setStreamingContent: (content: string) => void;
  lastEmotionDebug: EmotionDebug | null;
  setLastEmotionDebug: (data: EmotionDebug | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  
  addMessage: (role, content, meta = {}) => {
    const id = Date.now() + Math.random();
    const message: Message = {
      id,
      role,
      content,
      timestamp: new Date(),
      meta
    };
    set((state) => ({
      messages: [...state.messages, message]
    }));
    return id;
  },
  
  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map(msg =>
        msg.id === id ? { ...msg, ...updates } : msg
      )
    }));
  },
  
  setMessages: (messages) => set({ messages }),
  
  clearMessages: () => set({ messages: [] }),
  
  streamingContent: '',
  setStreamingContent: (content) => set({ streamingContent: content }),

  lastEmotionDebug: null,
  setLastEmotionDebug: (data) => set({ lastEmotionDebug: data }),
}));
