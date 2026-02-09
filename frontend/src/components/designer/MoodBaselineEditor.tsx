import { useQuery } from '@tanstack/react-query';
import { getMoodGroups } from '../../utils/designerApiV2';
import SliderField from './SliderField';

interface MoodBaselineEditorProps {
  moodBaseline: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
}

function MoodBaselineEditor({ moodBaseline, onChange }: MoodBaselineEditorProps) {
  const { data: moodGroups, isLoading } = useQuery({
    queryKey: ['designer-v2', 'mood-groups'],
    queryFn: getMoodGroups,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !moodGroups) {
    return <p className="text-xs text-text-secondary">Loading mood groups...</p>;
  }

  const handleChange = (mood: string, value: number) => {
    onChange({ ...moodBaseline, [mood]: value });
  };

  return (
    <div className="space-y-4">
      {Object.entries(moodGroups).map(([groupId, group]) => (
        <div key={groupId}>
          <h5
            className="text-xs font-medium uppercase tracking-wider mb-2"
            style={{ color: group.color }}
          >
            {group.label}
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
            {Object.entries(group.moods).map(([moodId, info]) => (
              <SliderField
                key={moodId}
                label={moodId.replace(/_/g, ' ')}
                value={moodBaseline[moodId] ?? 0}
                onChange={(v) => handleChange(moodId, v)}
                min={0}
                max={10}
                step={0.5}
                tooltip={`V/A: (${info.valence.toFixed(1)}, ${info.arousal.toFixed(1)})`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MoodBaselineEditor;
