import type { SoulMoodSnapshot } from '../types/soulWindow';

interface MoodIndicatorProps {
  mood: SoulMoodSnapshot | null;
  onClick: () => void;
}

function formatMoodLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function MoodIndicator({ mood, onClick }: MoodIndicatorProps) {
  const moodId = mood?.dominant_mood?.id || 'neutral';
  const moodEmoji = mood?.dominant_mood?.emoji || '😐';
  const moodLabel = formatMoodLabel(moodId);
  const trustPct = Math.round((mood?.trust ?? 0.5) * 100);
  const intimacyPct = Math.round((mood?.intimacy ?? 0.2) * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-bg-secondary/45 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
      title={`Bond snapshot: trust ${trustPct}%, intimacy ${intimacyPct}%`}
    >
      <span>{moodEmoji}</span>
      <span className="max-w-[7.5rem] truncate">{moodLabel}</span>
    </button>
  );
}

export default MoodIndicator;
