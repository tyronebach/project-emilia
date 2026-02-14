/**
 * AvatarStage - Adaptive avatar layout for 1-N agents
 * 
 * Layouts (Zoom/Meet style):
 * - 1 agent: Full-screen avatar
 * - 2 agents: Split view (side by side)
 * - 3+ agents: Two prominent + thumbnail strip
 * 
 * Click thumbnail to focus/maximize an agent.
 */
import { useMemo } from 'react';
import { useChatStore, type AgentStatus } from '../../store/chatStore';
import type { Agent } from '../../utils/api';
import type { SoulMoodSnapshot } from '../../types/soulWindow';
import AvatarPanel from '../AvatarPanel';

interface AvatarStageProps {
  userId: string;
  sessionId: string;
  onAvatarReady?: () => void;
}

// Status badge colors
const STATUS_BADGE_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-yellow-500 animate-pulse',
  speaking: 'bg-green-500 animate-pulse',
};

// Mood emoji map (simplified)
function getMoodEmoji(mood?: SoulMoodSnapshot): string {
  if (!mood?.dominant_mood) return '';
  const moodEmojis: Record<string, string> = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprised: '😲',
    neutral: '😐',
    playful: '😜',
    loving: '🥰',
    anxious: '😰',
  };
  return moodEmojis[mood.dominant_mood.toLowerCase()] || '';
}

interface AgentTileProps {
  agent: Agent;
  status: AgentStatus;
  mood?: SoulMoodSnapshot;
  size: 'full' | 'half' | 'thumbnail';
  isFocused?: boolean;
  onClick?: () => void;
  userId: string;
  sessionId: string;
  onAvatarReady?: () => void;
}

