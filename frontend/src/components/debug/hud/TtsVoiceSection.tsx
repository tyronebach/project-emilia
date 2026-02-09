import { useAppStore } from '../../../store';
import { useVoiceOptions } from '../../../hooks/useVoiceOptions';

export function TtsVoiceSection() {
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const setTtsVoiceId = useAppStore((s) => s.setTtsVoiceId);
  const { voices: voiceOptions } = useVoiceOptions();

  return (
    <div>
      <div className="text-[10px] text-text-secondary uppercase mb-1">TTS Voice</div>
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
    </div>
  );
}
