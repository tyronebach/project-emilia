/**
 * Emilia API Utilities
 * Handles authenticated requests and SSE streaming
 */

import type { AvatarCommand, User, SessionInfo } from '../types';
import { useUserStore } from '../store/userStore';

const API_URL = '';
const AUTH_TOKEN = 'emilia-dev-token-2026';

interface FetchOptions extends RequestInit {
  body?: string | FormData;
}

interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface StreamResponse {
  response?: string;
  processing_ms?: number;
  model?: string;
  moods?: Array<{ mood: string; intensity: number }>;
  animations?: string[];
  usage?: TokenUsage;
}

function normalizeUser(user: Partial<User> & { id?: string }, fallbackId?: string): User {
  const id = user.id ?? fallbackId ?? '';
  return {
    id,
    display_name: user.display_name ?? id,
    avatars: user.avatars ?? [],
    avatar_count: user.avatar_count,
    default_avatar: user.default_avatar ?? '',
  };
}

function getUserHeaders(): Record<string, string> {
  const { currentUser, currentAvatar } = useUserStore.getState();
  const headers: Record<string, string> = {};
  if (currentUser?.id) {
    headers['X-User-Id'] = currentUser.id;
  }
  if (currentAvatar?.id) {
    headers['X-Avatar-Id'] = currentAvatar.id;
  }
  return headers;
}

/**
 * Make an authenticated fetch request
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    ...getUserHeaders(),
    ...options.headers as Record<string, string>,
  };

  // Only set Content-Type for JSON if not FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Strip avatar tags from response text
 */
export function stripAvatarTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<mood:[^>]+>/g, '')
    .replace(/<animation:[^>]+>/g, '')
    .trim();
}

/**
 * Stream chat response via SSE
 */
export async function streamChat(
  message: string,
  sessionId: string,
  onChunk: (chunk: string) => void,
  onAvatar: (data: AvatarCommand) => void,
  onDone: (data: StreamResponse) => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetchWithAuth(`${API_URL}/api/chat?stream=1`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        session_id: sessionId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

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
        // Parse event type
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        // Parse data
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();

          if (!dataStr || dataStr === '[DONE]') {
            currentEventType = null;
            continue;
          }

          try {
            const data = JSON.parse(dataStr);

            // Handle avatar event
            if (currentEventType === 'avatar') {
              console.log('[API] Avatar event received:', data);
              onAvatar(data);
              currentEventType = null;
              continue;
            }

            // Handle error
            if (data.error) {
              throw new Error(data.error);
            }

            // Handle content chunk
            if (data.content) {
              fullContent += data.content;
              onChunk(data.content);
            }

            // Handle done
            if (data.done) {
              console.log('[API] Stream done:', { moods: data.moods, animations: data.animations });
              onDone({
                response: data.response || stripAvatarTags(fullContent),
                processing_ms: data.processing_ms,
                model: data.model,
                moods: data.moods,
                animations: data.animations,
                usage: data.usage
              });
            }
          } catch (e) {
            if ((e as Error).message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', (e as Error).message, dataStr);
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

export async function getUsers(): Promise<User[]> {
  const response = await fetchWithAuth(`${API_URL}/api/users`);
  if (!response.ok) {
    throw new Error(`Users API error: ${response.status}`);
  }
  const data = await response.json();
  if (Array.isArray(data)) {
    return (data as Array<Partial<User> & { id?: string }>).map((user) => normalizeUser(user));
  }
  if (Array.isArray(data?.users)) {
    return (data.users as Array<Partial<User> & { id?: string }>).map((user) => normalizeUser(user));
  }
  return [];
}

export async function getUser(userId: string): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error(`User API error: ${response.status}`);
  }
  const data = await response.json();
  if (data?.user) {
    return normalizeUser(data.user as Partial<User>, userId);
  }
  return normalizeUser(data as Partial<User>, userId);
}

export async function selectAvatar(userId: string, avatarId: string): Promise<SessionInfo> {
  const response = await fetchWithAuth(
    `${API_URL}/api/users/${encodeURIComponent(userId)}/select-avatar/${encodeURIComponent(avatarId)}`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw new Error(`Select avatar error: ${response.status}`);
  }
  return response.json() as Promise<SessionInfo>;
}

export default { fetchWithAuth, streamChat, stripAvatarTags, getUsers, getUser, selectAvatar };
