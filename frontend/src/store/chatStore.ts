import { create } from 'zustand';
import type { Message, MessageMeta } from '../types';
import type { EmotionDebug } from '../utils/api';
import type { SoulMoodSnapshot } from '../types/soulWindow';

let _messageNonce = 0;

function _newLocalMessageId(): string {
  _messageNonce += 1;
  return `local-${Date.now()}-${_messageNonce}`;
}

interface ChatState {
  messages: Message[];
  addMessage: (role: 'user' | 'assistant' | 'system', content: string, meta?: Partial<MessageMeta>) => string;
  updateMessage: (id: number | string, updates: Partial<Message>) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;
  streamingContent: string;
  setStreamingContent: (content: string) => void;
  lastEmotionDebug: EmotionDebug | null;
  setLastEmotionDebug: (data: EmotionDebug | null) => void;
  currentMood: SoulMoodSnapshot | null;
  setCurrentMood: (snapshot: SoulMoodSnapshot | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],

  addMessage: (role, content, meta = {}) => {
    const id = _newLocalMessageId();
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
  
  clearMessages: () => set({ messages: [], currentMood: null }),
  
  streamingContent: '',
  setStreamingContent: (content) => set({ streamingContent: content }),

  lastEmotionDebug: null,
  setLastEmotionDebug: (data) => set({ lastEmotionDebug: data }),

  currentMood: null,
  setCurrentMood: (snapshot) => set({ currentMood: snapshot }),
}));
