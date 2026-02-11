import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { User } from '../../utils/api';

interface UsersTabProps {
  loadingUsers: boolean;
  users: User[];
  onOpenCreateUser: () => void;
  onOpenEditUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

function UsersTab({
  loadingUsers,
  users,
  onOpenCreateUser,
  onOpenEditUser,
  onDeleteUser,
}: UsersTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Users</h2>
          <p className="text-sm text-text-secondary">Manage user accounts and display names.</p>
        </div>
        <Button onClick={onOpenCreateUser} className="gap-2">
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {loadingUsers ? (
        <div className="text-center py-8 text-text-secondary">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">No users found.</div>
      ) : (
        <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-tertiary/70 text-text-secondary text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Display Name</th>
                <th className="text-left px-4 py-3">Agent Count</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{user.id}</td>
                  <td className="px-4 py-3">{user.display_name}</td>
                  <td className="px-4 py-3">{user.avatar_count ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => onOpenEditUser(user)}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-error hover:text-error"
                        onClick={() => onDeleteUser(user.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default UsersTab;
