import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import MessageBubble from './MessageBubble';

/**
 * Semi-transparent chat overlay with gradient fade
 * Collapsible - toggle button at top-right when open, bottom-right when hidden
 */
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

  // When collapsed, show just the toggle button
  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 right-4 z-20 bg-black/70 backdrop-blur-sm hover:bg-black/80 rounded-full h-10 w-10"
        title="Show chat history"
      >
        <ChevronUp className="w-5 h-5" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {messages.length > 99 ? '99+' : messages.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <>
      {/* Toggle button - OUTSIDE the masked container */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(true)}
        className="fixed bottom-[calc(35vh+4rem+0.5rem)] right-2 z-20 bg-black/60 hover:bg-black/70 rounded-full h-8 w-8"
        title="Hide chat history"
      >
        <ChevronDown className="w-4 h-4" />
      </Button>

      {/* Chat panel with mask */}
      <div 
        className="absolute bottom-16 left-0 right-0 h-[35vh] z-10"
        style={{
          maskImage: 'linear-gradient(to top, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 60%, transparent 100%)',
        }}
      >
        {/* Chat container with gradient background */}
        <div 
          className="h-full relative"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)',
          }}
        >
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3 pb-2">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-secondary/50 text-sm py-12">
                  Send a message to start chatting
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}

                  {/* Thinking indicator */}
                  {status === 'thinking' && (
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center shrink-0">
                        <span className="text-xs text-text-primary">E</span>
                      </div>
                      <div className="bg-slate-700/70 rounded-2xl rounded-tl-sm px-4 py-2">
                        <div className="flex gap-1">
                          <span
                            className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"
                            style={{ animationDelay: '0ms' }}
                          />
                          <span
                            className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"
                            style={{ animationDelay: '300ms' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}

export default ChatPanel;
