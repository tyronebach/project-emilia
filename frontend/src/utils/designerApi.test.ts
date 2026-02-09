import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMoods, createMood, updateMood, deleteMood,
  getAgents, getAgent, createAgent, updateAgent, deleteAgent,
  getRelationships, getRelationship, createRelationship, updateRelationship, deleteRelationship,
} from './designerApi';

// Mock fetchWithAuth
vi.mock('./api', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from './api';
const mockFetch = vi.mocked(fetchWithAuth);

function mockResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Moods API', () => {
  it('getMoods calls GET /api/designer/moods', async () => {
    mockFetch.mockResolvedValue(mockResponse({ moods: [{ id: 'happy' }] }));
    const result = await getMoods();
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/moods');
    expect(result).toEqual([{ id: 'happy' }]);
  });

  it('createMood calls POST /api/designer/moods', async () => {
    const mood = { id: 'sad', valence: -0.5, arousal: -0.2 };
    mockFetch.mockResolvedValue(mockResponse(mood));
    await createMood(mood);
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/moods', {
      method: 'POST',
      body: JSON.stringify(mood),
    });
  });

  it('updateMood calls PUT /api/designer/moods/:id', async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: 'happy', valence: 0.9 }));
    await updateMood('happy', { valence: 0.9 });
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/moods/happy', {
      method: 'PUT',
      body: JSON.stringify({ valence: 0.9 }),
    });
  });

  it('deleteMood calls DELETE /api/designer/moods/:id', async () => {
    mockFetch.mockResolvedValue(mockResponse({ deleted: 'happy' }));
    await deleteMood('happy');
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/moods/happy', {
      method: 'DELETE',
    });
  });

  it('getMoods throws on error response', async () => {
    mockFetch.mockResolvedValue(mockResponse(null, false, 500));
    await expect(getMoods()).rejects.toThrow('Failed to fetch moods: 500');
  });
});

describe('Agents API', () => {
  it('getAgents calls GET /api/designer/agents', async () => {
    mockFetch.mockResolvedValue(mockResponse([]));
    await getAgents();
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/agents');
  });

  it('getAgent calls GET /api/designer/agents/:id', async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: 'emilia' }));
    await getAgent('emilia');
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/agents/emilia');
  });

  it('createAgent calls POST /api/designer/agents', async () => {
    const agent = { id: 'luna', name: 'Luna' };
    mockFetch.mockResolvedValue(mockResponse(agent));
    await createAgent(agent);
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/agents', {
      method: 'POST',
      body: JSON.stringify(agent),
    });
  });

  it('updateAgent calls PUT /api/designer/agents/:id', async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: 'emilia', name: 'Updated' }));
    await updateAgent('emilia', { name: 'Updated' });
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/agents/emilia', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    });
  });

  it('deleteAgent calls DELETE /api/designer/agents/:id', async () => {
    mockFetch.mockResolvedValue(mockResponse({ deleted: 'emilia' }));
    await deleteAgent('emilia');
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/agents/emilia', {
      method: 'DELETE',
    });
  });
});

describe('Relationships API', () => {
  it('getRelationships calls GET /api/designer/relationships', async () => {
    mockFetch.mockResolvedValue(mockResponse([]));
    await getRelationships();
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/relationships');
  });

  it('getRelationship calls GET /api/designer/relationships/:type', async () => {
    mockFetch.mockResolvedValue(mockResponse({ type: 'friend' }));
    await getRelationship('friend');
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/relationships/friend');
  });

  it('createRelationship calls POST /api/designer/relationships/:type', async () => {
    const config = { description: 'A friend' };
    mockFetch.mockResolvedValue(mockResponse({ type: 'friend', ...config }));
    await createRelationship('friend', config);
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/relationships/friend', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  });

  it('updateRelationship calls PUT /api/designer/relationships/:type', async () => {
    mockFetch.mockResolvedValue(mockResponse({ type: 'friend', description: 'Updated' }));
    await updateRelationship('friend', { description: 'Updated' });
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/relationships/friend', {
      method: 'PUT',
      body: JSON.stringify({ description: 'Updated' }),
    });
  });

  it('deleteRelationship calls DELETE /api/designer/relationships/:type', async () => {
    mockFetch.mockResolvedValue(mockResponse({ deleted: 'friend' }));
    await deleteRelationship('friend');
    expect(mockFetch).toHaveBeenCalledWith('/api/designer/relationships/friend', {
      method: 'DELETE',
    });
  });
});
