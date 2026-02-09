import { X, Activity } from 'lucide-react';
import { Button } from './ui/button';
import { useDebugPanelStore } from './debug/debugPanelStore';
import { SectionToggle } from './debug/SectionToggle';
import { hudSections, VoiceInputSection } from './debug/hud';
import type { VoiceDebugEntry } from './VoiceDebugTimeline';
import type { VoiceState } from '../services/VoiceService';

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
  handsFreeEnabled?: boolean;
  voiceState?: VoiceState;
  voiceTranscript?: string;
  voiceDebugEvents?: VoiceDebugEntry[];
  onClearVoiceDebug?: () => void;
}

function DebugPanel({
  open,
  onClose,
  handsFreeEnabled = false,
  voiceState,
  voiceTranscript,
  voiceDebugEvents = [],
  onClearVoiceDebug,
}: DebugPanelProps) {
  const { isEnabled } = useDebugPanelStore();

  if (!open) return null;

  return (
    <div className="fixed top-12 md:top-16 right-4 bottom-28 w-[22rem] max-w-[92vw] bg-bg-primary/70 backdrop-blur-md border border-white/10 rounded-2xl z-30 flex flex-col overflow-hidden shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9)]">
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-accent" />
          <span className="text-xs font-medium text-text-primary">Debug HUD</span>
        </div>
        <div className="flex items-center gap-1">
          <SectionToggle sections={hudSections} />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {hudSections
          .filter((s) => isEnabled(s.id, s.defaultEnabled))
          .map((s) =>
            s.id === 'hud-voice-input' ? (
              <VoiceInputSection
                key={s.id}
                handsFreeEnabled={handsFreeEnabled}
                voiceState={voiceState}
                voiceTranscript={voiceTranscript}
                voiceDebugEvents={voiceDebugEvents}
                onClearVoiceDebug={onClearVoiceDebug}
              />
            ) : (
              <s.component key={s.id} />
            ),
          )}
      </div>
    </div>
  );
}

export default DebugPanel;
