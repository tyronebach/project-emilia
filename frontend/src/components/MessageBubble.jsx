import { useMemo } from 'react';

function MessageBubble({ message }) {
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
        isUser ? 'bg-accent/30' : 'bg-accent/20'
      }`}>
        <span className="text-xs text-text-primary">{isUser ? 'U' : 'E'}</span>
      </div>
      
      {/* Bubble */}
      <div className={`max-w-[80%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-lg px-3 py-2 ${
          isUser 
            ? 'bg-accent text-white rounded-tr-none' 
            : 'bg-bg-tertiary text-text-primary rounded-tl-none'
        }`}>
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        </div>
        
        {/* Meta info */}
        <div className={`flex items-center gap-2 mt-1 text-xs text-text-secondary ${
          isUser ? 'justify-end' : 'justify-start'
        }`}>
          <span>{timeString}</span>
          {processingTime && (
            <>
              <span>•</span>
              <span>{processingTime}</span>
            </>
          )}
          {meta?.source && meta.source !== 'text' && (
            <>
              <span>•</span>
              <span className="capitalize">{meta.source}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
