import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Sliders, Bug, Palette } from 'lucide-react';
import { getUser, getRooms } from '../utils/api';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import type { Agent } from '../utils/api';
import agentPlaceholder from '../assets/placeholder-agent.jpg';
import AmbientBackground from './AmbientBackground';
import AppTopNav from './AppTopNav';

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
      setUser(userData);
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

    // Find existing DM rooms for this specific agent
    try {
      const rooms = await getRooms(agent.id);
      const dmRoom = rooms.find(r => r.room_type === 'dm');
      if (dmRoom) {
        navigate({
          to: '/user/$userId/chat/$roomId',
          params: { userId, roomId: dmRoom.id }
        });
      } else {
        // No DM room for this agent — go to new chat page
        navigate({
          to: '/user/$userId/chat/new',
          params: { userId }
        });
      }
    } catch (e) {
      console.error('Failed to fetch rooms:', e);
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
        <AppTopNav
          onBack={() => navigate({ to: '/' })}
          subtitle="Select a companion"
          rightSlot={(
            <>
              <button
                onClick={() => navigate({ to: '/manage' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Agent Settings"
              >
                <Sliders className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate({ to: '/designer-v2' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Agent Designer"
              >
                <Palette className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate({ to: '/debug' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Debug Avatar"
              >
                <Bug className="w-5 h-5" />
              </button>
            </>
          )}
        />

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-5xl text-balance">
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

            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
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
      </div>

      <div className="px-3 py-3 sm:px-4 sm:py-4">
        <span className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors">
          {agent.display_name}
        </span>
      </div>
    </button>
  );
}

export default AgentSelection;
