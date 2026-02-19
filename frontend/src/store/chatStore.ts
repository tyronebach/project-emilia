import { create } from 'zustand';
import type { Room, RoomAgent } from '../utils/api';
import type { EmotionDebug } from '../utils/api';
import type { AvatarCommand } from '../types';
import type { SoulMoodSnapshot } from '../types/soulWindow';
import type { AgentStatus, ChatMessage, ChatMessageMeta } from '../types/chat';
import { localMessageId } from '../types/chat';

export type { AgentStatus, ChatMessage };

interface ChatState {
  // Room context
  currentRoomId: string | null;
  currentRoom: Room | null;
  agents: RoomAgent[];

  // Messages (unified ChatMessage[])
  messages: ChatMessage[];

  // Per-agent streaming content
  streamingByAgent: Record<string, string>;

  // Per-agent state
  statusByAgent: Record<string, AgentStatus>;
  emotionByAgent: Record<string, SoulMoodSnapshot>;
  avatarCommandByAgent: Record<string, AvatarCommand>;
  lastAvatarEventAtByAgent: Record<string, number>;

  // UI
  focusedAgentId: string | null;
  isChatHistoryOpen: boolean;
  isParticipantsOpen: boolean;

  // Emotion debug (legacy, kept for debug panel)
  lastEmotionDebug: EmotionDebug | null;
  currentMood: SoulMoodSnapshot | null;

  // Room context actions
  setCurrentRoom: (room: Room | null) => void;
  setAgents: (agents: RoomAgent[]) => void;

  // Message actions
  addMessage: (message: ChatMessage) => void;
  /** Convenience: add a user message and return its local ID. */
  addUserMessage: (senderId: string, senderName: string, content: string, roomId: string, opts?: { origin?: string; source?: 'text' | 'voice' }) => string;
  /** Convenience: add an empty assistant (agent) placeholder and return its local ID. */
  addAgentPlaceholder: (agentId: string, agentName: string, roomId: string) => string;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  updateMessageMeta: (id: string, metaUpdates: Partial<ChatMessageMeta>) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;

  // Streaming actions
  appendStreamingContent: (agentId: string, content: string) => void;
  clearStreamingContent: (agentId: string) => void;
  resetStreaming: () => void;

  // Per-agent status
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  clearAgentStatus: (agentId: string) => void;
  resetAgentStatuses: () => void;

  // Per-agent emotion
  setAgentEmotion: (agentId: string, snapshot: SoulMoodSnapshot) => void;
  clearAgentEmotion: (agentId: string) => void;

  // Per-agent avatar commands
  setAgentAvatarCommand: (agentId: string, command: AvatarCommand, timestamp?: number) => void;
  clearAgentAvatarCommand: (agentId: string) => void;
  resetRoomAvatars: () => void;

  // Legacy emotion debug
  setLastEmotionDebug: (data: EmotionDebug | null) => void;
  setCurrentMood: (snapshot: SoulMoodSnapshot | null) => void;

  // UI
  setFocusedAgentId: (agentId: string | null) => void;
  setChatHistoryOpen: (open: boolean) => void;
  setParticipantsOpen: (open: boolean) => void;

  // Computed helpers
  getActiveAgents: () => RoomAgent[];
  getSpeakingAgent: () => RoomAgent | null;

  // Full cleanup
  clearRoomState: () => void;
}

