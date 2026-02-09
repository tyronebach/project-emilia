import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { createAgent } from '../../utils/designerApi';

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AgentCreateDialog({ open, onOpenChange }: AgentCreateDialogProps) {
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [name, setName] = useState('');

  const createMut = useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'agents'] });
      onOpenChange(false);
      setId('');
      setName('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    createMut.mutate({
      id: id.trim(),
      name: name.trim() || id.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create Agent</DialogTitle>
        <DialogDescription>Create a new agent with default emotional profile. You can customize it after creation.</DialogDescription>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs text-text-secondary mb-1">ID (slug)</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. luna"
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Luna"
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          {createMut.isError && (
            <p className="text-xs text-error">Failed to create agent. ID may already exist.</p>
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

export default AgentCreateDialog;
