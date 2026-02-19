import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '../ui/button';
import AmbientBackground from '../AmbientBackground';
import AppTopNav from '../AppTopNav';
import CreateRoomModal from './CreateRoomModal';
import { useUserStore } from '../../store/userStore';
import { createRoom, deleteRoom, getRooms, getUser, getUserAgents, type Room } from '../../utils/api';

interface RoomListPageProps {
  userId: string;
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return 'Unknown';
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RoomListPage({ userId }: RoomListPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useUserStore((state) => state.currentUser);
  const setUser = useUserStore((state) => state.setUser);

  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
  });

  useEffect(() => {
    const user = userQuery.data;
    if (!user) return;
    if (currentUser?.id === user.id && currentUser.display_name === user.display_name) return;

    setUser({
      id: user.id,
      display_name: user.display_name,
      preferences: user.preferences,
    });
  }, [currentUser?.display_name, currentUser?.id, setUser, userQuery.data]);

  const userReady = currentUser?.id === userId;

  const roomsQuery = useQuery({
    queryKey: ['rooms', userId],
    queryFn: getRooms,
    enabled: userReady,
  });

  const agentsQuery = useQuery({
    queryKey: ['user-agents', userId],
    queryFn: () => getUserAgents(userId),
    enabled: userReady,
  });

  const rooms = useMemo(() => roomsQuery.data || [], [roomsQuery.data]);

  const openRoom = (room: Room) => {
    navigate({
      to: '/user/$userId/rooms/$roomId',
      params: { userId, roomId: room.id },
    });
  };

  const handleCreateRoom = async (payload: { name: string; agent_ids: string[] }) => {
    setIsCreating(true);
    try {
      const created = await createRoom({
        name: payload.name,
        agent_ids: payload.agent_ids,
      });
      await queryClient.invalidateQueries({ queryKey: ['rooms', userId] });
      setCreateOpen(false);
      navigate({
        to: '/user/$userId/rooms/$roomId',
        params: { userId, roomId: created.id },
      });
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRoom = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (deletingId) return;
    if (!confirm('Delete this room and all its messages?')) return;
    setDeletingId(roomId);
    try {
      await deleteRoom(roomId);
      await queryClient.invalidateQueries({ queryKey: ['rooms', userId] });
    } catch (error) {
      console.error('Failed to delete room:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const loading = userQuery.isLoading || roomsQuery.isLoading || agentsQuery.isLoading;

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary relative overflow-hidden">
      <AmbientBackground variant="agent" />

      <div className="relative z-10 flex min-h-[100svh] flex-col">
        <AppTopNav
          onBack={() => navigate({ to: '/user/$userId', params: { userId } })}
          subtitle="Group Rooms"
          rightSlot={(
            <Button
              className="h-10 gap-2"
              onClick={() => setCreateOpen(true)}
              disabled={!userReady || (agentsQuery.data || []).length === 0}
            >
              <Plus className="h-4 w-4" />
              New Room
            </Button>
          )}
        />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-4">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-bg-secondary/60 p-8 text-sm text-text-secondary">
              Loading rooms...
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-bg-secondary/60 p-10 text-center">
              <p className="text-lg text-text-primary">No rooms yet</p>
              <p className="mt-2 text-sm text-text-secondary">Create a room to chat with multiple companions at once.</p>
              <Button className="mt-6 gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create your first room
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRoom(room)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openRoom(room); }}
                  className="cursor-pointer rounded-2xl border border-white/10 bg-bg-secondary/70 p-4 text-left transition-colors hover:border-accent/40 hover:bg-bg-secondary"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-xl text-text-primary">{room.name}</h3>
                      <p className="mt-1 text-xs text-text-secondary">Last activity: {formatTimestamp(room.last_activity)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-bg-tertiary/80 px-2 py-1 text-xs text-text-secondary">
                        {room.room_type}
                      </span>
                      <button
                        onClick={(e) => handleDeleteRoom(e, room.id)}
                        disabled={deletingId === room.id}
                        className="rounded-full p-1.5 text-text-secondary/50 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                        title="Delete room"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {room.message_count} msgs
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Room
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <CreateRoomModal
          open={createOpen}
          agents={agentsQuery.data || []}
          isCreating={isCreating}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreateRoom}
        />
      ) : null}
    </div>
  );
}

export default RoomListPage;