const INITIAL_ROOM_STATE = {
  currentRoomId: null as string | null,
  currentRoom: null as Room | null,
  agents: [] as RoomAgent[],
  messages: [] as ChatMessage[],
  streamingByAgent: {} as Record<string, string>,
  statusByAgent: {} as Record<string, AgentStatus>,
  emotionByAgent: {} as Record<string, SoulMoodSnapshot>,
  avatarCommandByAgent: {} as Record<string, AvatarCommand>,
  lastAvatarEventAtByAgent: {} as Record<string, number>,
  focusedAgentId: null as string | null,
  lastEmotionDebug: null as EmotionDebug | null,
  currentMood: null as SoulMoodSnapshot | null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...INITIAL_ROOM_STATE,
  isChatHistoryOpen: false,
  isParticipantsOpen: false,

  // Room context
  setCurrentRoom: (room) => set({
    currentRoom: room,
    currentRoomId: room?.id ?? null,
  }),

  setAgents: (agents) => set({ agents }),

  // Messages
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  addUserMessage: (senderId, senderName, content, roomId, opts) => {
    const id = localMessageId('user');
    const message: ChatMessage = {
      id,
      room_id: roomId,
      sender_type: 'user',
      sender_id: senderId,
      sender_name: senderName,
      content,
      timestamp: Date.now() / 1000,
      origin: opts?.origin ?? 'chat',
      meta: opts?.source ? { source: opts.source } : undefined,
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return id;
  },

  addAgentPlaceholder: (agentId, agentName, roomId) => {
    const id = localMessageId('agent');
    const message: ChatMessage = {
      id,
      room_id: roomId,
      sender_type: 'agent',
      sender_id: agentId,
      sender_name: agentName,
      content: '',
      timestamp: Date.now() / 1000,
      origin: 'chat',
      meta: { streaming: true },
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return id;
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },

  updateMessageMeta: (id, metaUpdates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? { ...msg, meta: { ...msg.meta, ...metaUpdates } }
          : msg
      ),
    }));
  },

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({
    messages: [],
    currentMood: null,
    emotionByAgent: {},
    statusByAgent: {},
  }),

  // Streaming
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

  // Per-agent status
  setAgentStatus: (agentId, status) => set((state) => ({
    statusByAgent: { ...state.statusByAgent, [agentId]: status },
  })),

  clearAgentStatus: (agentId) => set((state) => {
    const next = { ...state.statusByAgent };
    delete next[agentId];
    return { statusByAgent: next };
  }),

  resetAgentStatuses: () => set({ statusByAgent: {} }),

  // Per-agent emotion
  setAgentEmotion: (agentId, snapshot) => set((state) => ({
    emotionByAgent: { ...state.emotionByAgent, [agentId]: snapshot },
  })),

  clearAgentEmotion: (agentId) => set((state) => {
    const next = { ...state.emotionByAgent };
    delete next[agentId];
    return { emotionByAgent: next };
  }),

  // Per-agent avatar commands
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

  // Legacy emotion debug
  setLastEmotionDebug: (data) => set({ lastEmotionDebug: data }),
  setCurrentMood: (snapshot) => set({ currentMood: snapshot }),

  // UI
  setFocusedAgentId: (agentId) => set({ focusedAgentId: agentId }),
  setChatHistoryOpen: (open) => set({ isChatHistoryOpen: open }),
  setParticipantsOpen: (open) => set({ isParticipantsOpen: open }),

  // Computed helpers
  getActiveAgents: () => {
    const state = get();
    const { agents, statusByAgent, messages } = state;

    const lastMessageTime: Record<string, number> = {};
    for (const msg of messages) {
      if (msg.sender_type === 'agent') {
        lastMessageTime[msg.sender_id] = Math.max(
          lastMessageTime[msg.sender_id] || 0,
          msg.timestamp,
        );
      }
    }

    const statusPriority: Record<AgentStatus, number> = {
      speaking: 4,
      streaming: 3,
      thinking: 2,
      idle: 1,
    };

    return [...agents].sort((a, b) => {
      const statusA = statusByAgent[a.agent_id] || 'idle';
      const statusB = statusByAgent[b.agent_id] || 'idle';

      if (statusPriority[statusA] !== statusPriority[statusB]) {
        return statusPriority[statusB] - statusPriority[statusA];
      }

      const timeA = lastMessageTime[a.agent_id] || 0;
      const timeB = lastMessageTime[b.agent_id] || 0;
      return timeB - timeA;
    });
  },

  getSpeakingAgent: () => {
    const state = get();
    const speakingId = Object.entries(state.statusByAgent)
      .find(([, status]) => status === 'speaking')?.[0];
    return speakingId
      ? state.agents.find((a) => a.agent_id === speakingId) || null
      : null;
  },

  // Full cleanup
  clearRoomState: () => set(INITIAL_ROOM_STATE),
}));
