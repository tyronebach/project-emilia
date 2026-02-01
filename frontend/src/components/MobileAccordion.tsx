import * as Accordion from '@radix-ui/react-accordion';
import { useState, useEffect, useRef, ReactNode } from 'react';
import { ChevronDown, User, MessageCircle, BarChart3, Lightbulb } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAppStore } from '../store';
import { useSession } from '../hooks/useSession';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import { Badge } from './ui/badge';
import MessageBubble from './MessageBubble';
import type { VRM } from '@pixiv/three-vrm';
import type { AppStatus, Memory, Message } from '../types';

// Avatar content for mobile accordion
function AvatarContent() {
  const { avatarRendererRef, status } = useApp();
  const setAvatarRenderer = useAppStore((state) => state.setAvatarRenderer);
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
        // Sync renderer to store AFTER VRM loads
        setAvatarRenderer(renderer);
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
      setAvatarRenderer(null);
    };
  }, [avatarRendererRef, setAvatarRenderer]);
  
  const getStatusBadge = () => {
    if (status === 'thinking') {
      return <Badge variant="outline" className="ml-2 bg-warning/20 text-warning border-warning/30">Thinking...</Badge>;
    }
    if (status === 'speaking') {
      return <Badge variant="outline" className="ml-2 bg-accent/20 text-accent border-accent/30">Speaking</Badge>;
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
      case 'initializing': return 'bg-warning animate-pulse';
      case 'ready': return 'bg-success';
      case 'recording': return 'bg-error animate-pulse';
      case 'processing': return 'bg-warning animate-pulse';
      case 'thinking': return 'bg-warning animate-pulse';
      case 'speaking': return 'bg-accent animate-pulse';
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
          <Lightbulb className="w-8 h-8 mx-auto text-text-secondary/50 mb-2" />
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
          <ChevronDown className="w-4 h-4 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
        icon={<User className="w-4 h-4" />} 
        title="Avatar"
      >
        <AvatarContent />
      </AccordionItem>
      
      <AccordionItem 
        value="chat" 
        icon={<MessageCircle className="w-4 h-4" />} 
        title="Chat"
        badge={
          <Badge variant="secondary" className="ml-2">
            {messages.length}
          </Badge>
        }
      >
        <ChatContent />
      </AccordionItem>
      
      <AccordionItem 
        value="stats" 
        icon={<BarChart3 className="w-4 h-4" />} 
        title="Stats"
      >
        <StatsContent />
      </AccordionItem>
      
      <AccordionItem 
        value="memory" 
        icon={<Lightbulb className="w-4 h-4" />} 
        title="Memory"
      >
        <MemoryContent />
      </AccordionItem>
    </Accordion.Root>
  );
}

export default MobileAccordion;
