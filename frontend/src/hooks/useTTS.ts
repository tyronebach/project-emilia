import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, contentType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

export function useTTS() {
  const { setStatus, avatarRendererRef } = useApp();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const currentTextRef = useRef<string>('');

  const cleanupAudio = useCallback((): void => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
      avatarRendererRef.current?.lipSyncEngine?.stop();
    };
  }, [cleanupAudio, avatarRendererRef]);

  /**
   * Speak text via TTS API
   */
  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!text || !text.trim()) return false;

    try {
      cleanupAudio();
      setIsSpeaking(true);
      setStatus('speaking');
      currentTextRef.current = text;

      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.audio_base64) {
        throw new Error('No audio data in response');
      }

      // Decode base64 audio
      const audioBlob = base64ToBlob(result.audio_base64, 'audio/mpeg');
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;

      // Set up lip sync if alignment data available
      const renderer = avatarRendererRef.current;
      if (renderer?.lipSyncEngine && result.alignment) {
        renderer.lipSyncEngine.setAlignment(result.alignment);
        renderer.lipSyncEngine.startSync(audio);
      }

      // Play audio
      return new Promise((resolve) => {
        audio.onended = () => {
          // Stop lip sync
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }

          // Cleanup
          cleanupAudio();
          setIsSpeaking(false);
          setStatus('ready');
          resolve(true);
        };

        audio.onerror = () => {
          console.error('Audio playback error');
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }
          cleanupAudio();
          setIsSpeaking(false);
          setStatus('ready');
          resolve(false);
        };

        audio.play().catch(() => {
          console.error('Audio play failed');
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }
          cleanupAudio();
          setIsSpeaking(false);
          setStatus('ready');
          resolve(false);
        });
      });
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
      setStatus('ready');
      return false;
    }
  }, [setStatus, avatarRendererRef, cleanupAudio]);

  /**
   * Stop current playback
   */
  const stop = useCallback((): void => {
    const renderer = avatarRendererRef.current;
    if (renderer?.lipSyncEngine) {
      renderer.lipSyncEngine.stop();
    }

    cleanupAudio();
    setIsSpeaking(false);
    setStatus('ready');
  }, [setStatus, avatarRendererRef, cleanupAudio]);

  /**
   * Replay last spoken text
   */
  const replay = useCallback((): Promise<boolean> => {
    if (currentTextRef.current) {
      return speak(currentTextRef.current);
    }
    return Promise.resolve(false);
  }, [speak]);

  return {
    speak,
    stop,
    replay,
    isSpeaking
  };
}

export default useTTS;
