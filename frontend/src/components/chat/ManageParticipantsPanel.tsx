/**
 * ManageParticipantsPanel - WhatsApp-style participant management
 *
 * Slides in from right. Shows:
 * - Current participants with remove option
 * - Available agents to add
 */
import { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useUserStore } from '../../store/userStore';
import { addRoomAgent, removeRoomAgent, getRoomAgents } from '../../utils/api';
import type { Agent } from '../../utils/api';

interface ManageParticipantsPanelProps {
  roomId: string;
  onClose: () => void;
}

export default function ManageParticipantsPanel({ roomId, onClose }: ManageParticipantsPanelProps) {
  const roomAgents = useChatStore(state => state.roomAgents);
  const setRoomAgents = useChatStore(state => state.setRoomAgents);

  const currentUser = useUserStore(state => state.currentUser);
  const userAgents = currentUser?.agents || [];

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agents available to add (not already in room)
  const availableAgents = userAgents.filter(
    agent => !roomAgents.some(sa => sa.id === agent.id)
  );

  const handleAddAgent = async (agent: Agent) => {
    setIsLoading(true);
    setError(null);
    try {
      await addRoomAgent(roomId, { agent_id: agent.id });
      // Refresh room agents list
      const agents = await getRoomAgents(roomId);
      // Map RoomAgent to Agent-like for store
      setRoomAgents(agents.map(ra => ({
        id: ra.agent_id,
        display_name: ra.display_name,
        vrm_model: ra.vrm_model || 'emilia.vrm',
        voice_id: ra.voice_id || null,
        clawdbot_agent_id: '',
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agent');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (roomAgents.length <= 1) {
      setError('Cannot remove the last agent');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await removeRoomAgent(roomId, agentId);
      // Refresh room agents list
      const agents = await getRoomAgents(roomId);
      setRoomAgents(agents.map(ra => ({
        id: ra.agent_id,
        display_name: ra.display_name,
        vrm_model: ra.vrm_model || 'emilia.vrm',
        voice_id: ra.voice_id || null,
        clawdbot_agent_id: '',
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-base-100 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-base-300">
        <h2 className="text-lg font-bold">Participants ({roomAgents.length})</h2>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="alert alert-error m-2">
          <span>{error}</span>
        </div>
      )}

      {/* Current participants */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-base-content/70 mb-2">In Chat</h3>
        <div className="space-y-2">
          {roomAgents.map(agent => (
            <div
              key={agent.id}
              className="flex items-center justify-between p-3 bg-base-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="avatar placeholder">
                  <div className="bg-primary text-primary-content rounded-full w-10">
                    <span>{agent.display_name.charAt(0)}</span>
                  </div>
                </div>
                <div>
                  <div className="font-medium">{agent.display_name}</div>
                  <div className="text-xs text-base-content/50">
                    {agent.vrm_model || 'No avatar'}
                  </div>
                </div>
              </div>

              {roomAgents.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm btn-circle text-error"
                  onClick={() => handleRemoveAgent(agent.id)}
                  disabled={isLoading}
                  title="Remove from chat"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Available to add */}
        {availableAgents.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-base-content/70 mt-6 mb-2">Add to Chat</h3>
            <div className="space-y-2">
              {availableAgents.map(agent => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 bg-base-200/50 rounded-lg hover:bg-base-200 cursor-pointer"
                  onClick={() => handleAddAgent(agent)}
                >
                  <div className="flex items-center gap-3">
                    <div className="avatar placeholder">
                      <div className="bg-base-300 text-base-content rounded-full w-10">
                        <span>{agent.display_name.charAt(0)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">{agent.display_name}</div>
                      <div className="text-xs text-base-content/50">
                        {agent.vrm_model || 'No avatar'}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={isLoading}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {availableAgents.length === 0 && roomAgents.length === userAgents.length && (
          <div className="text-center text-base-content/50 mt-6">
            All your agents are in this chat
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-base-100/80 flex items-center justify-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      )}
    </div>
  );
}
