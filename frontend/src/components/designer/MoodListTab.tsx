import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { getMoods, deleteMood } from '../../utils/designerApi';
import MoodCard from './MoodCard';
import MoodCreateDialog from './MoodCreateDialog';

function MoodListTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: moods, isLoading, error } = useQuery({
    queryKey: ['designer', 'moods'],
    queryFn: getMoods,
  });

  const deleteMut = useMutation({
    mutationFn: deleteMood,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['designer', 'moods'] }),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-text-secondary">Loading moods...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load moods
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-secondary">{moods?.length ?? 0} mood definitions</p>
        <Button size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New Mood
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {moods?.map((mood) => (
          <MoodCard
            key={mood.id}
            mood={mood}
            onDelete={(id) => deleteMut.mutate(id)}
            deleting={deleteMut.isPending}
          />
        ))}
      </div>

      {moods?.length === 0 && (
        <div className="text-center py-8 text-text-secondary">No moods defined yet.</div>
      )}

      <MoodCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default MoodListTab;
