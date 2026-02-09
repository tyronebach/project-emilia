import { useMemo } from 'react';
import { useStatsStore } from '../../../store/statsStore';

export function LatencySection() {
  const { stageLatencies } = useStatsStore();

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

  if (Object.keys(stageStats).length === 0) return null;

  return (
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
  );
}
