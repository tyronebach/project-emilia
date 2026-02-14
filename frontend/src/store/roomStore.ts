import { create } from 'zustand';
import type { Room, RoomAgent, RoomMessage } from '../utils/api';
import type { AvatarCommand } from '../types';
import type { SoulMoodSnapshot } from '../types/soulWindow';

interface RoomStoreState {
  currentRoomId: string | null;
  currentRoom: Room | null;
  agents: RoomAgent[];
  messages: RoomMessage[];
  streamingByAgent: Record<string, string>;
  focusedAgentId: string | null;
  avatarCommandByAgent: Record<string, AvatarCommand>;
  lastAvatarEventAtByAgent: Record<string, number>;
  emotionByAgent: Record<string, SoulMoodSnapshot>;

  setCurrentRoom: (room: Room | null) => void;
  setAgents: (agents: RoomAgent[]) => void;
  setMessages: (messages: RoomMessage[]) => void;
  addMessage: (message: RoomMessage) => void;
  appendStreamingContent: (agentId: string, content: string) => void;
  clearStreamingContent: (agentId: string) => void;
  resetStreaming: () => void;
  setFocusedAgent: (agentId: string | null) => void;
  setAgentAvatarCommand: (agentId: string, command: AvatarCommand, timestamp?: number) => void;
  clearAgentAvatarCommand: (agentId: string) => void;
  resetRoomAvatars: () => void;
  setAgentEmotion: (agentId: string, snapshot: SoulMoodSnapshot) => void;
  clearAgentEmotion: (agentId: string) => void;
  clearRoomState: () => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  currentRoomId: null,
  currentRoom: null,
  agents: [],
  messages: [],
  streamingByAgent: {},
  focusedAgentId: null,
  avatarCommandByAgent: {},
  lastAvatarEventAtByAgent: {},
  emotionByAgent: {},

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

  setAgentAvatarCommand: (agentId, command, timestamp) => set((state) => ({
    avatarCommandByAgent: {
      ...state.avatarCommandByAgent,
      [agentId]: command,
    },
    lastAvatarEventAtByAgent: {
      ...state.lastAvatarEventAtByAgent,
      [agentId]: timestamp ?? Date.now() / 1000,
    },
  })),

  clearAgentAvatarCommand: (agentId) => set((state) => {
    const nextCommands = { ...state.avatarCommandByAgent };
    delete nextCommands[agentId];

    const nextTimestamps = { ...state.lastAvatarEventAtByAgent };
    delete nextTimestamps[agentId];

    return {
      avatarCommandByAgent: nextCommands,
      lastAvatarEventAtByAgent: nextTimestamps,
    };
  }),

  resetRoomAvatars: () => set({
    avatarCommandByAgent: {},
    lastAvatarEventAtByAgent: {},
  }),

  setAgentEmotion: (agentId, snapshot) => set((state) => ({
    emotionByAgent: {
      ...state.emotionByAgent,
      [agentId]: snapshot,
    },
  })),

  clearAgentEmotion: (agentId) => set((state) => {
    const next = { ...state.emotionByAgent };
    delete next[agentId];
    return { emotionByAgent: next };
  }),

  clearRoomState: () => set({
    currentRoomId: null,
    currentRoom: null,
    agents: [],
    messages: [],
    streamingByAgent: {},
    focusedAgentId: null,
    avatarCommandByAgent: {},
    lastAvatarEventAtByAgent: {},
    emotionByAgent: {},
  }),
}));
