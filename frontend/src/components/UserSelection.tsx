import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Settings, User as UserIcon } from 'lucide-react';
import { getUsers } from '../utils/api';
import { useUserStore } from '../store/userStore';
import type { User } from '../types';

function UserSelection() {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAgent = useUserStore((state) => state.setAgent);

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const users = useMemo(() => data ?? [], [data]);

  const handleSelect = (user: User) => {
    setUser(user);
    setAgent(null);
    navigate({ to: `/user/${user.id}` });
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Cog icon - top right */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => navigate({ to: '/admin' as any })}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title="Admin Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-12">
            <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Select a profile</p>
            <h2 className="text-3xl md:text-4xl font-semibold mt-2">Who's chatting today?</h2>
          </div>

          {isLoading && (
            <div className="text-center text-text-secondary">Loading users...</div>
          )}
          {error && (
            <div className="text-center text-error">Failed to load users.</div>
          )}
          {!isLoading && !error && users.length === 0 && (
            <div className="text-center text-text-secondary">No users found.</div>
          )}

          {/* User avatars grid */}
          <div className="flex justify-center gap-12 flex-wrap">
            {users.map((user) => (
              <UserAvatar
                key={user.id}
                user={user}
                onSelect={() => handleSelect(user)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface UserAvatarProps {
  user: User;
  onSelect: () => void;
}

function UserAvatar({ user, onSelect }: UserAvatarProps) {
  const agentCount = user.agents?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-3 group focus:outline-none"
    >
      {/* Avatar circle */}
      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border-2 border-transparent group-hover:border-accent group-focus:border-accent transition-all duration-200 flex items-center justify-center overflow-hidden">
          {/* Placeholder avatar - can be replaced with real image */}
          <UserIcon className="w-16 h-16 text-accent/50 group-hover:text-accent transition-colors" />
        </div>
        
        {/* Agent count badge */}
        {agentCount > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-accent text-white text-xs font-semibold px-2 py-0.5 rounded-full min-w-[24px] text-center">
            {agentCount}
          </div>
        )}
      </div>

      {/* Name footer */}
      <span className="text-lg font-medium text-text-primary group-hover:text-accent transition-colors">
        {user.display_name}
      </span>
    </button>
  );
}

export default UserSelection;
