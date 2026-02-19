import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import type { ChatMessage } from '../types/chat';
import { base64ToAudioBlob } from '../utils/helpers';

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const { sender_type, sender_id, content, timestamp, meta, behavior, processing_ms, model } = message;
  const isUser = sender_type === 'user';
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Multi-agent support: look up agent name from agents
  const agents = useChatStore(state => state.agents);
  const agentInfo = useMemo(() => {
    if (isUser || !sender_id) return null;
    return agents.find(a => a.agent_id === sender_id);
  }, [isUser, sender_id, agents]);

  // Agent initial for avatar (fallback to 'E' for backwards compat)
  const agentInitial = agentInfo?.display_name?.charAt(0).toUpperCase() ?? 'E';
  const isMultiAgent = agents.length > 1;

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Replay audio from stored base64
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- compiler limitation with optional chain deps
  const handleReplay = useCallback(async () => {
    if (!meta?.audio_base64 || isPlaying) return;

    try {
      setIsPlaying(true);
      cleanupAudio();
      const blob = base64ToAudioBlob(meta.audio_base64);
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;

      audio.onended = () => {
        cleanupAudio();
        setIsPlaying(false);
      };
      audio.onerror = () => {
        cleanupAudio();
        setIsPlaying(false);
      };

      await audio.play();
    } catch (error) {
      console.error('Replay error:', error);
      cleanupAudio();
      setIsPlaying(false);
    }
  }, [meta?.audio_base64, isPlaying, cleanupAudio]);

  // Format timestamp (epoch seconds → local time)
  const timeString = useMemo(() => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [timestamp]);

  // Format processing time
  const processingTime = useMemo(() => {
    if (!processing_ms) return null;
    if (processing_ms < 1000) {
      return `${processing_ms}ms`;
    }
    return `${(processing_ms / 1000).toFixed(1)}s`;
  }, [processing_ms]);

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${
        isUser ? 'bg-accent/15 border-accent/30' : 'bg-bg-tertiary/80 border-white/10'
      }`} title={!isUser && agentInfo ? agentInfo.display_name : undefined}>
        <span className="text-xs text-text-primary">{isUser ? 'U' : agentInitial}</span>
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] md:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Agent name label for multi-agent chats */}
        {!isUser && isMultiAgent && agentInfo && (
          <span className="text-xs text-text-secondary/70 mb-1 block">
            {agentInfo.display_name}
          </span>
        )}
        <div className={`rounded-2xl px-4 py-2 border shadow-sm ${
          isUser
            ? 'bg-accent/15 border-accent/30 rounded-tr-sm'
            : 'bg-bg-secondary/80 border-white/10 rounded-tl-sm'
        }`}>
          <p className="text-sm whitespace-pre-wrap break-words text-text-primary">{content}</p>
        </div>

        {/* Meta info */}
        <div className={`flex items-center gap-2 mt-1 text-xs text-text-secondary/70 flex-wrap ${
          isUser ? 'justify-end' : 'justify-start'
        }`}>
          <span>{timeString}</span>
          {processingTime && (
            <>
              <span>•</span>
              <span>🔄 {processingTime}</span>
            </>
          )}
          {behavior?.intent && (
            <>
              <span>•</span>
              <span>🎭 {behavior.intent}{behavior.mood ? ` (${behavior.mood})` : ''}</span>
            </>
          )}
          {!behavior?.intent && behavior?.mood && (
            <>
              <span>•</span>
              <span>🎭 {behavior.mood}</span>
            </>
          )}
          {meta?.audio_base64 && (
            <>
              <span>•</span>
              <button
                onClick={handleReplay}
                disabled={isPlaying}
                className={`inline-flex items-center gap-1 hover:text-accent transition-colors ${
                  isPlaying ? 'text-accent animate-pulse' : ''
                }`}
                title="Replay audio"
              >
                <Volume2 className="w-3 h-3" />
                {isPlaying ? 'Playing...' : 'Replay'}
              </button>
            </>
          )}
          {model && (
            <>
              <span>•</span>
              <span>🤖 {model}</span>
            </>
          )}
          {meta?.source && meta.source !== 'text' && (
            <>
              <span>•</span>
              <span className="capitalize">🎤 {meta.source}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
