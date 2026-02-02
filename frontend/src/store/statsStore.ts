import { create } from 'zustand';

export interface StateLogEntry {
  timestamp: Date;
  state: string;
  text: string;
}

interface StatsState {
  // Cumulative stats
  messageCount: number;
  totalLatency: number;
  latencyCount: number;
  
  // Per-stage latencies (for P50/P95 calculation)
  stageLatencies: Record<string, number[]>;
  
  // State log
  stateLog: StateLogEntry[];
  
  // Actions
  updateStats: (data: { processing_ms?: number }) => void;
  addStageLatency: (stage: string, latencyMs: number) => void;
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
  totalLatency: 0,
  latencyCount: 0,
  stageLatencies: {},
  stateLog: [{ timestamp: new Date(), state: 'ready', text: 'Ready' }],
  
  updateStats: (data) => set((state) => {
    const updates: Partial<StatsState> = {
      messageCount: state.messageCount + 1,
    };
    
    if (data.processing_ms) {
      updates.totalLatency = state.totalLatency + data.processing_ms;
      updates.latencyCount = state.latencyCount + 1;
    }
    
    return updates;
  }),
  
  addStageLatency: (stage, latencyMs) => set((state) => {
    const stageLatencies = { ...state.stageLatencies };
    if (!stageLatencies[stage]) {
      stageLatencies[stage] = [];
    }
    // Keep last 100 samples per stage
    stageLatencies[stage] = [...stageLatencies[stage], latencyMs].slice(-100);
    return { stageLatencies };
  }),
  
  addStateEntry: (stateKey, text) => set((state) => ({
    stateLog: [
      { timestamp: new Date(), state: stateKey, text: text || STATE_LABELS[stateKey] || stateKey },
      ...state.stateLog.slice(0, 49) // Keep last 50
    ]
  })),
  
  resetStats: () => set({
    messageCount: 0,
    totalLatency: 0,
    latencyCount: 0,
    stageLatencies: {},
    stateLog: [{ timestamp: new Date(), state: 'ready', text: 'Stats reset' }]
  }),
}));
