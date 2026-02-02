import { useMemo } from 'react';
import type { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp, meta } = message;
  const isUser = role === 'user';
  
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
              <span>→ {meta.animations[0]}</span>
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
