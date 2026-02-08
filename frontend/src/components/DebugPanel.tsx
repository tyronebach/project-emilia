import { useMemo, useState, useCallback } from 'react';
import { X, Activity, AlertCircle, Archive, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './ui/dialog';
import { fetchWithAuth } from '../utils/api';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { VoiceIndicator } from './VoiceIndicator';
import { VoiceDebugTimeline, type VoiceDebugEntry } from './VoiceDebugTimeline';
import { STATUS_COLORS } from '../types';
import type { AppStatus } from '../types';
import type { VoiceState } from '../services/VoiceService';

interface CompactionDebug {
  session_id: string;
  session_name: string | null;
  message_count_cached: number;
  message_count_actual: number;
  summary: string | null;
  summary_length: number;
  summary_updated_at: number | null;
  compaction_count: number;
  config: { threshold: number; keep_recent: number; model: string };
  should_compact: boolean;
}

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
  const messages = useChatStore((s) => s.messages);
  const status = useAppStore((s) => s.status);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const setTtsVoiceId = useAppStore((s) => s.setTtsVoiceId);
  const errors = useAppStore((s) => s.errors);
  const sessionId = useAppStore((s) => s.sessionId);
  const { totalLatency, latencyCount, stateLog, stageLatencies } = useStatsStore();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const { voices: voiceOptions } = useVoiceOptions();

  // Compaction modal state
  const [compactionOpen, setCompactionOpen] = useState(false);
  const [compactionData, setCompactionData] = useState<CompactionDebug | null>(null);
  const [compactionLoading, setCompactionLoading] = useState(false);
  const [compactionError, setCompactionError] = useState<string | null>(null);

  const fetchCompaction = useCallback(async () => {
    if (!sessionId) return;
    setCompactionLoading(true);
    setCompactionError(null);
    try {
      const res = await fetchWithAuth(`/api/manage/debug/compaction/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setCompactionData(await res.json());
    } catch (e) {
      setCompactionError((e as Error).message);
    } finally {
      setCompactionLoading(false);
    }
  }, [sessionId]);

  const openCompaction = useCallback(() => {
    setCompactionOpen(true);
    fetchCompaction();
  }, [fetchCompaction]);

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

  const getStatusColor = (s: AppStatus): string => STATUS_COLORS[s] ?? 'bg-text-secondary/60';

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Get recent errors
  const recentErrors = useMemo(() => {
    return (errors || []).slice(-5);
  }, [errors]);

  if (!open) return null;

  return (
    <div className="fixed top-12 md:top-16 right-4 bottom-28 w-[22rem] max-w-[92vw] bg-bg-primary/70 backdrop-blur-md border border-white/10 rounded-2xl z-30 flex flex-col overflow-hidden shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9)]">
      {/* Header */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-white/10 shrink-0">
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

        {/* Compaction */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-text-secondary hover:text-text-primary h-7"
          onClick={openCompaction}
          disabled={!sessionId}
        >
          <Archive className="w-3 h-3" />
          Session Compaction
        </Button>

        <Dialog open={compactionOpen} onOpenChange={(next) => { if (!next) setCompactionOpen(false); }}>
          <DialogContent className="w-[28rem] max-w-[92vw] max-h-[80vh] overflow-hidden flex flex-col p-0">
            {/* Header */}
            <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-accent" />
                <DialogTitle>Session Compaction</DialogTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchCompaction} disabled={compactionLoading}>
                  <RefreshCw className={`w-3 h-3 ${compactionLoading ? 'animate-spin' : ''}`} />
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <X className="w-3 h-3" />
                  </Button>
                </DialogClose>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {compactionError && (
                <div className="text-xs text-error bg-error/10 rounded px-3 py-2">{compactionError}</div>
              )}

              {compactionLoading && !compactionData && (
                <div className="text-xs text-text-secondary text-center py-6">Loading...</div>
              )}

              {compactionData && (
                <>
                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-bg-tertiary/60 rounded px-3 py-2 text-center border border-white/10">
                      <div className="text-sm font-bold text-accent">{compactionData.compaction_count}</div>
                      <div className="text-[10px] text-text-secondary">Compactions</div>
                    </div>
                    <div className="bg-bg-tertiary/60 rounded px-3 py-2 text-center border border-white/10">
                      <div className="text-sm font-bold text-text-primary">{compactionData.message_count_actual}</div>
                      <div className="text-[10px] text-text-secondary">Messages</div>
                    </div>
                    <div className="bg-bg-tertiary/60 rounded px-3 py-2 text-center border border-white/10">
                      <div className={`text-sm font-bold ${compactionData.should_compact ? 'text-warning' : 'text-success'}`}>
                        {compactionData.should_compact ? 'Pending' : 'OK'}
                      </div>
                      <div className="text-[10px] text-text-secondary">Status</div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Session</span>
                      <span className="text-text-primary font-mono">{compactionData.session_name || compactionData.session_id.slice(0, 12)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Threshold</span>
                      <span className="text-text-primary">{compactionData.config.threshold} messages</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Keep recent</span>
                      <span className="text-text-primary">{compactionData.config.keep_recent} messages</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Model</span>
                      <span className="text-text-primary font-mono text-[10px]">{compactionData.config.model}</span>
                    </div>
                    {compactionData.summary_updated_at && (
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Last compacted</span>
                        <span className="text-text-primary">
                          {new Date(compactionData.summary_updated_at * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  {compactionData.summary ? (
                    <div>
                      <div className="text-[10px] text-text-secondary uppercase mb-1">
                        Summary ({compactionData.summary_length} chars)
                      </div>
                      <div className="bg-bg-tertiary/80 rounded-lg p-3 text-xs text-text-primary leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap border border-white/5">
                        {compactionData.summary}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-text-secondary/60 text-center py-3 bg-bg-tertiary/40 rounded-lg">
                      No compaction has occurred yet for this session.
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* TTS Voice */}
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

        {/* Hands-Free Voice (View Only) */}
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
