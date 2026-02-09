import { TRIGGER_TAXONOMY, type TriggerCategory } from '../../types/designer';

interface TriggerBadgeProps {
  trigger: string;
  intensity?: number;
  multiplier?: number;
  size?: 'sm' | 'md';
}

const CATEGORY_COLORS: Record<TriggerCategory, { bg: string; text: string; border: string }> = {
  play: { bg: 'bg-info/15', text: 'text-info', border: 'border-info/30' },
  care: { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' },
  friction: { bg: 'bg-error/15', text: 'text-error', border: 'border-error/30' },
  repair: { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30' },
  vulnerability: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
};

function getCategoryForTrigger(trigger: string): TriggerCategory | null {
  for (const [category, triggers] of Object.entries(TRIGGER_TAXONOMY)) {
    if ((triggers as readonly string[]).includes(trigger)) {
      return category as TriggerCategory;
    }
  }
  return null;
}

function TriggerBadge({ trigger, intensity, multiplier, size = 'md' }: TriggerBadgeProps) {
  const category = getCategoryForTrigger(trigger);
  const colors = category ? CATEGORY_COLORS[category] : {
    bg: 'bg-white/10',
    text: 'text-text-secondary',
    border: 'border-white/20',
  };

  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-1'
    : 'text-xs px-2 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-mono rounded-full border ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses}`}
    >
      {trigger}
      {intensity !== undefined && (
        <span className="opacity-70">{intensity.toFixed(2)}</span>
      )}
      {multiplier !== undefined && (
        <span className="opacity-60">x{multiplier.toFixed(2)}</span>
      )}
    </span>
  );
}

export default TriggerBadge;
