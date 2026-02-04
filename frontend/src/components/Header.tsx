import { Menu, Activity, Brain, Mic, MicOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUserStore } from '../store/userStore';
import type { AppStatus } from '../types';
import { Button } from './ui/button';
import type { VoiceState } from '../services/VoiceService';

interface HeaderProps {
  onMenuClick: () => void;
  onDebugClick: () => void;
  onMemoryClick: () => void;
  debugOpen: boolean;
  memoryOpen: boolean;
  handsFreeEnabled?: boolean;
  voiceState?: VoiceState;
  voicePermissionWarning?: string | null;
}

function Header({
  onMenuClick,
  onDebugClick,
  onMemoryClick,
  debugOpen,
  memoryOpen,
  handsFreeEnabled = false,
  voiceState,
  voicePermissionWarning,
}: HeaderProps) {
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

  // Status text for thinking bubble
  const getStatusText = () => {
    if (status === 'processing') return 'Transcribing...';
    if (status === 'thinking') return 'Thinking...';
    if (status === 'speaking') return 'Speaking...';
    return null;
  };

  const statusText = getStatusText();

  const voiceStatusLabel = !handsFreeEnabled
    ? 'Hands-free off'
    : voiceState
      ? `Hands-free ${voiceState.toLowerCase()}`
      : 'Hands-free on';

  return (
    <>
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

        {/* Right: Voice indicator + Debug + Memory buttons */}
        <div className="flex items-center gap-1">
          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[11px] ${
              handsFreeEnabled ? 'bg-accent/10 text-text-primary' : 'bg-white/5 text-text-secondary'
            }`}
            title={voiceStatusLabel}
          >
            {handsFreeEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
            <span>{voiceStatusLabel}</span>
          </div>
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

      {/* Thinking bubble - under header */}
      {statusText && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-sm text-text-primary text-sm">
            <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            <span>{statusText}</span>
          </div>
        </div>
      )}

      {/* Voice permission warning */}
      {handsFreeEnabled && voicePermissionWarning && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-error/20 border border-error/40 backdrop-blur-sm text-text-primary text-sm">
            <MicOff className="w-4 h-4 text-error" />
            <span>{voicePermissionWarning}</span>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
