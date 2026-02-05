/**
 * Emilia API Utilities
 * Handles authenticated requests and SSE streaming
 */

import type { AvatarCommand } from '../types';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';

const API_URL = '';
const AUTH_TOKEN = 'emilia-dev-token-2026';

// ============ TYPES ============

export interface Agent {
  id: string;
  display_name: string;
  clawdbot_agent_id: string;
  vrm_model: string;
  voice_id: string | null;
  owners?: string[];
}

export interface User {
  id: string;
  display_name: string;
  preferences?: string;
  agents?: Agent[];
  avatar_count?: number;
}

export interface Session {
  id: string;
  agent_id: string;
  name: string | null;
  created_at: number;
  last_used: number;
  message_count: number;
  participants: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface StreamResponse {
  response?: string;
  session_id?: string;
  processing_ms?: number;
  model?: string;
  moods?: Array<{ mood: string; intensity: number }>;
  animations?: string[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}


// ============ HELPERS ============

function getHeaders(): Record<string, string> {
  const { currentUser, currentAgent } = useUserStore.getState();
  const { sessionId } = useAppStore.getState();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (currentUser?.id) {
    headers['X-User-Id'] = currentUser.id;
  }
  if (currentAgent?.id) {
    headers['X-Agent-Id'] = currentAgent.id;
  }
  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }

  return headers;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  return fetch(url, { ...options, headers });
}


// ============ USER API ============

export async function getUsers(): Promise<User[]> {
  const response = await fetchWithAuth(`${API_URL}/api/users`);
  if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
  const data = await response.json();
  return data.users || [];
}

export async function getUser(userId: string): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(`Failed to fetch user: ${response.status}`);
  return response.json();
}

export async function updateUserPreferences(
  userId: string,
  preferences: Record<string, unknown>
): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}/preferences`, {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  });
  if (!response.ok) throw new Error(`Failed to update preferences: ${response.status}`);
  return response.json();
}

export async function getUserAgents(userId: string): Promise<Agent[]> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}/agents`);
  if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
  const data = await response.json();
  return data.agents || [];
}


// ============ SESSION API ============

export async function getSessions(agentId?: string): Promise<Session[]> {
  const headers = getHeaders();
  if (agentId) {
    headers['X-Agent-Id'] = agentId;
  }

  const response = await fetch(`${API_URL}/api/sessions`, { headers });
  if (!response.ok) throw new Error(`Failed to fetch sessions: ${response.status}`);
  const data = await response.json();
  return data.sessions || [];
}

export async function createSession(agentId: string, name?: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, name }),
  });
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`);
  return response.json();
}

export async function getSession(sessionId: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(`Failed to fetch session: ${response.status}`);
  return response.json();
}

export async function getSessionHistory(sessionId: string, limit = 50): Promise<Message[]> {
  const response = await fetchWithAuth(
    `${API_URL}/api/sessions/${encodeURIComponent(sessionId)}/history?limit=${limit}`
  );
  // Return empty array for 403/404 instead of throwing (session doesn't exist or not accessible)
  if (response.status === 403 || response.status === 404) {
    return [];
  }
  if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
  const data = await response.json();
  return data.messages || [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete session: ${response.status}`);
}


export async function renameSession(sessionId: string, name: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Failed to rename session: ${response.status}`);
  return response.json();
}


// ============ CHAT API ============

const AVATAR_TAG_REGEX = /<mood:[^>]+>|<animation:[^>]+>|\[(?:mood|anim):[^\]]*\]/gi;

function stripAvatarTagsRaw(text: string): string {
  return text.replace(AVATAR_TAG_REGEX, '');
}

function stripTrailingPartialTag(text: string): string {
  return text
    .replace(/\[(?:mood|anim):[^\]]*$/i, '')
    .replace(/<(?:mood|animation):[^>]*$/i, '');
}

export function stripAvatarTagsStreaming(text: string): string {
  if (!text) return '';
  const cleaned = stripAvatarTagsRaw(text);
  return stripTrailingPartialTag(cleaned);
}

export function stripAvatarTags(text: string): string {
  if (!text) return '';
  return stripAvatarTagsStreaming(text).trim();
}

export async function streamChat(
  message: string,
  onChunk: (chunk: string) => void,
  onAvatar: (data: AvatarCommand) => void,
  onDone: (data: StreamResponse) => void,
  onError: (error: Error) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  try {
    const response = await fetchWithAuth(`${API_URL}/api/chat?stream=1`, {
      method: 'POST',
      body: JSON.stringify({ message }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType: string | null = null;
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === '[DONE]') {
            currentEventType = null;
            continue;
          }

          try {
            const data = JSON.parse(dataStr);

            if (currentEventType === 'avatar') {
              onAvatar(data);
              currentEventType = null;
              continue;
            }

            if (data.error) throw new Error(data.error);

            if (data.content) {
              fullContent += data.content;
              onChunk(data.content);
            }

            if (data.done) {
              onDone({
                response: data.response || stripAvatarTags(fullContent),
                session_id: data.session_id,
                processing_ms: data.processing_ms,
                model: data.model,
                moods: data.moods,
                animations: data.animations,
                usage: data.usage,
              });
            }
          } catch (e) {
            if ((e as Error).message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', e);
            }
          }
          currentEventType = null;
        }
      }
    }
  } catch (error) {
    onError(error as Error);
  }
}


// ============ MEMORY API ============

export async function getMemory(): Promise<string> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    if (response.status === 404) return '';
    throw new Error(`Failed to fetch memory: ${response.status}`);
  }
  return response.text();
}


export interface MemoryListResponse {
  workspace: string;
  files: string[];
}


export async function listMemoryFiles(): Promise<string[]> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory/list?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    throw new Error(`Failed to list memory files: ${response.status}`);
  }
  const data: MemoryListResponse = await response.json();
  return data.files || [];
}


export async function getMemoryFile(filename: string): Promise<string> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory/${encodeURIComponent(filename)}?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    if (response.status === 404) return '';
    throw new Error(`Failed to fetch memory file: ${response.status}`);
  }
  const data = await response.json();
  return data.content || '';
}


export default {
  fetchWithAuth,
  getUsers,
  getUser,
  getUserAgents,
  getSessions,
  createSession,
  getSession,
  getSessionHistory,
  deleteSession,
  renameSession,
  streamChat,
  stripAvatarTags,
  stripAvatarTagsStreaming,
  getMemory,
  listMemoryFiles,
  getMemoryFile,
};
