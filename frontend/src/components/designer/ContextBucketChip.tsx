interface ContextBucketChipProps {
  bucket: { key: string; trust_level: string; arousal_level: string; recent_conflict: boolean };
  onClick?: () => void;
}

const TRUST_LABELS: Record<string, string> = {
  low: 'Lo',
  mid: 'Mid',
  high: 'Hi',
};

const AROUSAL_LABELS: Record<string, string> = {
  calm: 'Calm',
  activated: 'Act',
};

function ContextBucketChip({ bucket, onClick }: ContextBucketChipProps) {
  const trustLabel = TRUST_LABELS[bucket.trust_level] ?? bucket.trust_level;
  const arousalLabel = AROUSAL_LABELS[bucket.arousal_level] ?? bucket.arousal_level;

  const borderClass = bucket.recent_conflict
    ? 'border-error/60'
    : 'border-white/10';

  const interactiveClass = onClick
    ? 'cursor-pointer hover:bg-bg-tertiary/80 transition-colors'
    : '';

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border bg-bg-tertiary/50 text-text-secondary ${borderClass} ${interactiveClass}`}
    >
      <span>{trustLabel}</span>
      <span className="opacity-40">/</span>
      <span>{arousalLabel}</span>
      {bucket.recent_conflict && (
        <span className="w-1.5 h-1.5 rounded-full bg-error ml-0.5" title="Recent conflict" />
      )}
    </span>
  );
}

export default ContextBucketChip;
