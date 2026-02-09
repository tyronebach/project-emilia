import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { createMood } from '../../utils/designerApi';
import SliderField from './SliderField';

interface MoodCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = ['positive', 'negative', 'neutral'] as const;

function MoodCreateDialog({ open, onOpenChange }: MoodCreateDialogProps) {
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [valence, setValence] = useState(0);
  const [arousal, setArousal] = useState(0);
  const [category, setCategory] = useState<'positive' | 'negative' | 'neutral'>('neutral');

  const createMut = useMutation({
    mutationFn: createMood,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'moods'] });
      onOpenChange(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setId('');
    setEmoji('');
    setDescription('');
    setValence(0);
    setArousal(0);
    setCategory('neutral');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    createMut.mutate({
      id: id.trim(),
      valence,
      arousal,
      emoji,
      description,
      category,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create Mood</DialogTitle>
        <DialogDescription>Define a new mood with emotional coordinates.</DialogDescription>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">ID (slug)</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. content"
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Emoji</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="😊"
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A calm, satisfied state"
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <SliderField label="Valence" value={valence} onChange={setValence} min={-1} max={1} />
          <SliderField label="Arousal" value={arousal} onChange={setArousal} min={-1} max={1} />

          {createMut.isError && (
            <p className="text-xs text-error">Failed to create mood. ID may already exist.</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!id.trim() || createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default MoodCreateDialog;
