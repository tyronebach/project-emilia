import { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { useVoiceChat } from '../../../hooks/useVoiceChat';
import { VoiceIndicator } from '../../VoiceIndicator';
import { VoiceToggle } from '../../VoiceToggle';
import { VoiceDebugTimeline, type VoiceDebugEntry } from '../../VoiceDebugTimeline';
import { useAvatarDebug } from './AvatarDebugContext';

const MAX_VOICE_DEBUG_EVENTS = 80;

export function VoiceChatSection() {
  const { setLastAction } = useAvatarDebug();

  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceDebugEvents, setVoiceDebugEvents] = useState<VoiceDebugEntry[]>([]);
  const voiceEnabledRef = useRef<boolean | null>(null);

  const addVoiceDebugEvent = useCallback((event: VoiceDebugEntry['event']) => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setVoiceDebugEvents((prev) => {
      const next = [...prev, { id, time, event }];
      return next.slice(-MAX_VOICE_DEBUG_EVENTS);
    });
  }, []);

  const clearVoiceDebugEvents = useCallback(() => {
    setVoiceDebugEvents([]);
  }, []);

  const voiceChat = useVoiceChat({
    onTranscript: (text) => {
      setVoiceTranscript(text);
      setLastAction(`Voice: "${text.slice(0, 30)}..."`);
      console.log('[Voice] Transcript:', text);
    },
    onError: (error) => {
      setLastAction(`Voice Error: ${error.message}`);
    },
    onDebugEvent: addVoiceDebugEvent,
    silenceTimeout: 15000,
    autoResumeAfterTranscript: true,
  });

  useEffect(() => {
    if (voiceEnabledRef.current === null) {
      voiceEnabledRef.current = voiceChat.isEnabled;
      return;
    }
    if (voiceEnabledRef.current !== voiceChat.isEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing events on toggle change
      clearVoiceDebugEvents();
      voiceEnabledRef.current = voiceChat.isEnabled;
    }
  }, [voiceChat.isEnabled, clearVoiceDebugEvents]);

  return (
    <AccordionItem value="voice-chat" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        <span className="flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Hands-Free Voice ⭐
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <VoiceIndicator
            state={voiceChat.voiceState}
            transcript={voiceChat.interimTranscript}
          />

          <VoiceToggle
            isEnabled={voiceChat.isEnabled}
            isSupported={voiceChat.isSupported}
            state={voiceChat.voiceState}
            onEnable={voiceChat.enableVoice}
            onDisable={voiceChat.disableVoice}
            onActivate={voiceChat.activate}
            onDeactivate={voiceChat.deactivate}
            onCancel={voiceChat.cancel}
          />

          {voiceTranscript && (
            <div className="p-3 bg-bg-tertiary/80 border border-white/10 rounded-lg">
              <div className="text-xs text-text-secondary mb-1">Last Transcript:</div>
              <div className="text-sm text-text-primary">{voiceTranscript}</div>
            </div>
          )}

          <VoiceDebugTimeline
            entries={voiceDebugEvents}
            onClear={clearVoiceDebugEvents}
            className="max-h-72 overflow-hidden"
            listHeightClass="h-40"
          />

          <div className="text-xs text-text-secondary space-y-1 bg-bg-tertiary/80 border border-white/10 p-2 rounded">
            <div className="font-semibold">How it works:</div>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Enable Voice → starts wake word listener (mocked)</li>
              <li>Click "Start Listening" → activates VAD + STT</li>
              <li>Speak, pause → VAD detects silence → STT transcribes</li>
              <li>Audio sent to backend `/api/transcribe`</li>
              <li>Transcript logged (would send to /api/chat)</li>
            </ol>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
