import { useMemo } from 'react';
import { X, Activity, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { Button } from './ui/button';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import type { AppStatus } from '../types';

interface DebugPanelProps {
  open: boolean;
  onClose: () => void;
}

function DebugPanel({ open, onClose }: DebugPanelProps) {
  const { messages, status, ttsEnabled, ttsVoiceId, setTtsVoiceId, errors, sessionId } = useApp();
  const { totalLatency, latencyCount, stateLog, stageLatencies } = useStatsStore();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const { voices: voiceOptions } = useVoiceOptions();

  const userMessages = messages.filter((m) => m.role === 'user').length;
  const assistantMessages = messages.filter((m) => m.role === 'assistant').length;
  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

  // Calculate P50 and P95 for each stage
  const stageStats = useMemo(() => {
    const stats: Record<string, { p50: number; p95: number; count: number }> = {};
    
    for (const [stage, times] of Object.entries(stageLatencies || {})) {
      if (times.length === 0) continue;
      
      const sorted = [...times].sort((a, b) => a - b);
      const p50Index = Math.floor(sorted.length * 0.5);
      const p95Index = Math.floor(sorted.length * 0.95);
      
      stats[stage] = {
        p50: Math.round(sorted[p50Index] || 0),
        p95: Math.round(sorted[Math.min(p95Index, sorted.length - 1)] || 0),
        count: sorted.length,
      };
    }
    
    return stats;
  }, [stageLatencies]);

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

  // Get recent errors
  const recentErrors = useMemo(() => {
    return (errors || []).slice(-5);
  }, [errors]);

  if (!open) return null;

  return (
    <div className="fixed top-14 right-0 h-[60vh] w-80 bg-black/50 backdrop-blur-sm border-l border-b border-white/10 rounded-bl-lg z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-8 px-2 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-accent" />
          <span className="text-xs font-medium text-text-primary">Debug HUD</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Status Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(status)}`} />
            <span className="text-xs font-medium text-text-primary capitalize">{status}</span>
          </div>
          <div className="text-xs text-text-secondary font-mono">
            {sessionId ? sessionId.slice(0, 8) + '...' : '—'}
          </div>
        </div>

        {/* Context */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-text-secondary">User: </span>
            <span className="text-text-primary">{currentUser?.display_name || '—'}</span>
          </div>
          <div>
            <span className="text-text-secondary">Agent: </span>
            <span className="text-accent">{currentAgent?.display_name || '—'}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1 text-xs">
          <div className="bg-white/5 rounded px-2 py-1 text-center">
            <div className="text-sm font-bold text-text-primary">{userMessages}</div>
            <div className="text-[10px] text-text-secondary">User</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1 text-center">
            <div className="text-sm font-bold text-accent">{assistantMessages}</div>
            <div className="text-[10px] text-text-secondary">Agent</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1 text-center">
            <div className="text-sm font-bold text-text-primary">{avgLatency}ms</div>
            <div className="text-[10px] text-text-secondary">Avg</div>
          </div>
          <div className="bg-white/5 rounded px-2 py-1 text-center">
            <div className="text-sm font-bold text-text-primary">{ttsEnabled ? 'On' : 'Off'}</div>
            <div className="text-[10px] text-text-secondary">TTS</div>
          </div>
        </div>

        {/* TTS Voice */}
        <div>
          <div className="text-[10px] text-text-secondary uppercase mb-1">TTS Voice</div>
          <select
            value={ttsVoiceId || ''}
            onChange={(e) => setTtsVoiceId(e.target.value)}
            className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-[11px] text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Agent default</option>
            {voiceOptions.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.id})
              </option>
            ))}
          </select>
        </div>

        {/* Per-Stage Latency */}
        {Object.keys(stageStats).length > 0 && (
          <div>
            <div className="text-[10px] text-text-secondary uppercase mb-1">Latency (P50 / P95)</div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {Object.entries(stageStats).map(([stage, stats]) => (
                <div key={stage} className="bg-white/5 rounded px-2 py-1">
                  <div className="text-text-secondary capitalize">{stage}</div>
                  <div className="text-text-primary font-mono">
                    {stats.p50}ms / {stats.p95}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {recentErrors.length > 0 && (
          <div>
            <div className="text-[10px] text-error uppercase mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Errors
            </div>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {recentErrors.map((err, i) => (
                <div key={i} className="text-[10px] text-error/80 bg-error/10 rounded px-2 py-1">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State Log - Scrollable with fixed height */}
        <div>
          <div className="text-[10px] text-text-secondary uppercase mb-1">State Log</div>
          <div className="max-h-[200px] overflow-y-auto bg-white/5 rounded p-1">
            <div className="space-y-0.5 text-[10px]">
              {stateLog.slice(0, 50).map((entry, index) => (
                <div key={`${entry.timestamp.getTime()}-${index}`} className="flex gap-1">
                  <span className="text-text-secondary/60 font-mono shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="text-text-primary">{entry.text}</span>
                </div>
              ))}
              {stateLog.length === 0 && (
                <div className="text-text-secondary/50 text-center py-2">No events yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebugPanel;
