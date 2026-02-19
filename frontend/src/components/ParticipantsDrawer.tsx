import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, UserPlus, UserMinus, AlertTriangle } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import { addRoomAgent, removeRoomAgent, getRoomAgents, createRoom, getUserAgents } from '../utils/api';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface ParticipantsDrawerProps {
  open: boolean;
  onClose: () => void;
}

function ParticipantsDrawer({ open, onClose }: ParticipantsDrawerProps) {
  const navigate = useNavigate();
  const agents = useChatStore((s) => s.agents);
  const setAgents = useChatStore((s) => s.setAgents);
  const currentUser = useUserStore((s) => s.currentUser);
  const roomId = useAppStore((s) => s.roomId);

  const [allAgents, setAllAgents] = useState(currentUser?.agents || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all user agents when drawer opens
  useEffect(() => {
    if (!open || !currentUser?.id) return;
    if (currentUser.agents && currentUser.agents.length > 0) {
      setAllAgents(currentUser.agents);
      return;
    }
    // Fetch from API if not on the stored user object
    getUserAgents(currentUser.id).then((fetched) => {
      setAllAgents(fetched);
    }).catch((err) => {
      console.warn('[ParticipantsDrawer] Failed to fetch agents:', err);
    });
  }, [open, currentUser]);

  // DM warning dialog state
  const [confirmAgent, setConfirmAgent] = useState<{ id: string; display_name: string } | null>(null);

  // Agents available to add (not already in room)
  const availableAgents = allAgents.filter(
    (agent) => !agents.some((ra) => ra.agent_id === agent.id),
  );

  const isDm = agents.length === 1;

  const handleAddAgent = async (agent: { id: string; display_name: string }) => {
    if (isDm) {
      // Show confirmation — adding to a DM creates a new room
      setConfirmAgent(agent);
      return;
    }

    // Group room — add directly
    await doAddAgent(agent.id);
  };

  const doAddAgent = async (agentId: string) => {
    if (!roomId) return;
    setIsLoading(true);
    setError(null);
    try {
      await addRoomAgent(roomId, { agent_id: agentId });
      const refreshed = await getRoomAgents(roomId);
      setAgents(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agent');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmNewRoom = async () => {
    if (!confirmAgent || !currentUser?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      // Build agent list: current agent(s) + new agent
      const currentAgentIds = agents.map((a) => a.agent_id);
      const allAgentIds = [...currentAgentIds, confirmAgent.id];

      const agentNames = allAgentIds
        .map((id) => {
          const ua = allAgents.find((a) => a.id === id);
          return ua?.display_name || id;
        })
        .join(', ');

      const room = await createRoom({
        name: `Group: ${agentNames}`,
        agent_ids: allAgentIds,
      });

      setConfirmAgent(null);
      onClose();

      navigate({
        to: '/user/$userId/chat/$roomId',
        params: { userId: currentUser.id, roomId: room.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (!roomId) return;
    if (agents.length <= 1) {
      setError('Cannot remove the last agent');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await removeRoomAgent(roomId, agentId);
      const refreshed = await getRoomAgents(roomId);
      setAgents(refreshed);

      // Sync currentAgent if it's no longer in the room
      const { currentAgent, syncAgent } = useUserStore.getState();
      const remainingIds = refreshed.map((ra) => ra.agent_id);
      if (currentAgent && !remainingIds.includes(currentAgent.id) && refreshed.length > 0) {
        const fullAgent = allAgents.find((a) => a.id === refreshed[0].agent_id);
        if (fullAgent) {
          syncAgent(fullAgent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="right-0 top-0 left-auto translate-x-0 translate-y-0 h-[100svh] w-72 max-w-[85vw] rounded-none border-l border-white/10 bg-bg-secondary/95 p-0 shadow-[-20px_0_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md flex flex-col data-[state=open]:slide-in-from-right-2 data-[state=closed]:slide-out-to-right-2">
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <DialogTitle className="font-display text-lg text-text-primary">
              Participants ({agents.length})
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="hover:bg-white/10">
                <X className="w-5 h-5" />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            View and manage chat participants.
          </DialogDescription>

          {/* Error display */}
          {error && (
            <div className="mx-3 mt-3 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-text-primary">
              {error}
            </div>
          )}

          {/* Current participants */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              <div className="text-xs text-text-secondary uppercase tracking-wide px-1 mb-2">
                In Chat
              </div>
              <div className="space-y-1">
                {agents.map((agent) => (
                  <div
                    key={agent.agent_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-bg-tertiary/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-sm font-medium text-accent">
                        {agent.display_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {agent.display_name}
                        </div>
                        {agent.vrm_model && (
                          <div className="text-xs text-text-secondary/70 truncate">
                            {agent.vrm_model}
                          </div>
                        )}
                      </div>
                    </div>

                    {agents.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-text-secondary hover:text-error hover:bg-error/10"
                        onClick={() => handleRemoveAgent(agent.agent_id)}
                        disabled={isLoading}
                        title="Remove from chat"
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Available to add */}
              {availableAgents.length > 0 && (
                <>
                  <div className="text-xs text-text-secondary uppercase tracking-wide px-1 mt-5 mb-2">
                    Add Participant
                  </div>
                  <div className="space-y-1">
                    {availableAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleAddAgent(agent)}
                        disabled={isLoading}
                        className="w-full flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-bg-tertiary/30 px-3 py-2.5 transition-colors hover:bg-bg-tertiary/60 hover:border-white/10 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-full bg-bg-tertiary/80 border border-white/10 flex items-center justify-center text-sm font-medium text-text-secondary">
                            {agent.display_name.charAt(0)}
                          </div>
                          <div className="text-sm text-text-secondary text-left truncate">
                            {agent.display_name}
                          </div>
                        </div>
                        <UserPlus className="w-4 h-4 shrink-0 text-text-secondary/50" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {availableAgents.length === 0 && allAgents.length > 0 && (
                <p className="mt-5 text-center text-xs text-text-secondary/70">
                  All your agents are in this chat.
                </p>
              )}
            </div>
          </ScrollArea>

          {/* Loading indicator */}
          {isLoading && (
            <div className="border-t border-white/10 px-4 py-3 text-center text-xs text-text-secondary">
              Working...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DM → Group confirmation dialog */}
      <Dialog
        open={confirmAgent !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmAgent(null);
        }}
      >
        <DialogContent className="w-80 max-w-[92vw] p-5">
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            New Group Chat
          </DialogTitle>
          <DialogDescription className="text-text-secondary text-sm mt-2">
            Adding <strong className="text-text-primary">{confirmAgent?.display_name}</strong> will
            create a new group chat room. Your current 1:1 conversation will stay as-is.
          </DialogDescription>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" onClick={() => setConfirmAgent(null)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleConfirmNewRoom} disabled={isLoading}>
              Create Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ParticipantsDrawer;
