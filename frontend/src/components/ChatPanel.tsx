import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
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
          <Badge variant="secondary">
            {messages.length} messages
          </Badge>
        </div>
        
        {/* Collapse arrow */}
        <ChevronDown 
          className={`w-4 h-4 text-text-secondary transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </div>
      
      {/* Messages */}
      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 md:p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-secondary text-sm py-8">
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
        </ScrollArea>
      )}
    </div>
  );
}

export default ChatPanel;
