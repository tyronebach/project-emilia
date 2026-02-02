import { useState, Fragment } from 'react';
import { Menu, ArrowLeftRight, Plus, ChevronRight } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useSession } from '../hooks/useSession';
import { Button } from './ui/button';

interface BurgerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BurgerMenu({ open, onOpenChange }: BurgerMenuProps) {
  const { sessions, sessionId, switchSession, createSession, fetchSessions, isLoading } = useSession();
  const [showSessions, setShowSessions] = useState(false);
  
  const handleNewSession = async () => {
    const name = prompt('Enter session name (or leave empty for auto-name):');
    if (name !== null) {
      await createSession(name || undefined);
      onOpenChange(false);
    }
  };
  
  const handleSwitchSession = async (sid: string) => {
    await switchSession(sid);
    setShowSessions(false);
    onOpenChange(false);
  };
  
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </Button>
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
          
          {/* Sessions Sub-menu */}
          <DropdownMenu.Sub open={showSessions} onOpenChange={setShowSessions}>
            <DropdownMenu.SubTrigger 
              className="flex items-center justify-between w-full px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary outline-none cursor-pointer transition-colors"
              onPointerEnter={() => {
                if (!showSessions) fetchSessions();
              }}
            >
              <span className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" />
                Switch Session
              </span>
              <ChevronRight className="w-4 h-4" />
            </DropdownMenu.SubTrigger>
            
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent 
                className="min-w-48 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl py-1 z-50 max-h-48 overflow-y-auto animate-in fade-in-0 zoom-in-95"
                sideOffset={4}
              >
                {isLoading ? (
                  <div className="px-4 py-2 text-xs text-text-secondary">Loading...</div>
                ) : sessions.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-text-secondary">No previous sessions yet</div>
                ) : (
                  <Fragment>
                    {sessions.map((session, index) => {
                      const sid = typeof session === 'string' ? session : (session.session_key || session.session_id || '');
                      const displayName = typeof session === 'string' ? session : (session.display_id || sid);
                      return (
                        <DropdownMenu.Item
                          key={`${sid}-${index}`}
                          className={`px-4 py-1.5 text-sm outline-none cursor-pointer truncate transition-colors ${
                            sid === sessionId
                              ? 'text-accent bg-accent/10'
                              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                          }`}
                          onSelect={() => handleSwitchSession(sid)}
                        >
                          {displayName}
                        </DropdownMenu.Item>
                      );
                    })}
                  </Fragment>
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          
          <DropdownMenu.Item 
            className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary outline-none cursor-pointer transition-colors"
            onSelect={handleNewSession}
          >
            <Plus className="w-4 h-4" />
            New Session
          </DropdownMenu.Item>
          
          <DropdownMenu.Separator className="h-px bg-bg-tertiary my-1" />
          
          {/* Footer */}
          <div className="px-4 py-2">
            <div className="text-xs text-text-secondary">
              Emilia v2.0 • React + TypeScript
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default BurgerMenu;
