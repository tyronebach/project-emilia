import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { getUser, getSessions } from '../utils/api';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import type { Agent } from '../utils/api';
import agentPlaceholder from '../assets/placeholder-agent.jpg';
import AmbientBackground from './AmbientBackground';

interface AgentSelectionProps {
  userId: string;
}

function AgentSelection({ userId }: AgentSelectionProps) {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAgent = useUserStore((state) => state.setAgent);
  const setTtsEnabled = useAppStore((state) => state.setTtsEnabled);

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
      if (userData.preferences) {
        try {
          const parsed = JSON.parse(userData.preferences);
          setTtsEnabled(Boolean(parsed?.tts_enabled));
        } catch {
          setTtsEnabled(false);
        }
      } else {
        setTtsEnabled(false);
      }
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
    <div className="min-h-[100svh] bg-bg-primary text-text-primary relative overflow-hidden">
      <AmbientBackground variant="agent" />

      <div className="relative z-10 flex min-h-[100svh] flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-6">
          <button
            onClick={() => navigate({ to: '/' })}
            className="flex items-center gap-2 p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-text-secondary">
            <Sparkles className="w-4 h-4 text-accent" />
            Pick a companion to start
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-5xl">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-white/10 bg-bg-secondary/60 text-xs uppercase tracking-[0.28em] text-text-secondary">
                Characters
              </div>
              <h2 className="font-display text-3xl md:text-5xl mt-4 text-balance">
                Pick your companion
              </h2>
              <p className="text-text-secondary mt-3 text-base md:text-lg text-balance">
                Every character has its own memory, voice, and personality.
              </p>
            </div>

            {isLoading && (
              <div className="text-center text-text-secondary">Loading characters...</div>
            )}
            {error && (
              <div className="text-center text-error">Failed to load characters.</div>
            )}
            {!isLoading && !error && agents.length === 0 && (
              <div className="text-center text-text-secondary">No characters available.</div>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, index) => (
                <AgentAvatar
                  key={agent.id}
                  agent={agent}
                  index={index + 1}
                  onSelect={() => handleSelect(agent)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AgentAvatarProps {
  agent: Agent;
  index: number;
  onSelect: () => void;
}

function AgentAvatar({ agent, index, onSelect }: AgentAvatarProps) {
  return (
    <button
      onClick={onSelect}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-bg-secondary/60 text-left shadow-[0_25px_60px_-40px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:bg-bg-secondary/80 focus:outline-none"
    >
      <div className="relative">
        <div className="aspect-square w-full overflow-hidden">
          <img
            src={agentPlaceholder}
            alt={`${agent.display_name} avatar`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-primary/90 via-bg-primary/40 to-transparent" />
        <div className="absolute bottom-3 right-3">
          <div className="relative h-10 w-10 rounded-full bg-bg-secondary/80 border border-white/10 flex items-center justify-center text-sm font-semibold text-text-primary">
            <Sparkles className="absolute h-4 w-4 text-text-secondary/70" />
            <span className="relative">{index}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <span className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors">
          {agent.display_name}
        </span>
      </div>
    </button>
  );
}

export default AgentSelection;
