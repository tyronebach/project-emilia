import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, Plus, MessageSquare, User, Sparkles, MoreVertical, Pencil, Trash2, Settings } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { renameSession as renameSessionApi } from '../utils/api';
import { formatSessionName } from '../utils/helpers';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenUserSettings: () => void;
}

function Drawer({ open, onClose, onOpenUserSettings }: DrawerProps) {
  const navigate = useNavigate();
  const { sessions, sessionId, fetchSessions, deleteSession, isLoading } = useSession();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const logout = useUserStore((state) => state.logout);

  // Menu state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

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
    if (sid === sessionId) {
      onClose();
      return;
    }

    // Clear messages immediately to prevent stale display
    useChatStore.getState().clearMessages();

    if (currentUser?.id) {
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

  const handleOpenDelete = (sid: string) => {
    setDeleteSessionId(sid);
    setDeleteModalOpen(true);
    setMenuOpenFor(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteSessionId) return;
    try {
      const wasCurrentSession = deleteSessionId === sessionId;
      await deleteSession(deleteSessionId);
      setDeleteModalOpen(false);
      setDeleteSessionId(null);

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
        className={`fixed inset-0 bg-bg-primary/70 backdrop-blur-md z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-bg-secondary/95 border-r border-white/10 z-50 flex flex-col transition-transform duration-300 shadow-[20px_0_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <span className="font-display text-lg text-text-primary">
            {currentAgent?.display_name || 'Emilia'}
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Top Actions - Switch User, Select Agent, TTS */}
        <div className="border-b border-white/10 p-3 space-y-1 shrink-0">
          {/* Switch User */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
            onClick={handleSwitchUser}
          >
            <User className="w-4 h-4" />
            Switch User
          </Button>

          {/* Select Character */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
            onClick={handleSelectAgent}
          >
            <Sparkles className="w-4 h-4" />
            Select Character
          </Button>

        </div>

        {/* New Session Button - transparent background */}
        <div className="p-3 border-b border-white/10">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
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
              <div className="px-2 py-4 text-sm text-text-secondary">Select a character first</div>
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
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-left ${
                          isActive
                            ? 'bg-accent/15 text-accent border border-accent/30'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/10 border border-transparent'
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary/50 hover:text-text-primary hover:bg-white/10"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 bg-bg-secondary border border-white/10 rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleOpenRename(session.id, session.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/10"
                          >
                            <Pencil className="w-4 h-4" />
                            Rename
                          </button>
                          <button
                            onClick={() => handleOpenDelete(session.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-white/10"
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

        {/* Bottom - User Settings */}
        <div className="border-t border-white/10 p-3 shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-4 text-text-secondary hover:text-text-primary hover:bg-white/10 h-auto py-4 border border-white/5 rounded-2xl"
            onClick={onOpenUserSettings}
          >
            <div className="h-10 w-10 rounded-2xl bg-bg-tertiary/80 border border-white/10 flex items-center justify-center">
              <Settings className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-text-primary">
                {currentUser?.display_name || 'User'}
              </span>
              <span className="text-xs text-text-secondary">User Settings</span>
            </div>
          </Button>
        </div>
      </div>

      {/* Rename Modal */}
      {renameModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-bg-primary/70 z-[60]"
            onClick={() => setRenameModalOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-secondary border border-white/10 rounded-2xl shadow-xl z-[70] p-5 w-80">
            <h3 className="font-display text-lg text-text-primary mb-4">Rename Session</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Session name"
              className="w-full bg-bg-tertiary/80 border border-white/10 text-text-primary rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-accent"
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

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-bg-primary/70 z-[60]"
            onClick={() => setDeleteModalOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-secondary border border-white/10 rounded-2xl shadow-xl z-[70] p-5 w-80">
            <h3 className="font-display text-lg text-text-primary mb-2">Delete Session</h3>
            <p className="text-text-secondary text-sm mb-4">
              Are you sure you want to delete this session? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Drawer;
