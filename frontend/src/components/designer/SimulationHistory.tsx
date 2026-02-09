import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import TriggerBadge from './TriggerBadge';
import type { SimulationResult } from '../../types/designer';

interface SimulationHistoryProps {
  history: SimulationResult[];
  onClear: () => void;
}

function computeNetVAD(result: SimulationResult): { v: number; a: number; d: number } {
  return {
    v: (result.dimension_deltas['valence'] ?? 0),
    a: (result.dimension_deltas['arousal'] ?? 0),
    d: (result.dimension_deltas['dominance'] ?? 0),
  };
}

function formatDelta(value: number): string {
  if (Math.abs(value) < 0.001) return '0';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function VADChip({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 0.001) return null;
  const color = value > 0 ? 'text-success' : 'text-error';
  return (
    <span className={`font-mono text-[10px] ${color}`}>
      {label}:{formatDelta(value)}
    </span>
  );
}

function SimulationHistory({ history, onClear }: SimulationHistoryProps) {
  return (
    <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          History ({history.length})
        </h4>
        <Button variant="ghost" size="xs" onClick={onClear}>
          <Trash2 className="w-3 h-3" />
          Clear
        </Button>
      </div>

      <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
        {history.map((entry, index) => {
          const vad = computeNetVAD(entry);
          // Derive message snippet from context_block first line, or show trigger summary
          const snippet = entry.context_block
            ? entry.context_block.split('\n')[0]?.slice(0, 80) ?? ''
            : `${entry.detected_triggers.length} trigger(s)`;

          return (
            <div key={index} className="px-4 py-3 space-y-1.5">
              {/* Row 1: index + snippet */}
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-text-secondary/50 mt-0.5 shrink-0">
                  #{history.length - index}
                </span>
                <span className="text-xs text-text-primary truncate">{snippet}</span>
              </div>

              {/* Row 2: trigger badges + VAD deltas */}
              <div className="flex items-center gap-2 flex-wrap pl-5">
                {entry.detected_triggers.map((t) => (
                  <TriggerBadge key={t.trigger} trigger={t.trigger} size="sm" />
                ))}

                {(Math.abs(vad.v) >= 0.001 || Math.abs(vad.a) >= 0.001 || Math.abs(vad.d) >= 0.001) && (
                  <span className="flex items-center gap-1.5 ml-auto">
                    <VADChip label="V" value={vad.v} />
                    <VADChip label="A" value={vad.a} />
                    <VADChip label="D" value={vad.d} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SimulationHistory;
