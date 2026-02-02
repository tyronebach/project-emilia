import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { getUser, getSessions } from '../utils/api';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import type { Agent } from '../utils/api';

interface AgentSelectionProps {
  userId: string;
}

function AgentSelection({ userId }: AgentSelectionProps) {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAgent = useUserStore((state) => state.setAgent);
  const setSessionId = useAppStore((state) => state.setSessionId);

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
      // Temporarily set the agent so getSessions can use it
      const sessions = await getSessions(agent.id);
      if (sessions.length > 0) {
        // Use most recent session
        setSessionId(sessions[0].id);
      } else {
        // No sessions - clear session ID, will create on first message
        setSessionId('');
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
      setSessionId('');
    }
    
    navigate({ to: '/chat' });
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Select an agent</p>
          <h2 className="text-3xl md:text-4xl font-semibold mt-2">Pick your companion</h2>
        </div>

        <div className="mt-8">
          {isLoading && (
            <div className="text-center text-text-secondary">Loading agents...</div>
          )}
          {error && (
            <div className="text-center text-error">Failed to load agents.</div>
          )}
          {!isLoading && !error && agents.length === 0 && (
            <div className="text-center text-text-secondary">No agents available.</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card
                key={agent.id}
                className="bg-bg-secondary border-bg-tertiary hover:border-accent transition-colors cursor-pointer"
                onClick={() => handleSelect(agent)}
              >
                <CardHeader>
                  <CardTitle className="text-xl">{agent.display_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-36 rounded-lg border border-bg-tertiary bg-bg-tertiary/30 flex items-center justify-center text-text-secondary text-sm">
                    {agent.vrm_model || 'VRM Model'}
                  </div>
                  <Button className="w-full">
                    Select
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={() => navigate({ to: '/' })}>
            ← Back to user selection
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AgentSelection;
