// API Client for Designer endpoints

const BASE_URL = '/api/designer'

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || 'Request failed')
  }
  return res.json()
}

// Types
export interface Mood {
  id: string
  valence: number
  arousal: number
  description: string
}

export interface AgentSummary {
  id: string
  name: string
  description: string
  mood_baseline: Record<string, number>
}

export interface AgentConfig {
  id: string
  name: string
  description: string
  mood_baseline: Record<string, number>
  mood_decay_rate: number
  volatility: number
  recovery: number
  [key: string]: unknown
}

export interface RelationshipSummary {
  type: string
  description: string
  trigger_count: number
}

export interface RelationshipConfig {
  type: string
  description: string
  trigger_mood_map: Record<string, Record<string, number>>
  [key: string]: unknown
}

// Moods
export async function getMoods(): Promise<Mood[]> {
  const data = await fetchJSON<{ moods: Mood[] }>(`${BASE_URL}/moods`)
  return data.moods
}

// Agents
export async function getAgents(): Promise<AgentSummary[]> {
  return fetchJSON<AgentSummary[]>(`${BASE_URL}/agents`)
}

export async function getAgent(id: string): Promise<AgentConfig> {
  return fetchJSON<AgentConfig>(`${BASE_URL}/agents/${id}`)
}

export async function updateAgent(id: string, config: Partial<AgentConfig>): Promise<AgentConfig> {
  return fetchJSON<AgentConfig>(`${BASE_URL}/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function createAgent(id: string, config: Partial<AgentConfig>): Promise<AgentConfig> {
  return fetchJSON<AgentConfig>(`${BASE_URL}/agents/${id}`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function deleteAgent(id: string): Promise<void> {
  await fetchJSON(`${BASE_URL}/agents/${id}`, { method: 'DELETE' })
}

// Relationships
export async function getRelationships(): Promise<RelationshipSummary[]> {
  return fetchJSON<RelationshipSummary[]>(`${BASE_URL}/relationships`)
}

export async function getRelationship(type: string): Promise<RelationshipConfig> {
  return fetchJSON<RelationshipConfig>(`${BASE_URL}/relationships/${type}`)
}

export async function updateRelationship(type: string, config: Partial<RelationshipConfig>): Promise<RelationshipConfig> {
  return fetchJSON<RelationshipConfig>(`${BASE_URL}/relationships/${type}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function createRelationship(type: string, config: Partial<RelationshipConfig>): Promise<RelationshipConfig> {
  return fetchJSON<RelationshipConfig>(`${BASE_URL}/relationships/${type}`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function deleteRelationship(type: string): Promise<void> {
  await fetchJSON(`${BASE_URL}/relationships/${type}`, { method: 'DELETE' })
}
