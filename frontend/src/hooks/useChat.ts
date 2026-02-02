import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth, streamChat } from '../utils/api';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import type { TokenUsage } from '../types';

interface StreamResponse {
  response?: string;
  processing_ms?: number;
  model?: string;
  moods?: Array<{ mood: string; intensity: number }>;
  animations?: string[];
  usage?: TokenUsage;
}

export function useChat() {
  const {
    sessionId,
    status,
    setStatus,
    addMessage,
    updateMessage,
    applyAvatarCommand,
    ttsEnabled,
    avatarRendererRef
  } = useApp();

  const { updateStats, addStateEntry } = useStatsStore();
  const currentAvatar = useUserStore((state) => state.currentAvatar);

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Log state changes
  useEffect(() => {
    addStateEntry(status, '');
  }, [status, addStateEntry]);

  /**
   * Speak text using TTS
   */
  const speakText = useCallback(async (text: string): Promise<void> => {
    if (!text || !text.trim()) return;

    try {
      setStatus('speaking');

      const headers: Record<string, string> = {};
      if (currentAvatar?.id) {
        headers['X-Avatar-Id'] = currentAvatar.id;
      }
      
      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.audio_base64) {
        throw new Error('No audio data');
      }

      // Decode audio
      const byteChars = atob(result.audio_base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      const audio = new Audio(audioUrl);

      // Setup lip sync
      const renderer = avatarRendererRef.current;
      if (renderer?.lipSyncEngine && result.alignment) {
        renderer.lipSyncEngine.setAlignment(result.alignment);
        renderer.lipSyncEngine.startSync(audio);
      }

      // Play and wait
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = () => {
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.play().catch(() => resolve());
      });
    } catch (error) {
      console.error('TTS error:', error);
    } finally {
      setStatus('ready');
    }
  }, [setStatus, avatarRendererRef, currentAvatar]);

  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (message: string): Promise<void> => {
    if (isLoading) return;

    setIsLoading(true);
    setStatus('thinking');

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      // Create placeholder message for streaming
      const messageId = addMessage('assistant', '', { streaming: true });
      let fullContent = '';
      let finalResponse: StreamResponse = {};

      await streamChat(
        message,
        sessionId,
        // onChunk
        (chunk) => {
          fullContent += chunk;
          updateMessage(messageId, { content: fullContent });
        },
        // onAvatar
        (avatarData) => {
          applyAvatarCommand(avatarData);
        },
        // onDone
        (data) => {
          finalResponse = data;

          // Final update with clean response and metadata (including mood/animation/usage)
          updateMessage(messageId, {
            content: data.response || fullContent,
            meta: {
              processing_ms: data.processing_ms,
              model: data.model,
              moods: data.moods,
              animations: data.animations,
              usage: data.usage,
              streaming: false
            }
          });

          // Update stats
          updateStats({
            processing_ms: data.processing_ms
          });
        },
        // onError
        (error) => {
          console.error('Chat error:', error);
          updateMessage(messageId, {
            content: `⚠️ Error: ${error.message}`,
            meta: { error: true }
          });
          setStatus('error');
          setTimeout(() => setStatus('ready'), 3000);
        }
      );

      // TTS if enabled and we have a response
      console.log('[useChat] TTS check:', { ttsEnabled, hasResponse: !!finalResponse?.response });
      if (ttsEnabled && finalResponse?.response) {
        console.log('[useChat] Calling speakText');
        await speakText(finalResponse.response);
      } else {
        setStatus('ready');
      }
    } catch (error) {
      console.error('sendMessage error:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 3000);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [sessionId, isLoading, setStatus, addMessage, updateMessage, applyAvatarCommand, ttsEnabled, speakText]);

  /**
   * Abort current request
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    sendMessage,
    isLoading,
    abort
  };
}

export default useChat;
