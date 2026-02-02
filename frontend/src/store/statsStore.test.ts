import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from './statsStore';

describe('statsStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useStatsStore.setState({
      messageCount: 0,
      totalLatency: 0,
      latencyCount: 0,
      stageLatencies: {},
      stateLog: [{ timestamp: new Date(), state: 'ready', text: 'Ready' }],
    });
  });

  describe('updateStats', () => {
    it('should increment message count', () => {
      const store = useStatsStore.getState();
      store.updateStats({});

      expect(useStatsStore.getState().messageCount).toBe(1);

      store.updateStats({});
      expect(useStatsStore.getState().messageCount).toBe(2);
    });

    it('should accumulate latency', () => {
      const store = useStatsStore.getState();
      store.updateStats({ processing_ms: 100 });
      store.updateStats({ processing_ms: 200 });

      const state = useStatsStore.getState();
      expect(state.totalLatency).toBe(300);
      expect(state.latencyCount).toBe(2);
    });

    it('should handle updates without latency', () => {
      const store = useStatsStore.getState();
      store.updateStats({});

      const state = useStatsStore.getState();
      expect(state.messageCount).toBe(1);
      expect(state.totalLatency).toBe(0);
      expect(state.latencyCount).toBe(0);
    });
  });

  describe('addStageLatency', () => {
    it('should add latency for a new stage', () => {
      const store = useStatsStore.getState();
      store.addStageLatency('stt', 50);

      const state = useStatsStore.getState();
      expect(state.stageLatencies.stt).toEqual([50]);
    });

    it('should append latencies for existing stage', () => {
      const store = useStatsStore.getState();
      store.addStageLatency('stt', 50);
      store.addStageLatency('stt', 60);
      store.addStageLatency('stt', 70);

      const state = useStatsStore.getState();
      expect(state.stageLatencies.stt).toEqual([50, 60, 70]);
    });

    it('should track multiple stages independently', () => {
      const store = useStatsStore.getState();
      store.addStageLatency('stt', 50);
      store.addStageLatency('llm', 200);
      store.addStageLatency('tts', 100);

      const state = useStatsStore.getState();
      expect(state.stageLatencies.stt).toEqual([50]);
      expect(state.stageLatencies.llm).toEqual([200]);
      expect(state.stageLatencies.tts).toEqual([100]);
    });

    it('should keep only last 100 samples per stage', () => {
      const store = useStatsStore.getState();

      // Add 105 samples
      for (let i = 0; i < 105; i++) {
        store.addStageLatency('test', i);
      }

      const state = useStatsStore.getState();
      expect(state.stageLatencies.test).toHaveLength(100);
      // Should have values 5-104 (dropped first 5)
      expect(state.stageLatencies.test[0]).toBe(5);
      expect(state.stageLatencies.test[99]).toBe(104);
    });
  });

  describe('addStateEntry', () => {
    it('should add state entry with timestamp', () => {
      const store = useStatsStore.getState();
      store.addStateEntry('recording', 'Recording audio');

      const state = useStatsStore.getState();
      expect(state.stateLog[0].state).toBe('recording');
      expect(state.stateLog[0].text).toBe('Recording audio');
      expect(state.stateLog[0].timestamp).toBeInstanceOf(Date);
    });

    it('should add entries to the front of log', () => {
      const store = useStatsStore.getState();
      store.addStateEntry('recording', 'Recording');
      store.addStateEntry('processing', 'Processing');

      const state = useStatsStore.getState();
      expect(state.stateLog[0].state).toBe('processing');
      expect(state.stateLog[1].state).toBe('recording');
    });

    it('should use default label if text not provided', () => {
      const store = useStatsStore.getState();
      store.addStateEntry('thinking', '');

      const state = useStatsStore.getState();
      expect(state.stateLog[0].text).toBe('LLM thinking');
    });

    it('should keep only last 50 entries', () => {
      const store = useStatsStore.getState();

      // Add 55 entries
      for (let i = 0; i < 55; i++) {
        store.addStateEntry('test', `Entry ${i}`);
      }

      const state = useStatsStore.getState();
      expect(state.stateLog).toHaveLength(50);
      // Most recent should be "Entry 54"
      expect(state.stateLog[0].text).toBe('Entry 54');
    });
  });

  describe('resetStats', () => {
    it('should reset all stats to initial values', () => {
      const store = useStatsStore.getState();

      // Add some data
      store.updateStats({ processing_ms: 100 });
      store.updateStats({ processing_ms: 200 });
      store.addStageLatency('stt', 50);
      store.addStageLatency('llm', 200);
      store.addStateEntry('thinking', 'Processing');

      // Reset
      store.resetStats();

      const state = useStatsStore.getState();
      expect(state.messageCount).toBe(0);
      expect(state.totalLatency).toBe(0);
      expect(state.latencyCount).toBe(0);
      expect(state.stageLatencies).toEqual({});
      expect(state.stateLog).toHaveLength(1);
      expect(state.stateLog[0].text).toBe('Stats reset');
    });
  });

  describe('performance calculations', () => {
    it('should allow calculation of average latency', () => {
      const store = useStatsStore.getState();
      store.updateStats({ processing_ms: 100 });
      store.updateStats({ processing_ms: 200 });
      store.updateStats({ processing_ms: 300 });

      const state = useStatsStore.getState();
      const avgLatency = state.totalLatency / state.latencyCount;
      expect(avgLatency).toBe(200);
    });

    it('should handle zero latency count', () => {
      const state = useStatsStore.getState();
      const avgLatency = state.latencyCount === 0 ? 0 : state.totalLatency / state.latencyCount;
      expect(avgLatency).toBe(0);
    });
  });
});
