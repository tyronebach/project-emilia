/**
 * ChatHistoryPanel - Slide-out message history (Google Meet mobile style)
 * 
 * Shows all messages with agent attribution for multi-agent chats.
 */
import { useRef, useEffect } from 'react';
import { useChatStore, type MultiAgentMessage } from '../../store/chatStore';
import type { Agent } from '../../utils/api';

interface ChatHistoryPanelProps {
  onClose: () => void;
}

interface MessageBubbleProps {
  message: MultiAgentMessage;
  agent?: Agent;
  isUser: boolean;
}

function MessageBubble({ message, agent, isUser }: MessageBubbleProps) {
  const bubbleClass = isUser 
    ? 'bg-primary text-primary-content ml-auto' 
    : 'bg-base-200 text-base-content';

  return (
    <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end ml-auto' : 'items-start'}`}>
      {/* Agent name (for assistant messages in multi-agent) */}
      {!isUser && agent && (
        <span className="text-xs text-base-content/60 ml-1">
          {agent.display_name}
        </span>
      )}
      
      <div className={`rounded-2xl px-4 py-2 ${bubbleClass}`}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      
      {/* Timestamp */}
      <span className="text-xs text-base-content/40 mx-1">
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

export default function ChatHistoryPanel({ onClose }: ChatHistoryPanelProps) {
  const messages = useChatStore(state => state.messages);
  const sessionAgents = useChatStore(state => state.sessionAgents);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Get agent by ID
  const getAgent = (agentId?: string): Agent | undefined => {
    if (!agentId) return undefined;
    return sessionAgents.find(a => a.id === agentId);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-base-100 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-base-300">
        <h2 className="text-lg font-bold">Chat History</h2>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-base-content/50 py-8">
            No messages yet
          </div>
        ) : (
          messages.map(message => (
            <MessageBubble
              key={message.id}
              message={message}
              agent={getAgent(message.agentId)}
              isUser={message.role === 'user'}
            />
          ))
        )}
      </div>

      {/* Agent legend (for multi-agent) */}
      {sessionAgents.length > 1 && (
        <div className="border-t border-base-300 p-3">
          <div className="flex flex-wrap gap-2">
            {sessionAgents.map(agent => (
              <div key={agent.id} className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>{agent.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
