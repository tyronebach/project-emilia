import { Menu, Activity, Brain, MicOff, Volume2, HeartHandshake, BookOpenText } from 'lucide-react';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { STATUS_COLORS } from '../types';
import type { SoulMoodSnapshot } from '../types/soulWindow';
import { Button } from './ui/button';
import { updateUserPreferences } from '../utils/api';
import MoodIndicator from './MoodIndicator';

interface HeaderProps {
  onMenuClick: () => void;
  onDebugClick: () => void;
  onMemoryClick: () => void;
  onBondClick: () => void;
  onAboutClick: () => void;
  debugOpen: boolean;
  memoryOpen: boolean;
  bondOpen: boolean;
  aboutOpen: boolean;
  currentMood: SoulMoodSnapshot | null;
  handsFreeEnabled?: boolean;
  voicePermissionWarning?: string | null;
}

function Header({
  onMenuClick,
  onDebugClick,
  onMemoryClick,
  onBondClick,
  onAboutClick,
  debugOpen,
  memoryOpen,
  bondOpen,
  aboutOpen,
  currentMood,
  handsFreeEnabled = false,
  voicePermissionWarning,
}: HeaderProps) {
  const status = useAppStore((s) => s.status);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const setTtsEnabled = useAppStore((s) => s.setTtsEnabled);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const currentUser = useUserStore((state) => state.currentUser);
  const updatePreferences = useUserStore((state) => state.updatePreferences);

  const handleToggleTts = async () => {
    const nextEnabled = !ttsEnabled;
    setTtsEnabled(nextEnabled);

    if (!currentUser) return;

    try {
      const updated = await updateUserPreferences(currentUser.id, { tts_enabled: nextEnabled });
      if (updated?.preferences) {
        updatePreferences(updated.preferences);
      }
    } catch (error) {
      console.error('Failed to update TTS preference:', error);
      setTtsEnabled(!nextEnabled);
    }
  };

  return (
    <>
      <header className="absolute top-0 left-0 right-0 h-12 md:h-16 px-3 md:px-4 flex items-center justify-between z-30 bg-gradient-to-b from-bg-primary/60 via-bg-primary/25 to-transparent backdrop-blur-sm">
        {/* Left: Menu button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10"
        >
          <Menu className="w-6 h-6" />
        </Button>

        {/* Center: Agent name + status */}
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-bg-secondary/45 px-3 md:px-4 py-1 shadow-sm">
          <span className="font-display text-sm md:text-base text-text-primary">
            {currentAgent?.display_name || 'Kokoro'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`}
            title={`Status: ${status}`}
          />
          <MoodIndicator mood={currentMood} onClick={onBondClick} />
        </div>

        {/* Right: TTS + Bond/About + Debug + Memory buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleTts}
            aria-pressed={ttsEnabled}
            className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${ttsEnabled ? 'bg-accent/20 border-accent/40' : ''}`}
            title={ttsEnabled ? 'Voice replies on' : 'Voice replies off'}
          >
            <Volume2 className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onBondClick}
            className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${bondOpen ? 'bg-white/15' : ''}`}
            title="Bond"
          >
            <HeartHandshake className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onAboutClick}
            className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${aboutOpen ? 'bg-white/15' : ''}`}
            title="About"
          >
            <BookOpenText className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMemoryClick}
            className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${memoryOpen ? 'bg-white/15' : ''}`}
            title="Agent Memory"
          >
            <Brain className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDebugClick}
            className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${debugOpen ? 'bg-white/15' : ''}`}
            title="Debug Panel"
          >
            <Activity className="w-5 h-5" />
          </Button>
        </div>
      </header>

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
