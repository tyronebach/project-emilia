import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';

export function useTTS() {
  const { setStatus, avatarRendererRef } = useApp();
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);
  const currentTextRef = useRef('');
  
  /**
   * Speak text via TTS API
   */
  const speak = useCallback(async (text) => {
    if (!text || !text.trim()) return false;
    
    try {
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
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setIsSpeaking(false);
          setStatus('ready');
          resolve(true);
        };
        
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          if (renderer?.lipSyncEngine) {
            renderer.lipSyncEngine.stop();
          }
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setIsSpeaking(false);
          setStatus('ready');
          resolve(false);
        };
        
        audio.play().catch((e) => {
          console.error('Audio play failed:', e);
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
  }, [setStatus, avatarRendererRef]);
  
  /**
   * Stop current playback
   */
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    const renderer = avatarRendererRef.current;
    if (renderer?.lipSyncEngine) {
      renderer.lipSyncEngine.stop();
    }
    
    setIsSpeaking(false);
    setStatus('ready');
  }, [setStatus, avatarRendererRef]);
  
  /**
   * Replay last spoken text
   */
  const replay = useCallback(() => {
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

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64, contentType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

export default useTTS;
