import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import MessageBubble from './MessageBubble';

function ChatPanel() {
  const { messages, status } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && !collapsed) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, collapsed]);
  
  return (
    <div className={`bg-bg-secondary rounded-xl overflow-hidden transition-all duration-300 flex flex-col ${
      collapsed ? 'h-12 flex-none' : 'flex-1 min-h-0'
    }`}>
      {/* Header (clickable to collapse) */}
      <div 
        className="h-12 px-4 flex items-center justify-between bg-bg-tertiary/50 cursor-pointer shrink-0"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Chat</span>
          <span className="text-xs bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded">
            {messages.length} messages
          </span>
        </div>
        
        {/* Collapse arrow */}
        <svg 
          className={`w-4 h-4 text-text-secondary transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {/* Messages */}
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-secondary text-sm">
              Send a message to start chatting with Emilia
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              
              {/* Thinking indicator */}
              {status === 'thinking' && (
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <span className="text-xs">E</span>
                  </div>
                  <div className="bg-bg-tertiary rounded-lg px-3 py-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
