import { useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { streamChat } from '../utils/api';

export function useChat() {
  const { 
    sessionId, 
    setStatus, 
    addMessage, 
    updateMessage,
    applyAvatarCommand,
    ttsEnabled,
    avatarRendererRef
  } = useApp();
  
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef(null);
  
  /**
   * Speak text using TTS
   */
  const speakText = useCallback(async (text) => {
    if (!text || !text.trim()) return;
    
    try {
      setStatus('speaking');
      
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer emilia-dev-token-2026',
          'Content-Type': 'application/json'
        },
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
      await new Promise((resolve) => {
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
        
        audio.play().catch(resolve);
      });
    } catch (error) {
      console.error('TTS error:', error);
    } finally {
      setStatus('ready');
    }
  }, [setStatus, avatarRendererRef]);
  
  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (message) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setStatus('thinking');
    
    // Create abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      // Create placeholder message for streaming
      const messageId = addMessage('assistant', '', { streaming: true });
      let fullContent = '';
      let finalResponse = null;
      
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
          
          // Final update with clean response and metadata
          updateMessage(messageId, {
            content: data.response || fullContent,
            meta: {
              processing_ms: data.processing_ms,
              model: data.model,
              streaming: false
            }
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
      if (ttsEnabled && finalResponse?.response) {
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
