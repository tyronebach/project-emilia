import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Agent } from '../../utils/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

interface CreateRoomModalProps {
  open: boolean;
  agents: Agent[];
  isCreating?: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; agent_ids: string[] }) => Promise<void> | void;
}

function CreateRoomModal({ open, agents, isCreating = false, onClose, onCreate }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const selectedCount = selectedAgentIds.length;
  const canCreate = useMemo(() => {
    return Boolean(name.trim()) && selectedCount > 0 && !isCreating;
  }, [name, selectedCount, isCreating]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => (
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    ));
  };

  const submit = async () => {
    if (!canCreate) return;
    await onCreate({
      name: name.trim(),
      agent_ids: selectedAgentIds,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[34rem] max-w-[94vw] p-6">
        <DialogTitle className="font-display text-xl text-text-primary">Create Room</DialogTitle>
        <DialogDescription className="text-sm text-text-secondary">
          Choose one or more companions for this group conversation.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-wide text-text-secondary">Room Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend brainstorm"
              className="w-full rounded-xl border border-white/10 bg-bg-tertiary/70 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/60"
              maxLength={100}
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-text-secondary">Companions</span>
              <span className="text-xs text-text-secondary">{selectedCount} selected</span>
            </div>
            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-white/10 bg-bg-tertiary/40 p-2">
              {agents.length === 0 ? (
                <p className="px-2 py-3 text-sm text-text-secondary">No available companions.</p>
              ) : (
                agents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'border-accent/40 bg-accent/15 text-text-primary'
                          : 'border-white/10 bg-bg-secondary/50 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <span>{agent.display_name}</span>
                      {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4 opacity-60" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isCreating}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canCreate}>
            {isCreating ? 'Creating...' : 'Create Room'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CreateRoomModal;
