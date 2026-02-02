import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { getUsers } from '../utils/api';
import { useUserStore } from '../store/userStore';
import type { User } from '../types';

function UserSelection() {
  const navigate = useNavigate();
  const setUser = useUserStore((state) => state.setUser);
  const setAvatar = useUserStore((state) => state.setAvatar);

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const users = useMemo(() => data ?? [], [data]);

  const handleSelect = (user: User) => {
    setUser(user);
    setAvatar(null);
    navigate({ to: `/user/${user.id}` });
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">Select a profile</p>
          <h2 className="text-3xl md:text-4xl font-semibold mt-2">Who's chatting today?</h2>
        </div>

        <div className="mt-8">
          {isLoading && (
            <div className="text-center text-text-secondary">Loading users...</div>
          )}
          {error && (
            <div className="text-center text-error">Failed to load users.</div>
          )}
          {!isLoading && !error && users.length === 0 && (
            <div className="text-center text-text-secondary">No users found.</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((user) => (
              <Card
                key={user.id}
                className="bg-bg-secondary border-bg-tertiary hover:border-accent transition-colors cursor-pointer"
                onClick={() => handleSelect(user)}
              >
                <CardHeader>
                  <CardTitle className="text-xl">{user.display_name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-text-secondary">
                  {user.avatar_count ?? 0} avatar{(user.avatar_count ?? 0) === 1 ? '' : 's'} available
                  <Button
                    variant="secondary"
                    className="mt-4 w-full"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSelect(user);
                    }}
                  >
                    Choose
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

export default UserSelection;
