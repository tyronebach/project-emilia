import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { updateMood } from '../../utils/designerApi';
import SliderField from './SliderField';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import type { DesignerMood } from '../../types/designer';

interface MoodCardProps {
  mood: DesignerMood;
  onDelete: (id: string) => void;
  deleting: boolean;
}

const CATEGORIES = ['positive', 'negative', 'neutral'] as const;

function MoodCard({ mood, onDelete, deleting }: MoodCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<DesignerMood>(mood);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMut = useMutation({
    mutationFn: (updates: Partial<DesignerMood>) => updateMood(mood.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'moods'] });
    },
  });

  const hasChanges =
    draft.valence !== mood.valence ||
    draft.arousal !== mood.arousal ||
    draft.description !== mood.description ||
    draft.emoji !== mood.emoji ||
    draft.category !== mood.category;

  const handleSave = () => {
    updateMut.mutate({
      valence: draft.valence,
      arousal: draft.arousal,
      description: draft.description,
      emoji: draft.emoji,
      category: draft.category,
    });
  };

  const handleReset = () => setDraft(mood);

  const categoryColor = {
    positive: 'bg-success/20 text-success',
    negative: 'bg-error/20 text-error',
    neutral: 'bg-white/10 text-text-secondary',
  }[draft.category] || 'bg-white/10 text-text-secondary';

  return (
    <>
      <div
        className={`bg-bg-secondary/70 border rounded-xl p-4 ${hasChanges ? 'border-accent/50' : 'border-white/10'}`}
      >
        {/* Header */}
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{mood.emoji || '?'}</span>
            <span className="font-medium text-sm">{mood.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColor}`}>
              {mood.category}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Expanded edit form */}
        {expanded && (
          <div className="mt-4 space-y-3 pt-3 border-t border-white/10">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Emoji</label>
                <input
                  type="text"
                  value={draft.emoji}
                  onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Category</label>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as DesignerMood['category'] })}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Description</label>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <SliderField
              label="Valence"
              value={draft.valence}
              onChange={(v) => setDraft({ ...draft, valence: v })}
              min={-1}
              max={1}
            />
            <SliderField
              label="Arousal"
              value={draft.arousal}
              onChange={(v) => setDraft({ ...draft, arousal: v })}
              min={-1}
              max={1}
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="xs"
                className="text-error hover:text-error"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
              <div className="flex gap-2">
                {hasChanges && (
                  <Button variant="ghost" size="xs" onClick={handleReset}>
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </Button>
                )}
                <Button
                  size="xs"
                  onClick={handleSave}
                  disabled={!hasChanges || updateMut.isPending}
                >
                  <Save className="w-3 h-3" />
                  {updateMut.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete mood "${mood.id}"?`}
        description="This will permanently remove this mood definition."
        onConfirm={() => {
          onDelete(mood.id);
          setConfirmDelete(false);
        }}
        loading={deleting}
      />
    </>
  );
}

export default MoodCard;
