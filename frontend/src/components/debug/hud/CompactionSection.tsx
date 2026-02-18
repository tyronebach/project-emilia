import { useState, useCallback, useEffect } from 'react';
import { Archive } from 'lucide-react';
import { useAppStore } from '../../../store';
import { fetchWithAuth } from '../../../utils/api';
import { CollapsibleSection } from './CollapsibleSection';
import type { CompactionDebug } from '../types';

export function CompactionSection() {
  const roomId = useAppStore((s) => s.roomId);
  const [compactionData, setCompactionData] = useState<CompactionDebug | null>(null);
  const [compactionLoading, setCompactionLoading] = useState(false);
  const [compactionError, setCompactionError] = useState<string | null>(null);

  const fetchCompaction = useCallback(async () => {
    if (!roomId) return;
    setCompactionLoading(true);
    setCompactionError(null);
    try {
      const res = await fetchWithAuth(`/api/manage/debug/compaction/${encodeURIComponent(roomId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setCompactionData(await res.json());
    } catch (e) {
      setCompactionError((e as Error).message);
    } finally {
      setCompactionLoading(false);
    }
  }, [roomId]);

  // Fetch on mount/roomId change
  useEffect(() => {
    if (roomId) {
      fetchCompaction();
    }
  }, [roomId, fetchCompaction]);

  const statusBadge = compactionData ? (
    <span
      className={`ml-2 px-1.5 py-0.5 text-[9px] font-medium rounded ${
        compactionData.should_compact
          ? 'bg-warning/20 text-warning'
          : 'bg-success/20 text-success'
      }`}
    >
      {compactionData.should_compact ? 'Pending' : 'OK'}
    </span>
  ) : null;

  return (
    <CollapsibleSection
      id="hud-compaction"
      label="Room Compaction"
      icon={Archive}
      iconColor="text-orange-400"
      loading={compactionLoading}
      onRefresh={fetchCompaction}
      refreshDisabled={!roomId}
      badge={statusBadge}
    >
      {compactionError && (
        <div className="text-xs text-error bg-error/10 rounded px-2 py-1">{compactionError}</div>
      )}

      {!roomId ? (
        <div className="text-[10px] text-text-secondary text-center py-2">
          No active room
        </div>
      ) : compactionData ? (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-1 text-xs">
            <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
              <div className="text-sm font-bold text-accent">{compactionData.compaction_count}</div>
              <div className="text-[10px] text-text-secondary">Compactions</div>
            </div>
            <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
              <div className="text-sm font-bold text-text-primary">{compactionData.message_count_actual}</div>
              <div className="text-[10px] text-text-secondary">Messages</div>
            </div>
            <div className="bg-bg-secondary/60 rounded px-2 py-1 text-center border border-white/10">
              <div className="text-sm font-bold text-text-primary">{compactionData.config.threshold}</div>
              <div className="text-[10px] text-text-secondary">Threshold</div>
            </div>
          </div>

          {/* Config Details */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Room</span>
              <span className="text-text-primary font-mono text-[10px]">
                {compactionData.session_name || compactionData.session_id?.slice(0, 12) || roomId.slice(0, 12)}
              </span>
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
                  {new Date(compactionData.summary_updated_at * 1000).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
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
              <div className="bg-bg-tertiary/80 rounded-lg p-2 text-[10px] text-text-primary leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap border border-white/5">
                {compactionData.summary}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-text-secondary/60 text-center py-2 bg-bg-tertiary/40 rounded">
              No compaction has occurred yet
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-text-secondary text-center py-2">
          {compactionLoading ? 'Loading...' : 'No data'}
        </div>
      )}
    </CollapsibleSection>
  );
}
