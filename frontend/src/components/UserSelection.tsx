import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Sliders, Bug, Palette } from 'lucide-react';
import { getUsers } from '../utils/api';
import { useUserStore } from '../store/userStore';
import type { User } from '../types';
import userPlaceholder from '../assets/placeholder-user.jpg';
import AmbientBackground from './AmbientBackground';
import AppTopNav from './AppTopNav';

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
    <div className="min-h-[100svh] bg-bg-primary text-text-primary relative overflow-hidden">
      <AmbientBackground variant="user" />

      <div className="relative z-10 flex min-h-[100svh] flex-col">
        <AppTopNav
          showBrand={false}
          rightSlot={(
            <>
              <button
                onClick={() => navigate({ to: '/manage' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Agent Settings"
              >
                <Sliders className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate({ to: '/designer-v2' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Agent Designer"
              >
                <Palette className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate({ to: '/debug' })}
                className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                title="Debug Avatar"
              >
                <Bug className="w-5 h-5" />
              </button>
            </>
          )}
        />

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-5xl">
            <div className="text-center mb-12">
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-5xl md:text-7xl text-accent leading-none">心</span>
                  <span className="font-display text-4xl md:text-6xl text-balance tracking-[0.08em] uppercase text-accent">
                    Kokoro
                  </span>
                </div>
              </div>
              <h2 className="font-display text-3xl md:text-5xl mt-3 text-balance">
                Who&rsquo;s chatting today?
              </h2>
              <p className="text-text-secondary mt-3 text-base md:text-lg text-balance">
                Pick a profile to continue with their favorite companions.
              </p>
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

            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
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
    </div>
  );
}

interface UserAvatarProps {
  user: User;
  onSelect: () => void;
}

function UserAvatar({ user, onSelect }: UserAvatarProps) {
  const agentCount = user.avatar_count ?? user.agents?.length ?? 0;

  return (
    <button
      onClick={onSelect}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-bg-secondary/60 text-left shadow-[0_25px_60px_-40px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:bg-bg-secondary/80 focus:outline-none"
    >
      <div className="relative">
        <div className="aspect-square w-full overflow-hidden">
          <img
            src={userPlaceholder}
            alt={`${user.display_name} avatar`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-primary/90 via-bg-primary/40 to-transparent" />
      </div>

      <div className="px-3 py-3 sm:px-4 sm:py-4 flex items-center justify-between gap-3">
        <span className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors">
          {user.display_name}
        </span>
        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-bg-secondary/80 border border-white/10 flex items-center justify-center text-xs sm:text-sm font-semibold text-text-primary shrink-0">
          {agentCount}
        </div>
      </div>
    </button>
  );
}

export default UserSelection;
