import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { X, Plus, MessageSquare, User, Sparkles, MoreVertical, Pencil, Trash2, Settings } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useLogout } from '../hooks/useLogout';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { formatDate } from '../utils/helpers';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenUserSettings: () => void;
}

function Drawer({ open, onClose, onOpenUserSettings }: DrawerProps) {
  const navigate = useNavigate();
  const { rooms, roomId, fetchRooms, deleteRoom, renameRoom, isLoading } = useSession();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const logout = useLogout();

  // Menu state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameRoomId, setRenameRoomId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);

  // Fetch rooms when drawer opens
  useEffect(() => {
    if (open) {
      fetchRooms();
    }
  }, [open, fetchRooms]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClick = () => setMenuOpenFor(null);
    if (menuOpenFor) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenFor]);

  const handleNewChat = async () => {
    if (!currentUser?.id) return;
    navigate({
      to: '/user/$userId/chat/new',
      params: { userId: currentUser.id }
    });
    onClose();
  };

  const handleSwitchRoom = async (rid: string) => {
    if (rid === roomId) {
      onClose();
      return;
    }

    // Clear messages immediately to prevent stale display
    useChatStore.getState().clearMessages();

    if (currentUser?.id) {
      navigate({
        to: '/user/$userId/chat/$roomId',
        params: { userId: currentUser.id, roomId: rid }
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

  const handleOpenRename = (rid: string, currentName: string) => {
    setRenameRoomId(rid);
    setRenameValue(currentName || '');
    setRenameModalOpen(true);
    setMenuOpenFor(null);
  };

  const handleRename = async () => {
    if (!renameRoomId) return;
    try {
      await renameRoom(renameRoomId, renameValue);
      setRenameModalOpen(false);
      setRenameRoomId(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename room:', error);
    }
  };

  const handleOpenDelete = (rid: string) => {
    setDeleteRoomId(rid);
    setDeleteModalOpen(true);
    setMenuOpenFor(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteRoomId) return;
    try {
      const wasCurrentRoom = deleteRoomId === roomId;
      await deleteRoom(deleteRoomId);
      setDeleteModalOpen(false);
      setDeleteRoomId(null);

      if (wasCurrentRoom && currentUser?.id) {
        const remainingRooms = await fetchRooms();

        if (remainingRooms.length > 0) {
          navigate({
            to: '/user/$userId/chat/$roomId',
            params: { userId: currentUser.id, roomId: remainingRooms[0].id }
          });
        } else {
          navigate({
            to: '/user/$userId/chat/new',
            params: { userId: currentUser.id }
          });
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to delete room:', error);
    }
  };

  const formatRoomName = (room: { name: string; id: string; room_type: string }) => {
    return room.name || `Chat ${room.id.slice(0, 8)}`;
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="left-0 top-0 translate-x-0 translate-y-0 h-[100svh] w-72 max-w-[85vw] rounded-none border-r border-white/10 bg-bg-secondary/95 p-0 shadow-[20px_0_60px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md flex flex-col data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2">
        {/* Drawer Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <DialogTitle className="font-display text-lg text-text-primary">
            {currentAgent?.display_name || 'Kokoro'}
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          Navigate chats, switch users, and manage settings.
        </DialogDescription>

        {/* Top Actions - Switch User, Select Agent */}
        <div className="border-b border-white/10 p-3 space-y-1 shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
            onClick={handleSwitchUser}
          >
            <User className="w-4 h-4" />
            Switch User
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
            onClick={handleSelectAgent}
          >
            <Sparkles className="w-4 h-4" />
            Select Character
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 border-b border-white/10">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-text-secondary hover:text-text-primary hover:bg-white/10"
            onClick={handleNewChat}
            disabled={!currentAgent}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        {/* Rooms List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs text-text-secondary uppercase tracking-wide px-2 py-1">
              Chats
            </div>
            {!currentAgent ? (
              <div className="px-2 py-4 text-sm text-text-secondary">Select a character first</div>
            ) : isLoading ? (
              <div className="px-2 py-4 text-sm text-text-secondary">Loading...</div>
            ) : rooms.length === 0 ? (
              <div className="px-2 py-4 text-sm text-text-secondary">No chats yet</div>
            ) : (
              <div className="space-y-1">
                {rooms.map((room) => {
                  const isActive = room.id === roomId;
                  const isMenuOpen = menuOpenFor === room.id;

                  return (
                    <div key={room.id} className="relative group">
                      <button
                        onClick={() => handleSwitchRoom(room.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-left ${
                          isActive
                            ? 'bg-accent/15 text-accent border border-accent/30'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{formatRoomName(room)}</div>
                          <div className="text-xs text-text-secondary/70">
                            {formatDate(room.last_activity)} · {room.message_count} msgs
                          </div>
                        </div>
                      </button>

                      {/* 3-dot menu button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenFor(isMenuOpen ? null : room.id);
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
                            onClick={() => handleOpenRename(room.id, room.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/10"
                          >
                            <Pencil className="w-4 h-4" />
                            Rename
                          </button>
                          <button
                            onClick={() => handleOpenDelete(room.id)}
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
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog
        open={renameModalOpen}
        onOpenChange={(next) => {
          if (!next) setRenameModalOpen(false);
        }}
      >
        <DialogContent className="w-80 max-w-[92vw] p-5">
          <DialogTitle className="font-display text-lg mb-4">Rename Chat</DialogTitle>
          <DialogDescription className="sr-only">
            Update the chat name for easier identification.
          </DialogDescription>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat name"
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
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(next) => {
          if (!next) setDeleteModalOpen(false);
        }}
      >
        <DialogContent className="w-80 max-w-[92vw] p-5">
          <DialogTitle className="font-display text-lg mb-2">Delete Chat</DialogTitle>
          <DialogDescription className="text-text-secondary text-sm mb-4">
            Are you sure you want to delete this chat? This action cannot be undone.
          </DialogDescription>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default Drawer;
