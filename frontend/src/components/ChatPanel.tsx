import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import MessageBubble from './MessageBubble';

/**
 * Semi-transparent chat overlay with gradient fade
 * Collapsible - toggle button at top-right when open, bottom-right when hidden
 */
function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const handsFreeEnabled = useAppStore((s) => s.handsFreeEnabled);
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const immersiveMode = handsFreeEnabled && ttsEnabled;
  const panelHeight = immersiveMode ? 0 : 26;

  useEffect(() => {
    if (immersiveMode) {
      setCollapsed(true);
    }
  }, [immersiveMode]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && !collapsed) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, collapsed]);

  if (immersiveMode) return null;

  // When collapsed, show just the toggle button
  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(false)}
        className="fixed right-4 z-20 bg-bg-secondary/80 border border-white/10 backdrop-blur-sm hover:bg-bg-tertiary/80 rounded-full h-10 w-10 shadow-lg"
        style={{ bottom: 'calc(9rem + env(safe-area-inset-bottom))' }}
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
      {/* Toggle button - positioned at bottom of chat panel */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed(true)}
        className="fixed right-2 z-20 bg-bg-secondary/70 border border-white/10 hover:bg-bg-tertiary/80 rounded-full h-8 w-8"
        style={{ bottom: `calc(${panelHeight}svh + 9rem - 2rem + env(safe-area-inset-bottom))` }}
        title="Hide chat history"
      >
        <ChevronDown className="w-4 h-4" />
      </Button>

      {/* Chat panel with mask - 1/3 of screen height */}
      <div
        className="absolute left-0 right-0 z-10"
        style={{
          bottom: 'calc(9rem + env(safe-area-inset-bottom))',
          height: `${panelHeight}svh`,
          maskImage: 'linear-gradient(to top, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 60%, transparent 100%)',
        }}
      >
        {/* Chat container */}
        <div className="h-full relative">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3 pb-2">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-secondary/60 text-sm py-12">
                  Send a message to start chatting
                </div>
              ) : (
                <>
                  {/* Filter out empty messages (e.g., streaming placeholders) */}
                  {messages
                    .filter((message) => message.content.trim() !== '')
                    .map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}

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
