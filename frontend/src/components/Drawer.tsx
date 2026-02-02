import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, Plus, MessageSquare, User, Sparkles, Volume2, VolumeX, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSession } from '../hooks/useSession';
import { useUserStore } from '../store/userStore';
import { renameSession as renameSessionApi } from '../utils/api';
import { formatSessionName } from '../utils/helpers';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

function Drawer({ open, onClose }: DrawerProps) {
  const navigate = useNavigate();
  const { ttsEnabled, setTtsEnabled } = useApp();
  const { sessions, sessionId, createSession, fetchSessions, deleteSession, isLoading } = useSession();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const logout = useUserStore((state) => state.logout);

  // Menu state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Fetch sessions when drawer opens
  useEffect(() => {
    if (open) {
      fetchSessions();
    }
  }, [open, fetchSessions]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClick = () => setMenuOpenFor(null);
    if (menuOpenFor) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenFor]);

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
    if (!currentUser?.id) return;
    // Navigate to the new chat page instead of creating session here
    navigate({
      to: '/user/$userId/chat/new',
      params: { userId: currentUser.id }
    });
    onClose();
  };

  const handleSwitchSession = async (sid: string) => {
    if (sid !== sessionId && currentUser?.id) {
      // Navigate to the new session URL
      navigate({
        to: '/user/$userId/chat/$sessionId',
        params: { userId: currentUser.id, sessionId: sid }
      });
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

  const handleOpenRename = (sid: string, currentName: string | null) => {
    setRenameSessionId(sid);
    setRenameValue(currentName || '');
    setRenameModalOpen(true);
    setMenuOpenFor(null);
  };

  const handleRename = async () => {
    if (!renameSessionId) return;
    try {
      await renameSessionApi(renameSessionId, renameValue);
      await fetchSessions();
      setRenameModalOpen(false);
      setRenameSessionId(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  };

  const handleDelete = async (sid: string) => {
    setMenuOpenFor(null);
    if (!confirm('Delete this session?')) return;
    try {
      const wasCurrentSession = sid === sessionId;
      await deleteSession(sid);

      // If we deleted the current session, navigate appropriately
      if (wasCurrentSession && currentUser?.id) {
        // Fetch fresh sessions to see what's left
        const remainingSessions = await fetchSessions();

        if (remainingSessions.length > 0) {
          // Navigate to the most recent session (sorted by last_used desc)
          const latestSession = remainingSessions[0];
          navigate({
            to: '/user/$userId/chat/$sessionId',
            params: { userId: currentUser.id, sessionId: latestSession.id }
          });
        } else {
          // No sessions left, go to new chat page
          navigate({
            to: '/user/$userId/chat/new',
            params: { userId: currentUser.id }
          });
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
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
                  const isMenuOpen = menuOpenFor === session.id;

                  return (
                    <div key={session.id} className="relative group">
                      <button
                        onClick={() => handleSwitchSession(session.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                          isActive
                            ? 'bg-accent/20 text-accent'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{formatSessionName(session.name, session.id)}</div>
                          <div className="text-xs text-text-secondary/70">
                            {formatLastUsed(session.last_used)} · {session.message_count} msgs
                          </div>
                        </div>
                      </button>

                      {/* 3-dot menu button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenFor(isMenuOpen ? null : session.id);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary/50 hover:text-text-primary hover:bg-bg-tertiary"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleOpenRename(session.id, session.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                          >
                            <Pencil className="w-4 h-4" />
                            Rename
                          </button>
                          <button
                            onClick={() => handleDelete(session.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-bg-tertiary"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
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

      {/* Rename Modal */}
      {renameModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-[60]"
            onClick={() => setRenameModalOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl z-[70] p-4 w-80">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Rename Session</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Session name"
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRenameModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRename}>
                Save
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Drawer;
