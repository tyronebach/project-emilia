import { create } from 'zustand';
import type { Message, MessageMeta } from '../types';
import type { Agent, EmotionDebug } from '../utils/api';
import type { SoulMoodSnapshot } from '../types/soulWindow';

let _messageNonce = 0;

function _newLocalMessageId(): string {
  _messageNonce += 1;
  return `local-${Date.now()}-${_messageNonce}`;
}

// Agent status in a session
export type AgentStatus = 'idle' | 'thinking' | 'speaking';

// Extended message with agent info
export interface MultiAgentMessage extends Message {
  agentId?: string;  // Which agent sent this (for assistant messages)
}

interface ChatState {
  // Messages
  messages: MultiAgentMessage[];
  addMessage: (role: 'user' | 'assistant' | 'system', content: string, meta?: Partial<MessageMeta>, agentId?: string) => string;
  updateMessage: (id: number | string, updates: Partial<MultiAgentMessage>) => void;
  setMessages: (messages: MultiAgentMessage[]) => void;
  clearMessages: () => void;
  
  // Streaming
  streamingContent: string;
  setStreamingContent: (content: string) => void;
  streamingAgentId: string | null;
  setStreamingAgentId: (agentId: string | null) => void;
  
  // Emotion (legacy single-agent)
  lastEmotionDebug: EmotionDebug | null;
  setLastEmotionDebug: (data: EmotionDebug | null) => void;
  currentMood: SoulMoodSnapshot | null;
  setCurrentMood: (snapshot: SoulMoodSnapshot | null) => void;
  
  // Multi-agent state
  roomAgents: Agent[];
  setRoomAgents: (agents: Agent[]) => void;
  addRoomAgent: (agent: Agent) => void;
  removeRoomAgent: (agentId: string) => void;
  
  // Per-agent status (thinking/speaking/idle)
  agentStatus: Record<string, AgentStatus>;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  clearAgentStatuses: () => void;
  
  // Per-agent mood
  agentMoods: Record<string, SoulMoodSnapshot>;
  setAgentMood: (agentId: string, mood: SoulMoodSnapshot) => void;
  
  // UI state
  focusedAgentId: string | null;
  setFocusedAgentId: (agentId: string | null) => void;
  isChatHistoryOpen: boolean;
  setChatHistoryOpen: (open: boolean) => void;
  isParticipantsOpen: boolean;
  setParticipantsOpen: (open: boolean) => void;
  
  // Computed helpers
  getActiveAgents: () => Agent[];  // Agents sorted by recent activity
  getSpeakingAgent: () => Agent | null;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Messages
  messages: [],

  addMessage: (role, content, meta = {}, agentId) => {
    const id = _newLocalMessageId();
    const message: MultiAgentMessage = {
      id,
      role,
      content,
      timestamp: new Date(),
      meta,
      agentId: role === 'assistant' ? agentId : undefined,
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
  
  clearMessages: () => set({ 
    messages: [], 
    currentMood: null,
    agentMoods: {},
    agentStatus: {},
  }),
  
  // Streaming
  streamingContent: '',
  setStreamingContent: (content) => set({ streamingContent: content }),
  streamingAgentId: null,
  setStreamingAgentId: (agentId) => set({ streamingAgentId: agentId }),

  // Emotion (legacy)
  lastEmotionDebug: null,
  setLastEmotionDebug: (data) => set({ lastEmotionDebug: data }),
  currentMood: null,
  setCurrentMood: (snapshot) => set({ currentMood: snapshot }),
  
  // Multi-agent state
  roomAgents: [],
  setRoomAgents: (agents) => set({ roomAgents: agents }),
  addRoomAgent: (agent) => set((state) => ({
    roomAgents: [...state.roomAgents.filter(a => a.id !== agent.id), agent]
  })),
  removeRoomAgent: (agentId) => set((state) => ({
    roomAgents: state.roomAgents.filter(a => a.id !== agentId),
    // Also clear status/mood for removed agent
    agentStatus: Object.fromEntries(
      Object.entries(state.agentStatus).filter(([id]) => id !== agentId)
    ),
    agentMoods: Object.fromEntries(
      Object.entries(state.agentMoods).filter(([id]) => id !== agentId)
    ),
  })),
  
  // Per-agent status
  agentStatus: {},
  setAgentStatus: (agentId, status) => set((state) => ({
    agentStatus: { ...state.agentStatus, [agentId]: status }
  })),
  clearAgentStatuses: () => set({ agentStatus: {} }),
  
  // Per-agent mood
  agentMoods: {},
  setAgentMood: (agentId, mood) => set((state) => ({
    agentMoods: { ...state.agentMoods, [agentId]: mood }
  })),
  
  // UI state
  focusedAgentId: null,
  setFocusedAgentId: (agentId) => set({ focusedAgentId: agentId }),
  isChatHistoryOpen: false,
  setChatHistoryOpen: (open) => set({ isChatHistoryOpen: open }),
  isParticipantsOpen: false,
  setParticipantsOpen: (open) => set({ isParticipantsOpen: open }),
  
  // Computed helpers
  getActiveAgents: () => {
    const state = get();
    const { roomAgents, agentStatus, messages } = state;
    
    // Sort by: speaking > thinking > idle, then by last message time
    const lastMessageTime: Record<string, number> = {};
    for (const msg of messages) {
      if (msg.agentId && msg.role === 'assistant') {
        lastMessageTime[msg.agentId] = Math.max(
          lastMessageTime[msg.agentId] || 0,
          msg.timestamp.getTime()
        );
      }
    }
    
    const statusPriority: Record<AgentStatus, number> = {
      speaking: 3,
      thinking: 2,
      idle: 1,
    };
    
    return [...roomAgents].sort((a, b) => {
      const statusA = agentStatus[a.id] || 'idle';
      const statusB = agentStatus[b.id] || 'idle';
      
      // First by status
      if (statusPriority[statusA] !== statusPriority[statusB]) {
        return statusPriority[statusB] - statusPriority[statusA];
      }
      
      // Then by last message time
      const timeA = lastMessageTime[a.id] || 0;
      const timeB = lastMessageTime[b.id] || 0;
      return timeB - timeA;
    });
  },
  
  getSpeakingAgent: () => {
    const state = get();
    const speakingId = Object.entries(state.agentStatus)
      .find(([, status]) => status === 'speaking')?.[0];
    return speakingId 
      ? state.roomAgents.find(a => a.id === speakingId) || null 
      : null;
  },
}));
