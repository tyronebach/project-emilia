/**
 * Emilia API Utilities
 * Handles authenticated requests and SSE streaming
 */

const API_URL = '';
const AUTH_TOKEN = 'emilia-dev-token-2026';

/**
 * Make an authenticated fetch request
 */
export async function fetchWithAuth(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    ...options.headers,
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
export function stripAvatarTags(text) {
  if (!text) return '';
  return text
    .replace(/<mood:[^>]+>/g, '')
    .replace(/<animation:[^>]+>/g, '')
    .trim();
}

/**
 * Stream chat response via SSE
 * @param {string} message - User message
 * @param {string} sessionId - Session ID
 * @param {function} onChunk - Called with each text chunk
 * @param {function} onAvatar - Called with avatar commands
 * @param {function} onDone - Called when stream completes
 * @param {function} onError - Called on error
 */
export async function streamChat(message, sessionId, onChunk, onAvatar, onDone, onError) {
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
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType = null;
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
            if (e.message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', e.message, dataStr);
            }
          }
          
          currentEventType = null;
        }
      }
    }
  } catch (error) {
    onError(error);
  }
}

export default { fetchWithAuth, streamChat, stripAvatarTags };
