import { Volume2 } from 'lucide-react';
import { useAppStore } from '../../../store';
import { useVoiceOptions } from '../../../hooks/useVoiceOptions';
import { CollapsibleSection } from './CollapsibleSection';

export function TtsVoiceSection() {
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const setTtsVoiceId = useAppStore((s) => s.setTtsVoiceId);
  const { voices: voiceOptions } = useVoiceOptions();

  return (
    <CollapsibleSection
      id="hud-tts-voice"
      label="TTS Voice"
      icon={Volume2}
      iconColor="text-cyan-400"
    >
      <select
        value={ttsVoiceId || ''}
        onChange={(e) => setTtsVoiceId(e.target.value)}
        className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1 text-[11px] text-text-primary focus:border-accent focus:outline-none"
      >
        <option value="">Agent default</option>
        {voiceOptions.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.name} ({voice.id})
          </option>
        ))}
      </select>
    </CollapsibleSection>
  );
}
