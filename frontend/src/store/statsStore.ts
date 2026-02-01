import { create } from 'zustand';

export interface StateLogEntry {
  timestamp: Date;
  state: string;
  text: string;
}

interface StatsState {
  // Cumulative stats
  messageCount: number;
  totalTokens: number;
  totalLatency: number;
  latencyCount: number;
  
  // State log
  stateLog: StateLogEntry[];
  
  // Actions
  updateStats: (data: { processing_ms?: number; usage?: { total_tokens?: number } }) => void;
  addStateEntry: (state: string, text: string) => void;
  resetStats: () => void;
}

const STATE_LABELS: Record<string, string> = {
  'initializing': 'Initializing microphone',
  'ready': 'Ready',
  'recording': 'Recording audio',
  'processing': 'Transcribing',
  'thinking': 'LLM thinking',
  'speaking': 'Speaking (TTS)',
  'error': 'Error',
};

export const useStatsStore = create<StatsState>((set) => ({
  messageCount: 0,
  totalTokens: 0,
  totalLatency: 0,
  latencyCount: 0,
  stateLog: [{ timestamp: new Date(), state: 'ready', text: 'Ready' }],
  
  updateStats: (data) => set((state) => {
    const updates: Partial<StatsState> = {
      messageCount: state.messageCount + 1,
    };
    
    if (data.processing_ms) {
      updates.totalLatency = state.totalLatency + data.processing_ms;
      updates.latencyCount = state.latencyCount + 1;
    }
    
    if (data.usage?.total_tokens) {
      updates.totalTokens = state.totalTokens + data.usage.total_tokens;
    }
    
    return updates;
  }),
  
  addStateEntry: (stateKey, text) => set((state) => ({
    stateLog: [
      { timestamp: new Date(), state: stateKey, text: text || STATE_LABELS[stateKey] || stateKey },
      ...state.stateLog.slice(0, 49) // Keep last 50
    ]
  })),
  
  resetStats: () => set({
    messageCount: 0,
    totalTokens: 0,
    totalLatency: 0,
    latencyCount: 0,
    stateLog: [{ timestamp: new Date(), state: 'ready', text: 'Stats reset' }]
  }),
}));
