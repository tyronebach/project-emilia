import { HelpDot } from './Tooltip';

interface DimensionBarProps {
  label: string;
  value: number; // 0 to 1
  delta?: number;
  colorScale?: 'trust' | 'intensity' | 'multiplier';
  tooltip?: string;
}

function getBarColor(value: number, colorScale: DimensionBarProps['colorScale']): string {
  switch (colorScale) {
    case 'intensity': {
      if (value < 0.4) return 'bg-success';
      if (value < 0.7) return 'bg-warning';
      return 'bg-error';
    }
    case 'multiplier': {
      if (value < 0.8) return 'bg-error';
      if (value <= 1.0) return 'bg-warning';
      if (value <= 1.2) return 'bg-success';
      return 'bg-info';
    }
    case 'trust':
    default:
      return 'bg-info';
  }
}

function formatDelta(delta: number): { text: string; color: string } {
  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '\u25B2' : '\u25BC';
  const color = delta > 0 ? 'text-success' : 'text-error';
  return { text: `${arrow}${sign}${(delta * 100).toFixed(1)}%`, color };
}

function DimensionBar({ label, value, delta, colorScale = 'trust', tooltip }: DimensionBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const barColor = getBarColor(value, colorScale);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">
          {label}
          {tooltip && <HelpDot tip={tooltip} />}
        </span>
        <span className="text-xs font-mono text-text-secondary">
          {pct.toFixed(0)}%
          {delta !== undefined && Math.abs(delta) >= 0.001 && (
            <span className={`ml-1 ${formatDelta(delta).color}`}>
              {formatDelta(delta).text}
            </span>
          )}
        </span>
      </div>
      <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default DimensionBar;
