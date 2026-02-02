import { Menu, Activity, Brain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUserStore } from '../store/userStore';
import type { AppStatus } from '../types';
import { Button } from './ui/button';

interface HeaderProps {
  onMenuClick: () => void;
  onDebugClick: () => void;
  onMemoryClick: () => void;
  debugOpen: boolean;
  memoryOpen: boolean;
}

function Header({ onMenuClick, onDebugClick, onMemoryClick, debugOpen, memoryOpen }: HeaderProps) {
  const { status } = useApp();
  const currentAgent = useUserStore((state) => state.currentAgent);

  // Status indicator colors
  const statusColors: Record<AppStatus, string> = {
    initializing: 'bg-warning animate-pulse',
    ready: 'bg-success',
    recording: 'bg-error animate-pulse',
    processing: 'bg-warning animate-pulse',
    thinking: 'bg-warning animate-pulse',
    speaking: 'bg-accent animate-pulse',
    error: 'bg-error',
  };

  return (
    <header className="absolute top-0 left-0 right-0 h-14 px-4 flex items-center justify-between z-30 bg-gradient-to-b from-black/50 to-transparent">
      {/* Left: Menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="text-text-primary hover:bg-white/10"
      >
        <Menu className="w-6 h-6" />
      </Button>

      {/* Center: Agent name + status */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium text-text-primary">
          {currentAgent?.display_name || 'Emilia'}
        </span>
        <span
          className={`w-2 h-2 rounded-full ${statusColors[status]}`}
          title={`Status: ${status}`}
        />
      </div>

      {/* Right: Debug + Memory buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMemoryClick}
          className={`text-text-primary hover:bg-white/10 ${memoryOpen ? 'bg-white/15' : ''}`}
          title="Agent Memory"
        >
          <Brain className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDebugClick}
          className={`text-text-primary hover:bg-white/10 ${debugOpen ? 'bg-white/15' : ''}`}
          title="Debug Panel"
        >
          <Activity className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}

export default Header;
