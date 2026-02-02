import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { getUser, selectAvatar } from '../utils/api';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import type { Avatar, User } from '../types';

interface AvatarSelectionProps {
  userId: string;
}

function normalizeAvatars(userId: string, data: User | null): Avatar[] {
  if (!data) return [];
  const raw = (data as unknown as { avatars?: unknown }).avatars;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') {
    return raw as Avatar[];
  }
  if (Array.isArray(raw)) {
    return raw.map((avatarId) => ({
      id: String(avatarId),
      display_name: String(avatarId),
      agent_id: String(avatarId),
      owner: userId,
      vrm_model: '',
      voice_id: '',
    }));
  }
  return [];
}

function AvatarSelection({ userId }: AvatarSelectionProps) {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAvatar = useUserStore((state) => state.setAvatar);
  const currentUser = useUserStore((state) => state.currentUser);
  const setSessionId = useAppStore((state) => state.setSessionId);

  const [selectingId, setSelectingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
  });

  useEffect(() => {
    if (data && (!currentUser || currentUser.id !== userId)) {
      setUser({
        ...data,
        id: data.id ?? userId,
      });
    }
  }, [data, currentUser, setUser, userId]);

  const avatars = useMemo(() => normalizeAvatars(userId, data ?? null), [userId, data]);

  const handleSelect = async (avatar: Avatar) => {
    try {
      setSelectingId(avatar.id);
      const sessionInfo = await selectAvatar(userId, avatar.id);
      setAvatar(avatar);
      setSessionId(sessionInfo.session_id);
      navigate({ to: '/chat' });
    } catch (err) {
      console.error('Avatar selection failed:', err);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Select an avatar</p>
          <h2 className="text-3xl md:text-4xl font-semibold mt-2">Pick your Emilia</h2>
        </div>

        <div className="mt-8">
          {isLoading && (
            <div className="text-center text-text-secondary">Loading avatars...</div>
          )}
          {error && (
            <div className="text-center text-error">Failed to load avatars.</div>
          )}
          {!isLoading && !error && avatars.length === 0 && (
            <div className="text-center text-text-secondary">No avatars found.</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {avatars.map((avatar) => (
              <Card
                key={avatar.id}
                className="bg-bg-secondary border-bg-tertiary hover:border-accent transition-colors"
              >
                <CardHeader>
                  <CardTitle className="text-xl">{avatar.display_name || avatar.id}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-36 rounded-lg border border-bg-tertiary bg-bg-tertiary/30 flex items-center justify-center text-text-secondary text-sm">
                    VRM preview
                  </div>
                  <Button
                    className="w-full"
                    disabled={!!selectingId}
                    onClick={() => handleSelect(avatar)}
                  >
                    {selectingId === avatar.id ? 'Selecting...' : 'Use this avatar'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AvatarSelection;
