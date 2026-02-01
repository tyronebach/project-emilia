import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';

function BurgerMenu({ open, onOpenChange }) {
  const { clearMessages } = useApp();
  const { sessions, sessionId, switchSession, createSession, fetchSessions, isLoading } = useSession();
  const [showSessions, setShowSessions] = useState(false);
  
  const handleClearChat = () => {
    clearMessages();
    onOpenChange(false);
  };
  
  const handleNewSession = async () => {
    const name = prompt('Enter session name (or leave empty for auto-name):');
    if (name !== null) {
      await createSession(name || undefined);
      onOpenChange(false);
    }
  };
  
  const handleSwitchSession = async (sid) => {
    await switchSession(sid);
    setShowSessions(false);
    onOpenChange(false);
  };
  
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button 
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content 
          className="min-w-56 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl py-2 z-50 animate-in fade-in-0 zoom-in-95"
          sideOffset={8}
          align="end"
        >
          {/* Session Info */}
          <div className="px-4 py-2 border-b border-bg-tertiary">
            <div className="text-xs text-text-secondary uppercase tracking-wide">Session</div>
            <div className="text-sm text-text-primary truncate">{sessionId}</div>
          </div>
          
          {/* Menu Items */}
          <DropdownMenu.Item 
            className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary outline-none cursor-pointer transition-colors"
            onSelect={handleClearChat}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Chat
          </DropdownMenu.Item>
          
          {/* Sessions Sub-menu */}
          <DropdownMenu.Sub open={showSessions} onOpenChange={setShowSessions}>
            <DropdownMenu.SubTrigger 
              className="flex items-center justify-between w-full px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary outline-none cursor-pointer transition-colors"
              onPointerEnter={() => {
                if (!showSessions) fetchSessions();
              }}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Switch Session
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </DropdownMenu.SubTrigger>
            
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent 
                className="min-w-48 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl py-1 z-50 max-h-48 overflow-y-auto animate-in fade-in-0 zoom-in-95"
                sideOffset={4}
              >
                {isLoading ? (
                  <div className="px-4 py-2 text-xs text-text-secondary">Loading...</div>
                ) : sessions.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-text-secondary">No sessions found</div>
                ) : (
                  sessions.map((session) => (
                    <DropdownMenu.Item
                      key={session.session_id || session}
                      className={`px-4 py-1.5 text-sm outline-none cursor-pointer truncate transition-colors ${
                        (session.session_id || session) === sessionId
                          ? 'text-accent bg-accent/10'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`}
                      onSelect={() => handleSwitchSession(session.session_id || session)}
                    >
                      {session.session_id || session}
                    </DropdownMenu.Item>
                  ))
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          
          <DropdownMenu.Item 
            className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary outline-none cursor-pointer transition-colors"
            onSelect={handleNewSession}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 4v16m8-8H4" />
            </svg>
            New Session
          </DropdownMenu.Item>
          
          <DropdownMenu.Separator className="h-px bg-bg-tertiary my-1" />
          
          {/* Footer */}
          <div className="px-4 py-2">
            <div className="text-xs text-text-secondary">
              Emilia v2.0 • React + Radix UI
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default BurgerMenu;
