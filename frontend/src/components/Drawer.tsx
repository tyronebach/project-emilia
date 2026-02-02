import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, Plus, MessageSquare, User, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import { useUserStore } from '../store/userStore';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

function Drawer({ open, onClose }: DrawerProps) {
  const navigate = useNavigate();
  const { ttsEnabled, setTtsEnabled } = useApp();
  const { sessions, sessionId, switchSession, createSession, fetchSessions, isLoading } = useSession();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const logout = useUserStore((state) => state.logout);

  // Fetch sessions when drawer opens
  useEffect(() => {
    if (open) {
      fetchSessions();
    }
  }, [open, fetchSessions]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handleNewSession = async () => {
    const name = prompt('Session name (or leave empty):');
    if (name !== null) {
      await createSession(name || undefined);
      onClose();
    }
  };

  const handleSwitchSession = async (sid: string) => {
    if (sid !== sessionId) {
      await switchSession(sid);
    }
    onClose();
  };

  const handleSwitchUser = () => {
    logout();
    navigate({ to: '/' });
    onClose();
  };

  const handleSelectAgent = () => {
    if (currentUser?.id) {
      navigate({ to: '/user/$userId', params: { userId: currentUser.id } });
    }
    onClose();
  };

  // Format session display
  const formatSessionName = (session: typeof sessions[0]) => {
    if (session.name) return session.name;
    // Show truncated ID
    return session.id.slice(0, 8) + '...';
  };

  const formatLastUsed = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-bg-secondary border-r border-bg-tertiary z-50 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-bg-tertiary shrink-0">
          <span className="text-lg font-semibold text-text-primary">Emilia</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* New Session Button */}
        <div className="p-3 border-b border-bg-tertiary">
          <Button
            variant="secondary"
            className="w-full justify-start gap-2"
            onClick={handleNewSession}
            disabled={!currentAgent}
          >
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        </div>

        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs text-text-secondary uppercase tracking-wide px-2 py-1">
              Sessions
            </div>
            {!currentAgent ? (
              <div className="px-2 py-4 text-sm text-text-secondary">Select an agent first</div>
            ) : isLoading ? (
              <div className="px-2 py-4 text-sm text-text-secondary">Loading...</div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-4 text-sm text-text-secondary">No sessions yet</div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = session.id === sessionId;

                  return (
                    <button
                      key={session.id}
                      onClick={() => handleSwitchSession(session.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                        isActive
                          ? 'bg-accent/20 text-accent'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{formatSessionName(session)}</div>
                        <div className="text-xs text-text-secondary/70">
                          {formatLastUsed(session.last_used)} · {session.message_count} msgs
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom Actions */}
        <div className="border-t border-bg-tertiary p-3 space-y-2 shrink-0">
          {/* Current User/Agent Info */}
          {currentUser && (
            <div className="px-2 py-1 text-xs text-text-secondary">
              <div className="truncate">{currentUser.display_name}</div>
              {currentAgent && (
                <div className="truncate text-accent">{currentAgent.display_name}</div>
              )}
            </div>
          )}

          {/* Switch User */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary"
            onClick={handleSwitchUser}
          >
            <User className="w-4 h-4" />
            Switch User
          </Button>

          {/* Select Agent */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary"
            onClick={handleSelectAgent}
          >
            <Sparkles className="w-4 h-4" />
            Select Agent
          </Button>

          {/* TTS Toggle */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary"
            onClick={() => setTtsEnabled(!ttsEnabled)}
          >
            {ttsEnabled ? (
              <>
                <Volume2 className="w-4 h-4" />
                TTS Enabled
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4" />
                TTS Disabled
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

export default Drawer;
