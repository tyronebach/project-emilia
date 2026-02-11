import { fetchWithAuth } from './api';
import type {
  SoulAboutPayload,
  SoulBondSnapshot,
  SoulEventsMutationRequest,
  SoulEventsMutationResponse,
  SoulEventsPayload,
  SoulMoodSnapshot,
} from '../types/soulWindow';

async function parseJsonResponse<T>(response: Response, actionLabel: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${actionLabel} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getSoulMood(): Promise<SoulMoodSnapshot> {
  const response = await fetchWithAuth('/api/soul-window/mood');
  return parseJsonResponse<SoulMoodSnapshot>(response, 'Fetch mood');
}

export async function getSoulBond(): Promise<SoulBondSnapshot> {
  const response = await fetchWithAuth('/api/soul-window/bond');
  return parseJsonResponse<SoulBondSnapshot>(response, 'Fetch bond');
}

export async function getSoulAbout(includeRaw = false): Promise<SoulAboutPayload> {
  const query = includeRaw ? '?include_raw=true' : '';
  const response = await fetchWithAuth(`/api/soul-window/about${query}`);
  return parseJsonResponse<SoulAboutPayload>(response, 'Fetch about');
}

export async function getSoulEvents(): Promise<SoulEventsPayload> {
  const response = await fetchWithAuth('/api/soul-window/events');
  return parseJsonResponse<SoulEventsPayload>(response, 'Fetch events');
}

export async function mutateSoulEvents(
  body: SoulEventsMutationRequest,
): Promise<SoulEventsMutationResponse> {
  const response = await fetchWithAuth('/api/soul-window/events', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return parseJsonResponse<SoulEventsMutationResponse>(response, 'Update events');
}
