/**
 * Designer API V2 - Personality, Bonds, Calibration, Simulation
 */
import { fetchWithAuth } from './api';
import type {
  AgentPersonality,
  TriggerResponseProfile,
  UserAgentBond,
  UserAgentBondSummary,
  UserCalibrationProfile,
  SimulationRequest,
  SimulationResult,
  MoodGroup,
  Archetype,
  DriftSimulationConfig,
  DriftSimulationResult,
  DriftComparisonResult,
  MoodInjectionSettings,
} from '../types/designer';

// ============ PERSONALITY (Agent DNA) ============

export async function getPersonalities(): Promise<AgentPersonality[]> {
  const res = await fetchWithAuth('/api/designer/v2/personalities');
  if (!res.ok) throw new Error(`Failed to fetch personalities: ${res.status}`);
  return res.json();
}

export async function getPersonality(agentId: string): Promise<AgentPersonality> {
  const res = await fetchWithAuth(`/api/designer/v2/personalities/${encodeURIComponent(agentId)}`);
  if (!res.ok) throw new Error(`Failed to fetch personality: ${res.status}`);
  return res.json();
}

export async function updatePersonality(
  agentId: string,
  updates: Partial<AgentPersonality>
): Promise<AgentPersonality> {
  const res = await fetchWithAuth(`/api/designer/v2/personalities/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update personality: ${res.status}`);
  return res.json();
}

export async function resetMoodState(agentId: string): Promise<void> {
  const res = await fetchWithAuth(
    `/api/designer/v2/personalities/${encodeURIComponent(agentId)}/reset-mood-state`,
    { method: 'POST', body: '{}' }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Failed to reset mood state: ${res.status}`);
  }
}

// ============ TRIGGER DEFAULTS ============

export async function getTriggerDefaults(): Promise<Record<string, TriggerResponseProfile>> {
  const res = await fetchWithAuth('/api/designer/v2/trigger-defaults');
  if (!res.ok) throw new Error(`Failed to fetch trigger defaults: ${res.status}`);
  return res.json();
}

// ============ MOOD GROUPS ============

export async function getMoodGroups(): Promise<Record<string, MoodGroup>> {
  const res = await fetchWithAuth('/api/designer/v2/mood-groups');
  if (!res.ok) throw new Error(`Failed to fetch mood groups: ${res.status}`);
  return res.json();
}

// ============ BONDS (User-Agent Relationships) ============

export async function getBonds(agentId?: string): Promise<UserAgentBondSummary[]> {
  const url = agentId
    ? `/api/designer/v2/bonds?agent_id=${encodeURIComponent(agentId)}`
    : '/api/designer/v2/bonds';
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch bonds: ${res.status}`);
  return res.json();
}

export async function getBond(userId: string, agentId: string): Promise<UserAgentBond> {
  const res = await fetchWithAuth(
    `/api/designer/v2/bonds/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch bond: ${res.status}`);
  return res.json();
}

export async function compareBonds(
  agentId: string,
  userIds: string[]
): Promise<UserAgentBond[]> {
  const res = await fetchWithAuth('/api/designer/v2/bonds/compare', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, user_ids: userIds }),
  });
  if (!res.ok) throw new Error(`Failed to compare bonds: ${res.status}`);
  return res.json();
}

export async function resetBond(userId: string, agentId: string): Promise<void> {
  const res = await fetchWithAuth(
    `/api/designer/v2/bonds/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`Failed to reset bond: ${res.status}`);
}

// ============ CALIBRATION ============

export async function getCalibration(
  userId: string,
  agentId: string
): Promise<UserCalibrationProfile> {
  const res = await fetchWithAuth(
    `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch calibration: ${res.status}`);
  return res.json();
}

export async function resetCalibration(
  userId: string,
  agentId: string,
  triggerType?: string
): Promise<void> {
  const url = triggerType
    ? `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}/${encodeURIComponent(triggerType)}`
    : `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`;
  const res = await fetchWithAuth(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to reset calibration: ${res.status}`);
}

// ============ SIMULATION ============

export async function simulate(request: SimulationRequest): Promise<SimulationResult> {
  const res = await fetchWithAuth('/api/designer/v2/simulate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Simulation failed: ${res.status}`);
  return res.json();
}

// ============ DRIFT SIMULATION ============

export async function getArchetypes(): Promise<Archetype[]> {
  const res = await fetchWithAuth('/api/designer/v2/archetypes');
  if (!res.ok) throw new Error(`Failed to fetch archetypes: ${res.status}`);
  const data = await res.json();
  return data.archetypes ?? [];
}

export async function runDriftSimulation(
  config: DriftSimulationConfig
): Promise<DriftSimulationResult> {
  const res = await fetchWithAuth('/api/designer/v2/drift-simulate', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Drift simulation failed: ${res.status}`);
  return res.json();
}

export async function runDriftComparison(
  agentId: string,
  archetypes: string[],
  durationDays: number,
  sessionsPerDay = 2,
  messagesPerSession = 20
): Promise<DriftComparisonResult> {
  const res = await fetchWithAuth('/api/designer/v2/drift-compare', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: agentId,
      archetypes,
      duration_days: durationDays,
      sessions_per_day: sessionsPerDay,
      messages_per_session: messagesPerSession,
    }),
  });
  if (!res.ok) throw new Error(`Drift comparison failed: ${res.status}`);
  return res.json();
}

export async function getMoodInjectionSettings(): Promise<MoodInjectionSettings> {
  const res = await fetchWithAuth('/api/designer/v2/mood-injection-settings');
  if (!res.ok) throw new Error(`Failed to fetch mood injection settings: ${res.status}`);
  return res.json();
}

export async function updateMoodInjectionSettings(
  settings: MoodInjectionSettings
): Promise<MoodInjectionSettings> {
  const res = await fetchWithAuth('/api/designer/v2/mood-injection-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update mood injection settings: ${res.status}`);
  return res.json();
}
