import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';

export function useAudio() {
  const { setStatus, addMessage } = useApp();
  const { sendMessage } = useChat();
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Create blob from chunks
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Send to transcription API
        await transcribeAudio(blob);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      
      setIsRecording(true);
      setStatus('recording');
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 2000);
    }
  }, [isRecording, setStatus]);
  
  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;
    
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setStatus('thinking'); // Will be processing the audio
    console.log('Recording stopped');
  }, [isRecording, setStatus]);
  
  const transcribeAudio = useCallback(async (blob) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      
      const response = await fetchWithAuth('/api/transcribe', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type - let browser set it with boundary
        }
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.text && result.text.trim()) {
        // Add user message with transcription
        addMessage('user', result.text, { source: 'voice' });
        
        // Get AI response (import sendMessage dynamically to avoid circular dep)
        const { sendMessage } = await import('./useChat').then(m => ({ sendMessage: null }));
        // Note: This is handled by InputControls which has access to both hooks
      }
      
      console.log('Transcription:', result.text);
    } catch (error) {
      console.error('Transcription error:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 2000);
    }
  }, [addMessage, setStatus]);
  
  return {
    startRecording,
    stopRecording,
    isRecording
  };
}

// Import useChat at module level but use lazily
function useChat() {
  // Placeholder - the actual hook is used in InputControls
  return { sendMessage: async () => {} };
}

export default useAudio;
