/**
 * useVoiceChat - React hook for hands-free voice interaction
 * 
 * Integrates VoiceService with chat functionality
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceService, VoiceState } from '../services/VoiceService';

interface UseVoiceChatConfig {
  onTranscript: (text: string) => void;
  onError?: (error: Error) => void;
  silenceTimeout?: number;
  returnToPassiveAfterSpeaking?: boolean;
}

interface UseVoiceChatReturn {
  voiceState: VoiceState;
  isEnabled: boolean;
  isSupported: boolean;
  interimTranscript: string;
  
  // Controls
  enableVoice: () => Promise<void>;
  disableVoice: () => void;
  activate: () => void;
  deactivate: () => void;
  cancel: () => void;
  
  // State notifications
  notifySpeakingDone: () => void;
  setSpeaking: () => void;
  setProcessing: () => void;
}

export function useVoiceChat(config: UseVoiceChatConfig): UseVoiceChatReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('PASSIVE');
  const [isEnabled, setIsEnabled] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  
  const voiceServiceRef = useRef<VoiceService | null>(null);
  const configRef = useRef(config);
  
  // Update config ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const enableVoice = useCallback(async () => {
    if (isEnabled) return;
    
    try {
      const service = new VoiceService();
      
      await service.init({
        onTranscript: (text) => {
          setInterimTranscript('');
          configRef.current.onTranscript(text);
        },
        onStateChange: setVoiceState,
        onError: (error) => {
          console.error('[useVoiceChat] Error:', error);
          configRef.current.onError?.(error);
        },
        onInterimTranscript: setInterimTranscript,
        silenceTimeout: configRef.current.silenceTimeout ?? 10000,
        returnToPassiveAfterSpeaking: configRef.current.returnToPassiveAfterSpeaking ?? false,
      });
      
      await service.start();
      
      voiceServiceRef.current = service;
      setIsEnabled(true);
      
      console.log('[useVoiceChat] Voice enabled');
    } catch (error) {
      console.error('[useVoiceChat] Failed to enable:', error);
      configRef.current.onError?.(error as Error);
    }
  }, [isEnabled]);

  const disableVoice = useCallback(() => {
    if (voiceServiceRef.current) {
      voiceServiceRef.current.destroy();
      voiceServiceRef.current = null;
    }
    setIsEnabled(false);
    setVoiceState('PASSIVE');
    setInterimTranscript('');
    console.log('[useVoiceChat] Voice disabled');
  }, []);

  const activate = useCallback(() => {
    voiceServiceRef.current?.activate();
  }, []);

  const deactivate = useCallback(() => {
    voiceServiceRef.current?.deactivate();
  }, []);

  const cancel = useCallback(() => {
    voiceServiceRef.current?.cancel();
    setInterimTranscript('');
  }, []);

  const notifySpeakingDone = useCallback(() => {
    voiceServiceRef.current?.notifySpeakingDone();
  }, []);

  const setSpeaking = useCallback(() => {
    voiceServiceRef.current?.setSpeaking();
  }, []);

  const setProcessing = useCallback(() => {
    voiceServiceRef.current?.setProcessing();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceServiceRef.current) {
        voiceServiceRef.current.destroy();
      }
    };
  }, []);

  // Check STT support
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  return {
    voiceState,
    isEnabled,
    isSupported,
    interimTranscript,
    enableVoice,
    disableVoice,
    activate,
    deactivate,
    cancel,
    notifySpeakingDone,
    setSpeaking,
    setProcessing,
  };
}
