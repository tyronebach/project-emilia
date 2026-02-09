import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { getRelationships, deleteRelationship } from '../../utils/designerApi';
import RelationshipCard from './RelationshipCard';
import RelationshipCreateDialog from './RelationshipCreateDialog';

function RelationshipListTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: relationships, isLoading, error } = useQuery({
    queryKey: ['designer', 'relationships'],
    queryFn: getRelationships,
  });

  const deleteMut = useMutation({
    mutationFn: deleteRelationship,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designer', 'relationships'] }),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-text-secondary">Loading relationships...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load relationships
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">{relationships?.length ?? 0} relationship types</p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New Type
        </Button>
      </div>

      <div className="space-y-3">
        {relationships?.map((rel) => (
          <RelationshipCard
            key={rel.type}
            summary={rel}
            onDelete={(type) => deleteMut.mutate(type)}
            deleting={deleteMut.isPending}
          />
        ))}
      </div>

      {relationships?.length === 0 && (
        <div className="text-center py-8 text-text-secondary">No relationship types defined yet.</div>
      )}

      <RelationshipCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default RelationshipListTab;
