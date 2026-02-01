import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AppStatus } from '../types';
import { Button } from './ui/button';
import BurgerMenu from './BurgerMenu';

function Header() {
  const { status, ttsEnabled, setTtsEnabled, sessionId } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Status indicator colors
  const statusColors: Record<AppStatus, string> = {
    initializing: 'bg-warning animate-pulse',
    ready: 'bg-success',
    recording: 'bg-error animate-pulse',
    processing: 'bg-warning animate-pulse',
    thinking: 'bg-warning animate-pulse',
    speaking: 'bg-accent animate-pulse',
    error: 'bg-error'
  };
  
  return (
    <header className="bg-bg-secondary border-b border-bg-tertiary px-3 py-2 md:px-4 md:py-3 flex items-center justify-between shrink-0">
      {/* Left: Logo/Title */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg md:text-xl font-semibold text-text-primary">
          Emilia
        </h1>
        <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} 
              title={`Status: ${status}`} />
      </div>
      
      {/* Center: Session name (hidden on mobile) */}
      <div className="hidden md:block text-text-secondary text-sm truncate max-w-xs">
        {sessionId}
      </div>
      
      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* TTS Toggle */}
        <Button
          variant={ttsEnabled ? 'default' : 'secondary'}
          size="icon"
          onClick={() => setTtsEnabled(!ttsEnabled)}
          title={ttsEnabled ? 'TTS Enabled' : 'TTS Disabled'}
        >
          {ttsEnabled ? (
            <Volume2 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5" />
          )}
        </Button>
        
        {/* Burger Menu */}
        <BurgerMenu open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </header>
  );
}

export default Header;
