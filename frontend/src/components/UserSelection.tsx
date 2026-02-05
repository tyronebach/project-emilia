import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Sliders, Bug, User as UserIcon } from 'lucide-react';
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
    <div className="min-h-screen bg-bg-primary text-text-primary relative overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-teal),transparent_65%)] blur-3xl opacity-70" />
        <div className="absolute -bottom-40 left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle_at_top,var(--color-glow-amber),transparent_70%)] blur-3xl opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-bg-tertiary/80 border border-white/10 flex items-center justify-center text-sm font-semibold tracking-wide">
              E
            </div>
            <div>
              <div className="font-display text-lg">Emilia</div>
              <div className="text-xs text-text-secondary">Select a profile</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: '/manage' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Settings"
            >
              <Sliders className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: '/debug' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Debug Avatar"
            >
              <Bug className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-5xl">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-white/10 bg-bg-secondary/60 text-xs uppercase tracking-[0.28em] text-text-secondary">
                Profiles
              </div>
              <h2 className="font-display text-3xl md:text-5xl mt-4 text-balance">
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

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
  const agentCount = user.agents?.length ?? 0;
  const initial = user.display_name?.trim()?.[0]?.toUpperCase() || 'U';

  return (
    <button
      onClick={onSelect}
      className="group relative flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-bg-secondary/60 p-6 text-left shadow-[0_25px_60px_-40px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:bg-bg-secondary/80 focus:outline-none"
    >
      <div className="relative">
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-[radial-gradient(circle_at_top,rgba(34,195,166,0.35),transparent_65%)] border border-white/10 flex items-center justify-center overflow-hidden">
          <div className="w-20 h-20 rounded-2xl bg-bg-tertiary/80 flex items-center justify-center text-2xl font-semibold text-text-primary/90">
            {initial}
          </div>
          <div className="absolute inset-0 ring-1 ring-white/5 group-hover:ring-accent/40 transition-colors" />
        </div>

        {agentCount > 0 && (
          <div className="absolute -bottom-2 -right-2 bg-accent text-black text-[11px] font-semibold px-2 py-0.5 rounded-full min-w-[24px] text-center">
            {agentCount}
          </div>
        )}
      </div>

      <div className="text-center">
        <span className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors">
          {user.display_name}
        </span>
        <div className="text-xs text-text-secondary mt-1">
          {agentCount > 0 ? `${agentCount} companions` : 'No companions yet'}
        </div>
      </div>

      <div className="absolute top-4 right-4 text-text-secondary/70">
        <UserIcon className="w-4 h-4" />
      </div>
    </button>
  );
}

export default UserSelection;
