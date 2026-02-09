import { useMemo } from 'react';
import { TRIGGER_TAXONOMY, type TriggerCategory, type ContextualCalibration } from '../../types/designer';

interface CalibrationHeatmapProps {
  calibrations: ContextualCalibration[];
}

function getCategoryForTrigger(trigger: string): TriggerCategory | null {
  for (const [category, triggers] of Object.entries(TRIGGER_TAXONOMY)) {
    if ((triggers as readonly string[]).includes(trigger)) {
      return category as TriggerCategory;
    }
  }
  return null;
}

function getCellStyle(value: number): string {
  if (value < 0.7) return 'bg-error/25 text-error';
  if (value < 0.95) return 'bg-warning/25 text-warning';
  if (value <= 1.05) return 'bg-white/8 text-text-secondary';
  if (value <= 1.3) return 'bg-success/25 text-success';
  return 'bg-info/25 text-info';
}

const CATEGORY_ROW_BORDER: Record<TriggerCategory, string> = {
  play: 'border-l-info/50',
  care: 'border-l-success/50',
  friction: 'border-l-error/50',
  repair: 'border-l-warning/50',
  vulnerability: 'border-l-purple-500/50',
};

function CalibrationHeatmap({ calibrations }: CalibrationHeatmapProps) {
  // Collect all unique bucket keys across all calibrations
  const bucketKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const cal of calibrations) {
      for (const bucket of cal.buckets) {
        keys.add(bucket.key);
      }
    }
    return Array.from(keys).sort();
  }, [calibrations]);

  // Build a lookup: trigger_type -> bucket_key -> multiplier
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const cal of calibrations) {
      const bucketMap = new Map<string, number>();
      for (const bucket of cal.buckets) {
        bucketMap.set(bucket.key, bucket.calibration.learned_multiplier);
      }
      map.set(cal.trigger_type, bucketMap);
    }
    return map;
  }, [calibrations]);

  if (calibrations.length === 0) {
    return (
      <div className="text-center py-6 text-text-secondary text-sm">
        No calibration data to display.
      </div>
    );
  }

  // If there are no context buckets at all, show a simplified global-only view
  if (bucketKeys.length === 0) {
    return (
      <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-5">
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
          Calibration Overview (Global Only)
        </h4>
        <div className="flex flex-wrap gap-2">
          {calibrations.map((cal) => (
            <span
              key={cal.trigger_type}
              className={`inline-flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded-lg ${getCellStyle(cal.global.learned_multiplier)}`}
            >
              {cal.trigger_type}
              <span className="opacity-80">x{cal.global.learned_multiplier.toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-5">
      <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
        Trigger x Context Heatmap
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-3 text-text-secondary font-medium sticky left-0 bg-bg-secondary/70 z-10">
                Trigger
              </th>
              <th className="text-center py-2 px-2 text-text-secondary font-medium">
                Global
              </th>
              {bucketKeys.map((key) => (
                <th key={key} className="text-center py-2 px-2 text-text-secondary font-medium whitespace-nowrap">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calibrations.map((cal) => {
              const category = getCategoryForTrigger(cal.trigger_type);
              const rowBorder = category
                ? CATEGORY_ROW_BORDER[category]
                : 'border-l-white/20';
              const triggerBuckets = lookup.get(cal.trigger_type);

              return (
                <tr key={cal.trigger_type} className="border-t border-white/5">
                  <td className={`py-2 pr-3 font-mono font-medium sticky left-0 bg-bg-secondary/70 z-10 border-l-2 pl-2 ${rowBorder}`}>
                    {cal.trigger_type}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`inline-block font-mono px-1.5 py-0.5 rounded ${getCellStyle(cal.global.learned_multiplier)}`}>
                      {cal.global.learned_multiplier.toFixed(2)}
                    </span>
                  </td>
                  {bucketKeys.map((key) => {
                    const value = triggerBuckets?.get(key);
                    return (
                      <td key={key} className="py-2 px-2 text-center">
                        {value !== undefined ? (
                          <span className={`inline-block font-mono px-1.5 py-0.5 rounded ${getCellStyle(value)}`}>
                            {value.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-text-secondary/40 font-mono">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CalibrationHeatmap;
