import { BarChart3 } from 'lucide-react';
import { useChatStore } from '../../../store/chatStore';
import { useStatsStore } from '../../../store/statsStore';
import { useAppStore } from '../../../store';
import { CollapsibleSection } from './CollapsibleSection';

export function StatsSection() {
  const messages = useChatStore((s) => s.messages);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const { totalLatency, latencyCount } = useStatsStore();

  const userMessages = messages.filter((m) => m.sender_type === 'user').length;
  const assistantMessages = messages.filter((m) => m.sender_type === 'agent').length;
  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

  return (
    <CollapsibleSection
      id="hud-stats"
      label="Message Stats"
      icon={BarChart3}
      iconColor="text-green-400"
      defaultExpanded
    >
      <div className="grid grid-cols-4 gap-1 text-xs">
        <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
          <div className="text-sm font-bold text-text-primary">{userMessages}</div>
          <div className="text-[10px] text-text-secondary">User</div>
        </div>
        <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
          <div className="text-sm font-bold text-accent">{assistantMessages}</div>
          <div className="text-[10px] text-text-secondary">Agent</div>
        </div>
        <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
          <div className="text-sm font-bold text-text-primary">{avgLatency}ms</div>
          <div className="text-[10px] text-text-secondary">Avg</div>
        </div>
        <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
          <div className="text-sm font-bold text-text-primary">{ttsEnabled ? 'On' : 'Off'}</div>
          <div className="text-[10px] text-text-secondary">TTS</div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
