import * as Accordion from '@radix-ui/react-accordion';
import { useState, useEffect, useRef, ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import MessageBubble from './MessageBubble';
import type { VRM } from '@pixiv/three-vrm';
import type { AppStatus, Memory, Message } from '../types';

// Chevron icon component
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Avatar content for mobile accordion
function AvatarContent() {
  const { avatarRendererRef, status } = useApp();
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: '/emilia.vrm',
      onLoad: (vrm: VRM) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        console.log('VRM loaded:', metaName || 'Unknown');
        setLoading(false);
        setError(null);
      },
      onError: (err: Error) => {
        setError(err.message || 'Failed to load avatar');
        setLoading(false);
      },
      onProgress: (percent: number) => setLoadProgress(percent)
    });
    
    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();
    avatarRendererRef.current = renderer;
    
    return () => {
      renderer.dispose();
      avatarRendererRef.current = null;
    };
  }, [avatarRendererRef]);
  
  const getStatusBadge = () => {
    if (status === 'thinking') {
      return <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded ml-2">Thinking...</span>;
    }
    if (status === 'speaking') {
      return <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded ml-2">Speaking</span>;
    }
    return null;
  };
  
  return (
    <div className="h-48 relative">
      <div ref={containerRef} className="w-full h-full bg-bg-primary">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/90 z-10">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-sm text-text-secondary">Loading... {loadProgress}%</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/90 z-10">
            <span className="text-sm text-error">{error}</span>
          </div>
        )}
      </div>
      {getStatusBadge()}
    </div>
  );
}

// Chat content for mobile accordion
function ChatContent() {
  const { messages, status } = useApp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  return (
    <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3 space-y-3">
      {messages.length === 0 ? (
        <div className="py-8 text-center text-text-secondary text-sm">
          Send a message to start chatting
        </div>
      ) : (
        <>
          {messages.map((message: Message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
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
  );
}

// Stats content for mobile accordion
function StatsContent() {
  const { messages, status } = useApp();
  const { sessionId } = useSession();
  
  const userMessages = messages.filter((m: Message) => m.role === 'user').length;
  const assistantMessages = messages.filter((m: Message) => m.role === 'assistant').length;
  
  const getStatusColor = (s: AppStatus): string => {
    switch (s) {
      case 'ready': return 'bg-success';
      case 'thinking': return 'bg-warning animate-pulse';
      case 'speaking': return 'bg-accent animate-pulse';
      case 'recording': return 'bg-error animate-pulse';
      case 'error': return 'bg-error';
      default: return 'bg-text-secondary';
    }
  };
  
  return (
    <div className="p-4 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto">
      <div>
        <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Session</div>
        <div className="text-sm text-text-primary truncate font-mono">{sessionId}</div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-tertiary rounded-lg p-3">
          <div className="text-2xl font-bold text-text-primary">{userMessages}</div>
          <div className="text-xs text-text-secondary">Your messages</div>
        </div>
        <div className="bg-bg-tertiary rounded-lg p-3">
          <div className="text-2xl font-bold text-accent">{assistantMessages}</div>
          <div className="text-xs text-text-secondary">Emilia's replies</div>
        </div>
      </div>
      
      <div>
        <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Status</div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
          <span className="text-sm text-text-primary capitalize">{status}</span>
        </div>
      </div>
    </div>
  );
}

// Memory content for mobile accordion
function MemoryContent() {
  const [memories, setMemories] = useState<Memory[]>([]);
  
  useEffect(() => {
    const fetchMemories = async () => {
      try {
        const response = await fetch('/api/memory');
        if (response.ok) {
          const data = await response.json();
          setMemories(data.memories || []);
        }
      } catch (_err) {
        // Silent fail
      }
    };
    fetchMemories();
  }, []);
  
  return (
    <div className="p-4 max-h-[calc(100vh-220px)] overflow-y-auto">
      {memories.length === 0 ? (
        <div className="text-center py-4">
          <svg className="w-8 h-8 mx-auto text-text-secondary/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <p className="text-sm text-text-secondary">No memories yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((memory: Memory, index: number) => (
            <div key={index} className="bg-bg-tertiary rounded-lg p-3">
              <div className="text-sm text-text-primary">{memory.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon components
const AvatarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const ChatIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const StatsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const MemoryIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

// Accordion Item wrapper
interface AccordionItemProps {
  value: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  badge?: ReactNode;
}

function AccordionItem({ value, icon, title, children, badge }: AccordionItemProps) {
  return (
    <Accordion.Item value={value} className="bg-bg-secondary rounded-xl overflow-hidden">
      <Accordion.Header>
        <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 bg-bg-tertiary/50 hover:bg-bg-tertiary/70 text-text-primary font-medium text-sm group transition-colors">
          <span className="flex items-center gap-2">
            {icon}
            {title}
            {badge}
          </span>
          <ChevronIcon className="w-4 h-4 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}

function MobileAccordion() {
  const { messages } = useApp();
  
  return (
    <Accordion.Root 
      type="single" 
      defaultValue="avatar" 
      collapsible 
      className="flex flex-col flex-1 min-h-0 gap-2"
    >
      <AccordionItem 
        value="avatar" 
        icon={<AvatarIcon />} 
        title="Avatar"
      >
        <AvatarContent />
      </AccordionItem>
      
      <AccordionItem 
        value="chat" 
        icon={<ChatIcon />} 
        title="Chat"
        badge={
          <span className="text-xs bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded ml-2">
            {messages.length}
          </span>
        }
      >
        <ChatContent />
      </AccordionItem>
      
      <AccordionItem 
        value="stats" 
        icon={<StatsIcon />} 
        title="Stats"
      >
        <StatsContent />
      </AccordionItem>
      
      <AccordionItem 
        value="memory" 
        icon={<MemoryIcon />} 
        title="Memory"
      >
        <MemoryContent />
      </AccordionItem>
    </Accordion.Root>
  );
}

export default MobileAccordion;
