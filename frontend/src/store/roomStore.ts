import { create } from 'zustand';
import type { Room, RoomAgent, RoomMessage } from '../utils/api';

interface RoomStoreState {
  currentRoomId: string | null;
  currentRoom: Room | null;
  agents: RoomAgent[];
  messages: RoomMessage[];
  streamingByAgent: Record<string, string>;
  focusedAgentId: string | null;

  setCurrentRoom: (room: Room | null) => void;
  setAgents: (agents: RoomAgent[]) => void;
  setMessages: (messages: RoomMessage[]) => void;
  addMessage: (message: RoomMessage) => void;
  appendStreamingContent: (agentId: string, content: string) => void;
  clearStreamingContent: (agentId: string) => void;
  resetStreaming: () => void;
  setFocusedAgent: (agentId: string | null) => void;
  clearRoomState: () => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  currentRoomId: null,
  currentRoom: null,
  agents: [],
  messages: [],
  streamingByAgent: {},
  focusedAgentId: null,

  setCurrentRoom: (room) => set({
    currentRoom: room,
    currentRoomId: room?.id ?? null,
  }),

  setAgents: (agents) => set({ agents }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  appendStreamingContent: (agentId, content) => set((state) => ({
    streamingByAgent: {
      ...state.streamingByAgent,
      [agentId]: `${state.streamingByAgent[agentId] ?? ''}${content}`,
    },
  })),

  clearStreamingContent: (agentId) => set((state) => {
    const next = { ...state.streamingByAgent };
    delete next[agentId];
    return { streamingByAgent: next };
  }),

  resetStreaming: () => set({ streamingByAgent: {} }),

  setFocusedAgent: (agentId) => set({ focusedAgentId: agentId }),

  clearRoomState: () => set({
    currentRoomId: null,
    currentRoom: null,
    agents: [],
    messages: [],
    streamingByAgent: {},
    focusedAgentId: null,
  }),
}));
