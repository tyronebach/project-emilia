/**
 * Emilia API Utilities
 * Handles authenticated requests and SSE streaming
 */

import type { AvatarCommand } from '../types';

const API_URL = '';
const AUTH_TOKEN = 'emilia-dev-token-2026';

interface FetchOptions extends RequestInit {
  body?: string | FormData;
}

interface StreamResponse {
  response?: string;
  processing_ms?: number;
  model?: string;
  moods?: string[];
  animations?: string[];
}

/**
 * Make an authenticated fetch request
 */
export async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
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
              onDone({
                response: data.response || stripAvatarTags(fullContent),
                processing_ms: data.processing_ms,
                model: data.model,
                moods: data.moods,
                animations: data.animations
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

export default { fetchWithAuth, streamChat, stripAvatarTags };
