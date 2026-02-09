import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { createRelationship } from '../../utils/designerApi';

interface RelationshipCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RelationshipCreateDialog({ open, onOpenChange }: RelationshipCreateDialogProps) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');

  const createMut = useMutation({
    mutationFn: ({ type, description }: { type: string; description: string }) =>
      createRelationship(type, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'relationships'] });
      onOpenChange(false);
      setType('');
      setDescription('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type.trim()) return;
    createMut.mutate({ type: type.trim(), description });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create Relationship Type</DialogTitle>
        <DialogDescription>Define a new relationship type. You can add modifiers and triggers after creation.</DialogDescription>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Type ID (slug)</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. close-friend"
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A close, trusted friend"
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          {createMut.isError && (
            <p className="text-xs text-error">Failed to create relationship type. ID may already exist.</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!type.trim() || createMut.isPending}>
              {createMut.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RelationshipCreateDialog;
