import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import type { AppStatus } from '../types';

interface StatsPanelProps {
  className?: string;
}

function StatsPanel({ className = '' }: StatsPanelProps) {
  const { messages, status } = useApp();
  const { sessionId } = useSession();
  
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  
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
    <div className={`bg-bg-secondary rounded-xl overflow-hidden ${className}`}>
      <div className="h-12 px-4 flex items-center bg-bg-tertiary/50">
        <span className="text-sm font-medium text-text-primary">Stats</span>
      </div>
      
      <div className="p-4 space-y-3">
        {/* Session Info */}
        <div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Session</div>
          <div className="text-sm text-text-primary truncate font-mono">{sessionId}</div>
        </div>
        
        {/* Message Stats */}
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
        
        {/* Status */}
        <div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Status</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
            <span className="text-sm text-text-primary capitalize">{status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
