import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../store';
import { fetchWithAuth } from '../utils/api';
import { base64ToAudioBlob } from '../utils/helpers';

export function useTTS() {
  const setStatus = useAppStore((s) => s.setStatus);
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const avatarRenderer = useAppStore((s) => s.avatarRenderer);

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
      avatarRenderer?.lipSyncEngine?.stop();
    };
  }, [cleanupAudio, avatarRenderer]);

  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!text?.trim()) return false;

    try {
      cleanupAudio();
      setIsSpeaking(true);
      setStatus('speaking');
      currentTextRef.current = text;

      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice_id: ttsVoiceId?.trim() || undefined,
        })
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
      const result = await response.json();
      if (!result.audio_base64) throw new Error('No audio data in response');

      const audioBlob = base64ToAudioBlob(result.audio_base64);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;

      // Set up lip sync if alignment data available
      const renderer = useAppStore.getState().avatarRenderer;
      if (renderer?.lipSyncEngine && result.alignment) {
        renderer.lipSyncEngine.setAlignment(result.alignment);
        renderer.lipSyncEngine.startSync(audio);
      }

      return new Promise((resolve) => {
        audio.onended = () => {
          renderer?.lipSyncEngine?.stop();
          cleanupAudio();
          setIsSpeaking(false);
          setStatus('ready');
          resolve(true);
        };
        audio.onerror = () => {
          console.error('Audio playback error');
          renderer?.lipSyncEngine?.stop();
          cleanupAudio();
          setIsSpeaking(false);
          setStatus('ready');
          resolve(false);
        };
        audio.play().catch(() => {
          console.error('Audio play failed');
          renderer?.lipSyncEngine?.stop();
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
  }, [setStatus, cleanupAudio, ttsVoiceId]);

  const stop = useCallback((): void => {
    const renderer = useAppStore.getState().avatarRenderer;
    renderer?.lipSyncEngine?.stop();
    cleanupAudio();
    setIsSpeaking(false);
    setStatus('ready');
  }, [setStatus, cleanupAudio]);

  const replay = useCallback((): Promise<boolean> => {
    if (currentTextRef.current) {
      return speak(currentTextRef.current);
    }
    return Promise.resolve(false);
  }, [speak]);

  return { speak, stop, replay, isSpeaking };
}

export default useTTS;
