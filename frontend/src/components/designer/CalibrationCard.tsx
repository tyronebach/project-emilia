import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import TriggerBadge from './TriggerBadge';
import { TRIGGER_TAXONOMY, type TriggerCategory, type ContextualCalibration } from '../../types/designer';

interface CalibrationCardProps {
  calibration: ContextualCalibration;
  onReset?: (triggerType: string) => void;
}

function getCategoryForTrigger(trigger: string): TriggerCategory | null {
  for (const [category, triggers] of Object.entries(TRIGGER_TAXONOMY)) {
    if ((triggers as readonly string[]).includes(trigger)) {
      return category as TriggerCategory;
    }
  }
  return null;
}

function getMultiplierColor(value: number): string {
  if (value < 0.8) return 'text-error';
  if (value <= 1.0) return 'text-warning';
  if (value <= 1.2) return 'text-success';
  return 'text-info';
}

function getMultiplierBarColor(value: number): string {
  if (value < 0.8) return 'bg-error';
  if (value <= 1.0) return 'bg-warning';
  if (value <= 1.2) return 'bg-success';
  return 'bg-info';
}

function getBucketMultiplierBg(value: number): string {
  if (value < 0.7) return 'bg-error/20 text-error';
  if (value < 0.95) return 'bg-warning/20 text-warning';
  if (value <= 1.05) return 'bg-white/10 text-text-secondary';
  if (value <= 1.3) return 'bg-success/20 text-success';
  return 'bg-info/20 text-info';
}

const CATEGORY_BADGE_COLORS: Record<TriggerCategory, string> = {
  play: 'bg-info/15 text-info border-info/30',
  care: 'bg-success/15 text-success border-success/30',
  friction: 'bg-error/15 text-error border-error/30',
  repair: 'bg-warning/15 text-warning border-warning/30',
  vulnerability: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function CalibrationCard({ calibration, onReset }: CalibrationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { trigger_type, global: g, buckets } = calibration;

  const category = getCategoryForTrigger(trigger_type);
  const categoryBadge = category
    ? CATEGORY_BADGE_COLORS[category]
    : 'bg-white/10 text-text-secondary border-white/20';

  const isLowConfidence = g.occurrence_count < 30;

  // Normalize multiplier to a bar percentage (0.5 -> 0%, 1.5 -> 100%, 1.0 -> 50%)
  const barPct = Math.max(0, Math.min(100, ((g.learned_multiplier - 0.5) / 1.0) * 100));

  return (
    <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl shadow-[0_20px_40px_-30px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between text-left p-5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <TriggerBadge trigger={trigger_type} />
          {category && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${categoryBadge}`}>
              {category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono font-medium ${getMultiplierColor(g.learned_multiplier)}`}>
            x{g.learned_multiplier.toFixed(3)}
          </span>
          <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Global Multiplier Bar */}
      <div className="px-5 pb-3">
        <p className="text-[10px] text-text-secondary/50 mb-1.5">Learned multiplier — below 1.0 means the agent dials this trigger down, above 1.0 means it leans in.</p>
        <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getMultiplierBarColor(g.learned_multiplier)}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="border-t border-white/10 pt-4" />

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-bg-tertiary/50 rounded-lg p-3" title="How many times this trigger has been detected">
              <span className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1">Occurrences</span>
              <span className="text-sm font-mono">{g.occurrence_count}</span>
            </div>
            <div className="bg-bg-tertiary/50 rounded-lg p-3" title="Accumulated weight from interactions where the outcome was positive">
              <span className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1">Positive</span>
              <span className="text-sm font-mono text-success">{g.positive_weight.toFixed(2)}</span>
            </div>
            <div className="bg-bg-tertiary/50 rounded-lg p-3" title="Accumulated weight from interactions where the outcome was negative">
              <span className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1">Negative</span>
              <span className="text-sm font-mono text-error">{g.negative_weight.toFixed(2)}</span>
            </div>
            <div className="bg-bg-tertiary/50 rounded-lg p-3" title="Accumulated weight from interactions with no strong outcome">
              <span className="block text-[10px] text-text-secondary uppercase tracking-wider mb-1">Neutral</span>
              <span className="text-sm font-mono text-text-secondary">{g.neutral_weight.toFixed(2)}</span>
            </div>
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary" title="Calibration is more reliable with more data points. 30+ samples = confident.">Confidence:</span>
            {isLowConfidence ? (
              <span className="text-xs font-medium text-warning">Low confidence ({g.occurrence_count}/30 samples)</span>
            ) : (
              <span className="text-xs font-medium text-success">Confident ({g.occurrence_count} samples)</span>
            )}
          </div>

          {/* Context Buckets Table */}
          {buckets.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">Context Buckets</h4>
              <p className="text-[10px] text-text-secondary/50 mb-2">Different situations can produce different multipliers. The same trigger may land differently depending on trust level and arousal state.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-3 text-text-secondary font-medium">Key</th>
                      <th className="text-right py-2 px-3 text-text-secondary font-medium">Multiplier</th>
                      <th className="text-right py-2 pl-3 text-text-secondary font-medium">Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((bucket) => (
                      <tr key={bucket.key} className="border-b border-white/5">
                        <td className="py-2 pr-3 font-mono">{bucket.key}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`font-mono px-1.5 py-0.5 rounded ${getBucketMultiplierBg(bucket.calibration.learned_multiplier)}`}>
                            x{bucket.calibration.learned_multiplier.toFixed(3)}
                          </span>
                        </td>
                        <td className="py-2 pl-3 text-right font-mono text-text-secondary">
                          {bucket.calibration.occurrence_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {buckets.length === 0 && (
            <p className="text-xs text-text-secondary">No context buckets recorded yet.</p>
          )}

          {/* Reset */}
          {onReset && (
            <div className="pt-3 border-t border-bg-tertiary flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:text-error"
                onClick={() => onReset(trigger_type)}
              >
                <RotateCcw className="w-4 h-4" />
                Reset Trigger
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CalibrationCard;
