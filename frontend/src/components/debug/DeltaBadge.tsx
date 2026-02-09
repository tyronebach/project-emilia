interface DeltaBadgeProps {
  current: number;
  previous: number | undefined;
  precision?: number;
}

export function DeltaBadge({ current, previous, precision = 2 }: DeltaBadgeProps) {
  if (previous === undefined) return null;

  const delta = current - previous;
  if (Math.abs(delta) < Math.pow(10, -precision)) return null;

  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '\u25B2' : '\u25BC';
  const color = delta > 0 ? 'text-success' : 'text-error';

  return (
    <span className={`text-[9px] font-mono ${color} ml-1`}>
      {arrow}{sign}{delta.toFixed(precision)}
    </span>
  );
}
