import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDriftComparison, runDriftSimulation } from './designerApiV2';

const { mockFetchWithAuth } = vi.hoisted(() => ({
  mockFetchWithAuth: vi.fn(),
}));

vi.mock('./api', () => ({
  fetchWithAuth: mockFetchWithAuth,
}));

describe('designerApiV2 request wiring', () => {
  beforeEach(() => {
    mockFetchWithAuth.mockReset();
  });

  it('sends replay_mode and seed in drift comparison payload', async () => {
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => ({ comparisons: [] }),
    });

    await runDriftComparison(
      'agent-1',
      ['aggressive', 'neutral'],
      7,
      2,
      20,
      'random',
      77,
    );

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchWithAuth.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designer/v2/drift-compare');
    expect(options.method).toBe('POST');

    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      agent_id: 'agent-1',
      archetypes: ['aggressive', 'neutral'],
      duration_days: 7,
      sessions_per_day: 2,
      messages_per_session: 20,
      replay_mode: 'random',
      seed: 77,
    });
  });

  it('passes replay_mode in single drift simulation payload', async () => {
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => ({ timeline: [], daily_summaries: [] }),
    });

    await runDriftSimulation({
      agent_id: 'agent-2',
      archetype: 'supportive',
      duration_days: 3,
      sessions_per_day: 1,
      messages_per_session: 10,
      replay_mode: 'random',
    });

    expect(mockFetchWithAuth).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchWithAuth.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designer/v2/drift-simulate');
    const body = JSON.parse(String(options.body));
    expect(body.replay_mode).toBe('random');
  });
});
