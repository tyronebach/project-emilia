import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { streamChat } from '../utils/api';

export function useChat() {
  const { 
    sessionId, 
    setStatus, 
    addMessage, 
    updateMessage,
    applyAvatarCommand,
    ttsEnabled
  } = useApp();
  
  const [isLoading, setIsLoading] = useState(false);
  
  const sendMessage = useCallback(async (message) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setStatus('thinking');
    
    try {
      // Create placeholder message for streaming
      const messageId = addMessage('assistant', '', { streaming: true });
      let fullContent = '';
      
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
          // Final update with clean response and metadata
          updateMessage(messageId, {
            content: data.response || fullContent,
            meta: {
              processing_ms: data.processing_ms,
              model: data.model,
              streaming: false
            }
          });
          
          // TTS if enabled
          if (ttsEnabled && data.response) {
            setStatus('speaking');
            // TTS hook will handle playback
          } else {
            setStatus('ready');
          }
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
    } catch (error) {
      console.error('sendMessage error:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 3000);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading, setStatus, addMessage, updateMessage, applyAvatarCommand, ttsEnabled]);
  
  return {
    sendMessage,
    isLoading
  };
}

export default useChat;
