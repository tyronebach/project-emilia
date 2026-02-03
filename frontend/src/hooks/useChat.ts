import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth, streamChat } from '../utils/api';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import type { TokenUsage } from '../types';

interface StreamResponse {
  response?: string;
  session_id?: string;
  processing_ms?: number;
  model?: string;
  moods?: Array<{ mood: string; intensity: number }>;
  animations?: string[];
  usage?: TokenUsage;
}

export function useChat() {
  const {
    status,
    setStatus,
    addMessage,
    updateMessage,
    applyAvatarCommand,
    ttsEnabled,
    avatarRendererRef
  } = useApp();

  const { updateStats, addStateEntry } = useStatsStore();
  const currentAgent = useUserStore((state) => state.currentAgent);

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Log state changes
  useEffect(() => {
    addStateEntry(status, '');
  }, [status, addStateEntry]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  /**
   * Speak text using TTS
   * Returns audio_base64 for storage in message meta
   */
  const speakText = useCallback(async (text: string): Promise<string | null> => {
    if (!text?.trim()) return null;

    try {
      cleanupAudio();
      setStatus('speaking');

      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
      const result = await response.json();
      if (!result.audio_base64) throw new Error('No audio data');

      // Decode audio
      const byteChars = atob(result.audio_base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;

      // Setup lip sync
      const renderer = avatarRendererRef.current;
      if (renderer?.lipSyncEngine && result.alignment) {
        renderer.lipSyncEngine.setAlignment(result.alignment);
        renderer.lipSyncEngine.startSync(audio);
      }

      // Play and wait
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          renderer?.lipSyncEngine?.stop();
          cleanupAudio();
          resolve();
        };
        audio.onerror = () => {
          renderer?.lipSyncEngine?.stop();
          cleanupAudio();
          resolve();
        };
        audio.play().catch(() => {
          renderer?.lipSyncEngine?.stop();
          cleanupAudio();
          resolve();
        });
      });

      // Return the base64 for storage
      return result.audio_base64;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    } finally {
      setStatus('ready');
    }
  }, [setStatus, avatarRendererRef, cleanupAudio]);

  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (message: string): Promise<void> => {
    if (isLoading || !currentAgent) return;

    setIsLoading(true);
    setStatus('thinking');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const messageId = addMessage('assistant', '', { streaming: true });
      let fullContent = '';
      let finalResponse: StreamResponse = {};
      let didAbort = false;

      await streamChat(
        message,
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
          updateStats({ processing_ms: data.processing_ms });
        },
        // onError
        (error) => {
          if (error.name === 'AbortError') {
            didAbort = true;
            updateMessage(messageId, {
              meta: { streaming: false }
            });
            setStatus('ready');
            return;
          }
          console.error('Chat error:', error);
          updateMessage(messageId, {
            content: `⚠️ Error: ${error.message}`,
            meta: { error: true }
          });
          setStatus('error');
          setTimeout(() => setStatus('ready'), 3000);
        },
        { signal: abortController.signal }
      );

      if (didAbort) return;

      // TTS if enabled - store audio in message meta for replay
      if (ttsEnabled && finalResponse?.response) {
        const audio_base64 = await speakText(finalResponse.response);
        if (audio_base64) {
          updateMessage(messageId, {
            meta: {
              ...finalResponse,
              processing_ms: finalResponse.processing_ms,
              model: finalResponse.model,
              moods: finalResponse.moods,
              animations: finalResponse.animations,
              usage: finalResponse.usage,
              streaming: false,
              audio_base64,
            }
          });
        }
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
  }, [currentAgent, isLoading, setStatus, addMessage, updateMessage, applyAvatarCommand, ttsEnabled, speakText, updateStats]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, isLoading, abort };
}

export default useChat;
