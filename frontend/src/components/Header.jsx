import { useState } from 'react';
import { useApp } from '../context/AppContext';
import BurgerMenu from './BurgerMenu';

function Header() {
  const { status, ttsEnabled, setTtsEnabled, sessionId } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Status indicator colors
  const statusColors = {
    ready: 'bg-success',
    recording: 'bg-error animate-pulse',
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
        <span className={`w-2 h-2 rounded-full ${statusColors[status] || statusColors.ready}`} 
              title={`Status: ${status}`} />
      </div>
      
      {/* Center: Session name (hidden on mobile) */}
      <div className="hidden md:block text-text-secondary text-sm truncate max-w-xs">
        {sessionId}
      </div>
      
      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* TTS Toggle */}
        <button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          className={`p-2 rounded-lg transition-colors ${
            ttsEnabled 
              ? 'bg-accent text-white' 
              : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
          }`}
          title={ttsEnabled ? 'TTS Enabled' : 'TTS Disabled'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {ttsEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            )}
          </svg>
        </button>
        
        {/* Burger Menu (Radix DropdownMenu) */}
        <BurgerMenu open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </header>
  );
}

export default Header;
