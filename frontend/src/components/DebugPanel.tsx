import { X, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { Button } from './ui/button';
import type { AppStatus } from '../types';

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

function DebugPanel({ open, onClose }: DebugPanelProps) {
  const { messages, status, ttsEnabled } = useApp();
  const { sessionId } = useSession();
  const { totalLatency, latencyCount, stateLog } = useStatsStore();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);

  const userMessages = messages.filter((m) => m.role === 'user').length;
  const assistantMessages = messages.filter((m) => m.role === 'assistant').length;
  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

  const getStatusColor = (s: AppStatus): string => {
    switch (s) {
      case 'ready': return 'bg-green-500';
      case 'thinking': return 'bg-yellow-500 animate-pulse';
      case 'speaking': return 'bg-blue-500 animate-pulse';
      case 'recording': return 'bg-red-500 animate-pulse';
      case 'processing': return 'bg-yellow-500 animate-pulse';
      case 'initializing': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!open) return null;

  return (
    <div className="fixed top-14 right-0 h-[50vh] w-72 bg-black/50 backdrop-blur-sm border-l border-b border-white/10 rounded-bl-lg z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-accent" />
          <span className="text-xs font-medium text-text-primary">Debug</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(status)}`} />
          <span className="text-xs font-medium text-text-primary capitalize">{status}</span>
        </div>

        {/* Session */}
        <div>
          <div className="text-[10px] text-text-secondary uppercase">Session</div>
          <div className="text-xs text-text-primary font-mono truncate">{sessionId}</div>
        </div>

        {/* Context */}
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">User:</span>
            <span className="text-text-primary truncate">{currentUser?.display_name || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">Agent:</span>
            <span className="text-accent truncate">{currentAgent?.display_name || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-secondary">TTS:</span>
            <span className={ttsEnabled ? 'text-green-400' : 'text-text-secondary'}>{ttsEnabled ? 'On' : 'Off'}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-1 text-xs">
          <div className="bg-white/5 rounded px-2 py-1">
            <div className="text-sm font-bold text-text-primary">{userMessages}</div>
            <div className="text-[10px] text-text-secondary">User</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1">
            <div className="text-sm font-bold text-accent">{assistantMessages}</div>
            <div className="text-[10px] text-text-secondary">Agent</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1">
            <div className="text-sm font-bold text-text-primary">{avgLatency}ms</div>
            <div className="text-[10px] text-text-secondary">Latency</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1">
            <div className="text-sm font-bold text-text-primary">{latencyCount}</div>
            <div className="text-[10px] text-text-secondary">Responses</div>
          </div>
        </div>

        {/* State Log */}
        <div>
          <div className="text-[10px] text-text-secondary uppercase mb-1">State Log</div>
          <div className="space-y-0.5 text-[10px]">
            {stateLog.slice(0, 15).map((entry, index) => (
              <div key={`${entry.timestamp.getTime()}-${index}`} className="flex gap-1">
                <span className="text-text-secondary/60 font-mono shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="text-text-primary truncate">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebugPanel;
