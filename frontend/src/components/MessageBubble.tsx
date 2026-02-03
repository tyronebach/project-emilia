import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp, meta } = message;
  const isUser = role === 'user';
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

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
  const handleReplay = useCallback(async () => {
    if (!meta?.audio_base64 || isPlaying) return;

    try {
      setIsPlaying(true);
      cleanupAudio();
      const byteChars = atob(meta.audio_base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'audio/mpeg' });
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
  
  // Format timestamp
  const timeString = useMemo(() => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [timestamp]);
  
  // Format processing time
  const processingTime = useMemo(() => {
    if (!meta?.processing_ms) return null;
    if (meta.processing_ms < 1000) {
      return `${meta.processing_ms}ms`;
    }
    return `${(meta.processing_ms / 1000).toFixed(1)}s`;
  }, [meta?.processing_ms]);
  
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? 'bg-zinc-600/60' : 'bg-slate-600/60'
      }`}>
        <span className="text-xs text-text-primary">{isUser ? 'U' : 'E'}</span>
      </div>
      
      {/* Bubble */}
      <div className={`max-w-[85%] md:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-2 ${
          isUser 
            ? 'bg-zinc-700/70 rounded-tr-sm' 
            : 'bg-slate-700/70 rounded-tl-sm'
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
          {meta?.moods?.[0] && (
            <>
              <span>•</span>
              <span>🎭 {meta.moods[0].mood}{meta.moods[0].intensity ? ` ${Math.round(meta.moods[0].intensity * 100)}%` : ''}</span>
            </>
          )}
          {meta?.animations?.[0] && (
            <>
              <span>•</span>
              <span>✨ {meta.animations[0]}</span>
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
          {meta?.model && (
            <>
              <span>•</span>
              <span>🤖 {meta.model}</span>
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
