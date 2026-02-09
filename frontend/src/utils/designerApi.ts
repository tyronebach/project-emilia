/**
 * Designer API - CRUD for agents, moods, and relationship types
 */
import { fetchWithAuth } from './api';
import type {
  DesignerAgent,
  DesignerMood,
  DesignerRelationship,
  DesignerRelationshipSummary,
} from '../types/designer';

// ============ MOODS ============

export async function getMoods(): Promise<DesignerMood[]> {
  const res = await fetchWithAuth('/api/designer/moods');
  if (!res.ok) throw new Error(`Failed to fetch moods: ${res.status}`);
  const data = await res.json();
  return data.moods;
}

export async function createMood(mood: Partial<DesignerMood> & { id: string; valence: number; arousal: number }): Promise<DesignerMood> {
  const res = await fetchWithAuth('/api/designer/moods', {
    method: 'POST',
    body: JSON.stringify(mood),
  });
  if (!res.ok) throw new Error(`Failed to create mood: ${res.status}`);
  return res.json();
}

export async function updateMood(moodId: string, updates: Partial<DesignerMood>): Promise<DesignerMood> {
  const res = await fetchWithAuth(`/api/designer/moods/${encodeURIComponent(moodId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update mood: ${res.status}`);
  return res.json();
}

export async function deleteMood(moodId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/designer/moods/${encodeURIComponent(moodId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete mood: ${res.status}`);
}

// ============ AGENTS ============

export async function getAgents(): Promise<DesignerAgent[]> {
  const res = await fetchWithAuth('/api/designer/agents');
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  return res.json();
}

export async function getAgent(agentId: string): Promise<DesignerAgent> {
  const res = await fetchWithAuth(`/api/designer/agents/${encodeURIComponent(agentId)}`);
  if (!res.ok) throw new Error(`Failed to fetch agent: ${res.status}`);
  return res.json();
}

export async function createAgent(agent: Partial<DesignerAgent> & { id: string }): Promise<DesignerAgent> {
  const res = await fetchWithAuth('/api/designer/agents', {
    method: 'POST',
    body: JSON.stringify(agent),
  });
  if (!res.ok) throw new Error(`Failed to create agent: ${res.status}`);
  return res.json();
}

export async function updateAgent(agentId: string, updates: Partial<DesignerAgent>): Promise<DesignerAgent> {
  const res = await fetchWithAuth(`/api/designer/agents/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update agent: ${res.status}`);
  return res.json();
}

export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/designer/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete agent: ${res.status}`);
}

// ============ RELATIONSHIPS ============

export async function getRelationships(): Promise<DesignerRelationshipSummary[]> {
  const res = await fetchWithAuth('/api/designer/relationships');
  if (!res.ok) throw new Error(`Failed to fetch relationships: ${res.status}`);
  return res.json();
}

export async function getRelationship(relType: string): Promise<DesignerRelationship> {
  const res = await fetchWithAuth(`/api/designer/relationships/${encodeURIComponent(relType)}`);
  if (!res.ok) throw new Error(`Failed to fetch relationship: ${res.status}`);
  return res.json();
}

export async function createRelationship(relType: string, config: Partial<DesignerRelationship>): Promise<DesignerRelationship> {
  const res = await fetchWithAuth(`/api/designer/relationships/${encodeURIComponent(relType)}`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to create relationship: ${res.status}`);
  return res.json();
}

export async function updateRelationship(relType: string, updates: Partial<DesignerRelationship>): Promise<DesignerRelationship> {
  const res = await fetchWithAuth(`/api/designer/relationships/${encodeURIComponent(relType)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update relationship: ${res.status}`);
  return res.json();
}

export async function deleteRelationship(relType: string): Promise<void> {
  const res = await fetchWithAuth(`/api/designer/relationships/${encodeURIComponent(relType)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete relationship: ${res.status}`);
}
