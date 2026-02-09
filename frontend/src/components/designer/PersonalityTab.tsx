import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { getPersonalities } from '../../utils/designerApiV2';
import PersonalityCard from './PersonalityCard';
import type { AgentPersonality } from '../../types/designer';

function PersonalityTab() {
  const { data: personalities, isLoading, error } = useQuery<AgentPersonality[]>({
    queryKey: ['designer-v2', 'personalities'],
    queryFn: getPersonalities,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-text-secondary">Loading personalities...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load personalities
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-display text-text-primary">Personality DNA</h2>
        <p className="text-sm text-text-secondary mt-1">
          Core emotional architecture for each agent. These settings define baseline temperament, trigger sensitivities, and hard trait boundaries.
        </p>
      </div>

      <p className="text-sm text-text-secondary mb-4">{personalities?.length ?? 0} personalities</p>

      <div className="space-y-4">
        {personalities?.map((personality) => (
          <PersonalityCard key={personality.id} personality={personality} />
        ))}
      </div>

      {personalities?.length === 0 && (
        <div className="text-center py-8 text-text-secondary">No personalities found.</div>
      )}
    </div>
  );
}

export default PersonalityTab;