function AgentTile({ 
  agent, 
  status, 
  mood, 
  size, 
  isFocused,
  onClick,
  userId,
  sessionId,
  onAvatarReady,
}: AgentTileProps) {
  const sizeClasses = {
    full: 'w-full h-full',
    half: 'w-1/2 h-full',
    thumbnail: 'w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary',
  };

  const moodEmoji = getMoodEmoji(mood);

  if (size === 'thumbnail') {
    return (
      <div 
        className={`relative ${sizeClasses[size]} ${isFocused ? 'ring-2 ring-primary' : ''}`}
        onClick={onClick}
      >
        {/* Thumbnail avatar - simplified view */}
        <div className="w-full h-full bg-base-300 flex items-center justify-center">
          <span className="text-2xl">{agent.display_name.charAt(0)}</span>
        </div>
        
        {/* Status badge */}
        <div className={`absolute bottom-1 right-1 w-3 h-3 rounded-full ${STATUS_BADGE_COLORS[status]}`} />
        
        {/* Mood emoji */}
        {moodEmoji && (
          <div className="absolute top-1 left-1 text-sm">{moodEmoji}</div>
        )}
        
        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
          {agent.display_name}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClasses[size]}`}>
      {/* Full avatar panel */}
      <AvatarPanel
        userId={userId}
        sessionId={sessionId}
        agentId={agent.id}
        onReady={onAvatarReady}
      />
      
      {/* Agent info overlay */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2">
        <div className={`w-3 h-3 rounded-full ${STATUS_BADGE_COLORS[status]}`} />
        <span className="text-white font-medium">{agent.display_name}</span>
        {moodEmoji && <span className="text-lg">{moodEmoji}</span>}
      </div>
    </div>
  );
}

export default function AvatarStage({ userId, sessionId, onAvatarReady }: AvatarStageProps) {
  const sessionAgents = useChatStore(state => state.sessionAgents);
  const agentStatus = useChatStore(state => state.agentStatus);
  const agentMoods = useChatStore(state => state.agentMoods);
  const focusedAgentId = useChatStore(state => state.focusedAgentId);
  const setFocusedAgentId = useChatStore(state => state.setFocusedAgentId);
  const getActiveAgents = useChatStore(state => state.getActiveAgents);

  // Sort agents by activity
  const sortedAgents = useMemo(() => getActiveAgents(), [getActiveAgents, agentStatus, sessionAgents]);

  // Single agent - full screen
  if (sessionAgents.length === 1) {
    const agent = sessionAgents[0];
    return (
      <div className="w-full h-full">
        <AgentTile
          agent={agent}
          status={agentStatus[agent.id] || 'idle'}
          mood={agentMoods[agent.id]}
          size="full"
          userId={userId}
          sessionId={sessionId}
          onAvatarReady={onAvatarReady}
        />
      </div>
    );
  }

  // Focused mode - one maximized, others as thumbnails
  if (focusedAgentId) {
    const focusedAgent = sessionAgents.find(a => a.id === focusedAgentId);
    const otherAgents = sessionAgents.filter(a => a.id !== focusedAgentId);

    if (!focusedAgent) {
      setFocusedAgentId(null);
      return null;
    }

    return (
      <div className="w-full h-full flex flex-col">
        {/* Focused agent - main view */}
        <div className="flex-1 relative">
          <AgentTile
            agent={focusedAgent}
            status={agentStatus[focusedAgent.id] || 'idle'}
            mood={agentMoods[focusedAgent.id]}
            size="full"
            isFocused
            userId={userId}
            sessionId={sessionId}
            onAvatarReady={onAvatarReady}
          />
          
          {/* Unfocus button */}
          <button
            className="absolute top-4 right-4 btn btn-circle btn-sm btn-ghost bg-black/50"
            onClick={() => setFocusedAgentId(null)}
          >
            ✕
          </button>
        </div>

        {/* Thumbnail strip */}
        <div className="h-28 md:h-36 bg-base-200 flex items-center gap-2 p-2 overflow-x-auto">
          {otherAgents.map(agent => (
            <AgentTile
              key={agent.id}
              agent={agent}
              status={agentStatus[agent.id] || 'idle'}
              mood={agentMoods[agent.id]}
              size="thumbnail"
              onClick={() => setFocusedAgentId(agent.id)}
              userId={userId}
              sessionId={sessionId}
            />
          ))}
        </div>
      </div>
    );
  }

  // Two agents - split view
  if (sessionAgents.length === 2) {
    return (
      <div className="w-full h-full flex">
        {sortedAgents.map(agent => (
          <AgentTile
            key={agent.id}
            agent={agent}
            status={agentStatus[agent.id] || 'idle'}
            mood={agentMoods[agent.id]}
            size="half"
            onClick={() => setFocusedAgentId(agent.id)}
            userId={userId}
            sessionId={sessionId}
            onAvatarReady={agent.id === sortedAgents[0].id ? onAvatarReady : undefined}
          />
        ))}
      </div>
    );
  }

  // 3+ agents - two prominent + thumbnail strip
  const prominentAgents = sortedAgents.slice(0, 2);
  const thumbnailAgents = sortedAgents.slice(2);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Two prominent agents */}
      <div className="flex-1 flex">
        {prominentAgents.map((agent, idx) => (
          <AgentTile
            key={agent.id}
            agent={agent}
            status={agentStatus[agent.id] || 'idle'}
            mood={agentMoods[agent.id]}
            size="half"
            onClick={() => setFocusedAgentId(agent.id)}
            userId={userId}
            sessionId={sessionId}
            onAvatarReady={idx === 0 ? onAvatarReady : undefined}
          />
        ))}
      </div>

      {/* Thumbnail strip */}
      <div className="h-28 md:h-36 bg-base-200 flex items-center gap-2 p-2 overflow-x-auto">
        {thumbnailAgents.map(agent => (
          <AgentTile
            key={agent.id}
            agent={agent}
            status={agentStatus[agent.id] || 'idle'}
            mood={agentMoods[agent.id]}
            size="thumbnail"
            onClick={() => setFocusedAgentId(agent.id)}
            userId={userId}
            sessionId={sessionId}
          />
        ))}
        
        {/* Show count if many */}
        {thumbnailAgents.length > 4 && (
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-base-300 flex items-center justify-center">
            <span className="text-lg font-medium">+{thumbnailAgents.length - 4}</span>
          </div>
        )}
      </div>
    </div>
  );
}
