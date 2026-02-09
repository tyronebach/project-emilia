import { useState, useCallback } from 'react';
import { X, Archive, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../../store';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '../../ui/dialog';
import { fetchWithAuth } from '../../../utils/api';
import type { CompactionDebug } from '../types';

export function CompactionSection() {
  const sessionId = useAppStore((s) => s.sessionId);
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

  return (
    <>
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

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {compactionError && (
              <div className="text-xs text-error bg-error/10 rounded px-3 py-2">{compactionError}</div>
            )}

            {compactionLoading && !compactionData && (
              <div className="text-xs text-text-secondary text-center py-6">Loading...</div>
            )}

            {compactionData && (
              <>
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
    </>
  );
}
