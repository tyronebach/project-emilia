/**
 * AvatarStage - Grid avatar layout for 1-N agents
 *
 * Layouts:
 * - 1 agent: Full-screen avatar
 * - 2 agents: Side by side (50/50)
 * - 3-4 agents: 2x2 grid
 * - 5+ agents: 2-col grid, scrollable
 *
 * Each agent gets an independent RoomAvatarTile with its own VRM renderer,
 * animation system, and lip-sync engine — registered in the avatar registry.
 */
import { useMemo } from 'react';
import { useChatStore } from '../../store/chatStore';
import type { AgentStatus } from '../../types/chat';
import type { RoomAgent } from '../../utils/api';
import type { SoulMoodSnapshot } from '../../types/soulWindow';
import RoomAvatarTile from '../rooms/RoomAvatarTile';

interface AvatarStageProps {
  userId: string;
  roomId: string;
  onAvatarReady?: () => void;
}

// Status badge colors
const STATUS_BADGE_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-yellow-500 animate-pulse',
  streaming: 'bg-blue-500 animate-pulse',
  speaking: 'bg-green-500 animate-pulse',
};

// Mood emoji from SoulMoodSnapshot
function getMoodEmoji(mood?: SoulMoodSnapshot): string {
  if (!mood?.dominant_mood) return '';
  if (mood.dominant_mood.emoji) return mood.dominant_mood.emoji;
  const moodEmojis: Record<string, string> = {
    happy: '\u{1F60A}',
    sad: '\u{1F622}',
    angry: '\u{1F620}',
    surprised: '\u{1F632}',
    neutral: '\u{1F610}',
    playful: '\u{1F61C}',
    loving: '\u{1F970}',
    anxious: '\u{1F630}',
  };
  return moodEmojis[mood.dominant_mood.id?.toLowerCase()] || '';
}

interface AgentTileProps {
  agent: RoomAgent;
  status: AgentStatus;
  mood?: SoulMoodSnapshot;
  command?: { intent?: string; mood?: string; energy?: string; move?: string; game_action?: string; intensity?: number };
}

function AgentTile({ agent, status, mood, command }: AgentTileProps) {
  const moodEmoji = getMoodEmoji(mood);

  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0">
        <RoomAvatarTile
          agentId={agent.agent_id}
          displayName={agent.display_name}
          vrmModel={agent.vrm_model}
          command={command}
          emotion={mood}
          isStreaming={status === 'streaming'}
        />
      </div>

      {/* Agent info overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2 z-10">
        <div className={`w-3 h-3 rounded-full ${STATUS_BADGE_COLORS[status]}`} />
        <span className="text-white font-medium">{agent.display_name}</span>
        {moodEmoji && <span className="text-lg">{moodEmoji}</span>}
      </div>
    </div>
  );
}

export default function AvatarStage({ userId: _userId, roomId: _roomId, onAvatarReady: _onAvatarReady }: AvatarStageProps) {
  const agents = useChatStore(state => state.agents);
  const statusByAgent = useChatStore(state => state.statusByAgent);
  const emotionByAgent = useChatStore(state => state.emotionByAgent);
  const avatarCommandByAgent = useChatStore(state => state.avatarCommandByAgent);
  const getActiveAgents = useChatStore(state => state.getActiveAgents);

  const sortedAgents = useMemo(() => getActiveAgents(), [getActiveAgents, statusByAgent, agents]);

  // Single agent - full screen
  if (agents.length === 1) {
    const agent = agents[0];
    return (
      <div className="absolute inset-0 z-0">
        <AgentTile
          agent={agent}
          status={statusByAgent[agent.agent_id] || 'idle'}
          mood={emotionByAgent[agent.agent_id]}
          command={avatarCommandByAgent[agent.agent_id]}
        />
      </div>
    );
  }

  // Two agents - side by side
  if (agents.length === 2) {
    return (
      <div className="absolute inset-0 z-0 flex">
        {sortedAgents.map(agent => (
          <div key={agent.agent_id} className="w-1/2 h-full">
            <AgentTile
              agent={agent}
              status={statusByAgent[agent.agent_id] || 'idle'}
              mood={emotionByAgent[agent.agent_id]}
              command={avatarCommandByAgent[agent.agent_id]}
            />
          </div>
        ))}
      </div>
    );
  }

  // 3+ agents - 2-column grid
  return (
    <div className="absolute inset-0 z-0 grid grid-cols-2 grid-rows-[1fr_1fr] overflow-hidden">
      {sortedAgents.slice(0, 4).map(agent => (
        <div key={agent.agent_id} className="relative">
          <AgentTile
            agent={agent}
            status={statusByAgent[agent.agent_id] || 'idle'}
            mood={emotionByAgent[agent.agent_id]}
            command={avatarCommandByAgent[agent.agent_id]}
          />
        </div>
      ))}
    </div>
  );
}
