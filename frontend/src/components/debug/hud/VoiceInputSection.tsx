import { VoiceIndicator } from '../../VoiceIndicator';
import { VoiceDebugTimeline, type VoiceDebugEntry } from '../../VoiceDebugTimeline';
import type { VoiceState } from '../../../services/VoiceService';

export interface VoiceInputSectionProps {
  handsFreeEnabled: boolean;
  voiceState?: VoiceState;
  voiceTranscript?: string;
  voiceDebugEvents?: VoiceDebugEntry[];
  onClearVoiceDebug?: () => void;
}

export function VoiceInputSection({
  handsFreeEnabled,
  voiceState,
  voiceTranscript,
  voiceDebugEvents = [],
  onClearVoiceDebug,
}: VoiceInputSectionProps) {
  return (
    <div>
      <div className="text-[10px] text-text-secondary uppercase mb-2">Voice Input</div>
      <div className="space-y-2">
        <div className="text-[11px] text-text-secondary">
          Hands-free: <span className="text-text-primary">{handsFreeEnabled ? 'On' : 'Off'}</span>
        </div>
        {handsFreeEnabled && voiceState ? (
          <VoiceIndicator
            state={voiceState}
            transcript={voiceTranscript}
            className="items-start"
          />
        ) : (
          <div className="text-[11px] text-text-secondary">
            Hands-free voice is disabled.
          </div>
        )}
        {voiceTranscript && (
          <div className="p-2 bg-bg-tertiary rounded text-[11px] text-text-primary">
            <div className="text-[10px] text-text-secondary mb-1">Last Transcript</div>
            {voiceTranscript}
          </div>
        )}
        <VoiceDebugTimeline
          entries={voiceDebugEvents}
          onClear={onClearVoiceDebug}
          className="max-h-96 overflow-hidden"
          listHeightClass="h-72"
        />
      </div>
    </div>
  );
}
