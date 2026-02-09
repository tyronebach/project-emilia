import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { getAgents, deleteAgent } from '../../utils/designerApi';
import AgentCard from './AgentCard';
import AgentCreateDialog from './AgentCreateDialog';

function AgentListTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['designer', 'agents'],
    queryFn: getAgents,
  });

  const deleteMut = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designer', 'agents'] }),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-text-secondary">Loading agents...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load agents
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">{agents?.length ?? 0} agents</p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New Agent
        </Button>
      </div>

      <div className="space-y-4">
        {agents?.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onDelete={(id) => deleteMut.mutate(id)}
            deleting={deleteMut.isPending}
          />
        ))}
      </div>

      {agents?.length === 0 && (
        <div className="text-center py-8 text-text-secondary">No agents found.</div>
      )}

      <AgentCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default AgentListTab;
