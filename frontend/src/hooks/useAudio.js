import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';

export function useAudio() {
  const { setStatus, addMessage } = useApp();
  
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  
  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      
      // Prefer opus codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      
      setIsRecording(true);
      setStatus('recording');
      console.log('[useAudio] Recording started');
    } catch (error) {
      console.error('[useAudio] Failed to start recording:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 2000);
    }
  }, [isRecording, setStatus]);
  
  /**
   * Stop recording and transcribe
   */
  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return null;
    
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Create blob from chunks
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        
        console.log('[useAudio] Recording stopped, blob size:', blob.size);
        
        // Transcribe
        const text = await transcribeAudio(blob);
        resolve(text);
      };
      
      mediaRecorder.stop();
      setIsRecording(false);
      setStatus('thinking');
    });
  }, [isRecording, setStatus]);
  
  /**
   * Transcribe audio blob
   */
  const transcribeAudio = useCallback(async (blob) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer emilia-dev-token-2026'
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log('[useAudio] Transcription:', result.text);
      setTranscription(result.text);
      
      return result.text || null;
    } catch (error) {
      console.error('[useAudio] Transcription error:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 2000);
      return null;
    }
  }, [setStatus]);
  
  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;
    
    // Stop recording without processing
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    
    setIsRecording(false);
    setStatus('ready');
    console.log('[useAudio] Recording cancelled');
  }, [isRecording, setStatus]);
  
  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording,
    transcription
  };
}

export default useAudio;
