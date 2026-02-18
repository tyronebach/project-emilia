import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles, Users, User, Check } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import { useSession } from '../hooks/useSession';
import { createRoom } from '../utils/api';
import type { Agent } from '../utils/api';
import { Button } from './ui/button';
import agentPlaceholder from '../assets/placeholder-agent.jpg';
import AmbientBackground from './AmbientBackground';
import AppTopNav from './AppTopNav';

interface NewChatPageProps {
  userId: string;
}

/**
 * Dedicated page for starting a new chat
 * Simple UI without VRM avatar - just the agent image and start button
 */
function NewChatPage({ userId: _userId }: NewChatPageProps) {
  const navigate = useNavigate();
  const currentAgent = useUserStore((state) => state.currentAgent);
  const currentUser = useUserStore((state) => state.currentUser);
  const setRoomId = useAppStore((state) => state.setRoomId);
  const { rooms } = useSession();

  const [isCreating, setIsCreating] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // All agents available to user
  const userAgents: Agent[] = currentUser?.agents || [];
  const hasMultipleAgents = userAgents.length > 1;

  // Clear any stale room ID when on new chat page
  useEffect(() => {
    setRoomId('');
  }, [setRoomId]);

  const handleModeChange = (groupMode: boolean) => {
    setIsGroupMode(groupMode);
    if (groupMode) {
      setSelectedAgents(currentAgent ? [currentAgent.id] : []);
    } else {
      setSelectedAgents([]);
    }
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleBack = () => {
    if (rooms.length > 0 && currentUser?.id) {
      navigate({
        to: '/user/$userId/chat/$roomId',
        params: { userId: currentUser.id, roomId: rooms[0].id }
      });
    } else if (currentUser?.id) {
      navigate({ to: '/user/$userId', params: { userId: currentUser.id } });
    }
  };

  const handleStartChat = async () => {
    if (!currentUser?.id || isCreating) return;

    if (isGroupMode) {
      if (selectedAgents.length < 2) {
        console.warn('Group chat requires at least 2 agents');
        return;
      }
    } else {
      if (!currentAgent?.id) return;
    }

    setIsCreating(true);
    try {
      const agentIds = isGroupMode ? selectedAgents : [currentAgent!.id];
      const agentNames = agentIds
        .map(id => userAgents.find(a => a.id === id)?.display_name || id)
        .join(', ');
      const roomName = isGroupMode
        ? `Group: ${agentNames}`
        : `Chat with ${currentAgent?.display_name || 'Agent'}`;

      const room = await createRoom({
        name: roomName,
        agent_ids: agentIds,
      });

      // Navigate to initializing page
      navigate({
        to: '/user/$userId/chat/initializing/$roomId',
        params: { userId: currentUser.id, roomId: room.id }
      });
    } catch (error) {
      console.error('Failed to create room:', error);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-[100svh] w-full bg-bg-primary text-text-primary flex flex-col overflow-hidden relative">
      <AmbientBackground variant="newChat" />

      <AppTopNav onBack={handleBack} className="relative z-10" subtitle="New Chat" />

      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg px-6">
          <div className="rounded-[32px] border border-white/10 bg-bg-secondary/70 backdrop-blur-md shadow-[0_30px_70px_-50px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <img
                src={agentPlaceholder}
                alt={`${currentAgent?.display_name || 'Agent'} avatar`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-primary/90 via-bg-primary/50 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end" />
            </div>

            <div className="px-6 pb-6 pt-5 text-center">
              <p className="text-text-secondary text-base md:text-lg text-balance">
                {isGroupMode
                  ? 'Select agents for your group chat'
                  : 'Start a fresh conversation and bring your companion to life.'
                }
              </p>

              {/* Mode toggle - only show if user has multiple agents */}
              {hasMultipleAgents && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant={isGroupMode ? 'ghost' : 'default'}
                    size="sm"
                    onClick={() => handleModeChange(false)}
                    className="gap-2"
                  >
                    <User className="w-4 h-4" />
                    Solo
                  </Button>
                  <Button
                    variant={isGroupMode ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => handleModeChange(true)}
                    className="gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Group
                  </Button>
                </div>
              )}

              {/* Agent selection grid for group mode */}
              {isGroupMode && (
                <div className="mt-4 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {userAgents.map(agent => {
                    const isSelected = selectedAgents.includes(agent.id);
                    return (
                      <button
                        key={agent.id}
                        onClick={() => toggleAgentSelection(agent.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-white/10 bg-bg-secondary/50 hover:bg-bg-secondary'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          isSelected ? 'bg-accent text-white' : 'bg-bg-tertiary'
                        }`}>
                          {isSelected ? <Check className="w-4 h-4" /> : agent.display_name.charAt(0)}
                        </div>
                        <span className="text-sm truncate">{agent.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {isCreating ? (
                <div className="mt-6 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-text-secondary">
                    Creating chat...
                  </span>
                </div>
              ) : (
                <Button
                  onClick={handleStartChat}
                  disabled={isGroupMode ? selectedAgents.length < 2 : !currentAgent}
                  size="lg"
                  className="mt-6 px-10 py-7 text-lg gap-3 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <Sparkles className="w-6 h-6" />
                  {isGroupMode
                    ? `Start Group (${selectedAgents.length} agents)`
                    : `Chat with ${currentAgent?.display_name || 'Agent'}`
                  }
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewChatPage;
