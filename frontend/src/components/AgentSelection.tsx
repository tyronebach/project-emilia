import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getUser, getSessions } from '../utils/api';
import { useUserStore } from '../store/userStore';
import type { Agent } from '../utils/api';

interface AgentSelectionProps {
  userId: string;
}

function AgentSelection({ userId }: AgentSelectionProps) {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAgent = useUserStore((state) => state.setAgent);

  const { data: userData, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
  });

  const agents = useMemo(() => userData?.agents || [], [userData]);

  const handleSelect = async (agent: Agent) => {
    // Set user and agent in store
    if (userData) {
      setUser({
        id: userId,
        display_name: userData.display_name,
        preferences: userData.preferences,
      });
    }
    setAgent(agent);

    // Try to get existing sessions for this agent
    try {
      const sessions = await getSessions(agent.id);
      if (sessions.length > 0) {
        // Use most recent session
        navigate({
          to: '/user/$userId/chat/$sessionId',
          params: { userId, sessionId: sessions[0].id }
        });
      } else {
        // No sessions - go to new chat page
        navigate({
          to: '/user/$userId/chat/new',
          params: { userId }
        });
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
      // On error, default to new chat page
      navigate({
        to: '/user/$userId/chat/new',
        params: { userId }
      });
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Back button - top left */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-2 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-12">
            <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Select an agent</p>
            <h2 className="text-3xl md:text-4xl font-semibold mt-2">Pick your companion</h2>
          </div>

          {isLoading && (
            <div className="text-center text-text-secondary">Loading agents...</div>
          )}
          {error && (
            <div className="text-center text-error">Failed to load agents.</div>
          )}
          {!isLoading && !error && agents.length === 0 && (
            <div className="text-center text-text-secondary">No agents available.</div>
          )}

          {/* Agent avatars grid */}
          <div className="flex justify-center gap-12 flex-wrap">
            {agents.map((agent) => (
              <AgentAvatar
                key={agent.id}
                agent={agent}
                onSelect={() => handleSelect(agent)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AgentAvatarProps {
  agent: Agent;
  onSelect: () => void;
}

function AgentAvatar({ agent, onSelect }: AgentAvatarProps) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-3 group focus:outline-none"
    >
      {/* Avatar circle */}
      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border-2 border-transparent group-hover:border-accent group-focus:border-accent transition-all duration-200 flex items-center justify-center overflow-hidden">
          {/* Placeholder avatar - can be replaced with VRM thumbnail */}
          <Sparkles className="w-16 h-16 text-accent/50 group-hover:text-accent transition-colors" />
        </div>
      </div>

      {/* Name footer */}
      <span className="text-lg font-medium text-text-primary group-hover:text-accent transition-colors">
        {agent.display_name}
      </span>
    </button>
  );
}

export default AgentSelection;
