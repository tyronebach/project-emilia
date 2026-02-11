import type { Agent, User } from '../../utils/api';

type AgentWithWorkspace = Agent & {
  workspace: string | null;
  created_at: number;
};

interface SessionsTabProps {
  loadingUsers: boolean;
  users: User[];
  selectedUserId: string;
  selectedUser: User | null;
  loadingMappings: boolean;
  agents: AgentWithWorkspace[];
  userAgentIds: Set<string>;
  mappingBusy: Set<string>;
  onSelectUserId: (userId: string) => void;
  onToggleUserAgent: (agentId: string, nextChecked: boolean) => Promise<void> | void;
}

function SessionsTab({
  loadingUsers,
  users,
  selectedUserId,
  selectedUser,
  loadingMappings,
  agents,
  userAgentIds,
  mappingBusy,
  onSelectUserId,
  onToggleUserAgent,
}: SessionsTabProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">User-Agent Mappings</h2>
        <p className="text-sm text-text-secondary">Grant or revoke access to agents per user.</p>
      </div>

      {loadingUsers ? (
        <div className="text-center py-8 text-text-secondary">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">Create a user to manage mappings.</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
            <label className="block text-xs text-text-secondary mb-2">Select user</label>
            <select
              value={selectedUserId}
              onChange={(e) => onSelectUserId(e.target.value)}
              title="Select which user to manage agent access for."
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Choose a user...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.id})
                </option>
              ))}
            </select>
            {selectedUser && (
              <div className="mt-2 text-xs text-text-secondary">
                Managing access for <span className="text-text-primary">{selectedUser.display_name}</span>
              </div>
            )}
          </div>

          {!selectedUserId ? (
            <div className="text-center py-8 text-text-secondary">Select a user to view access.</div>
          ) : loadingMappings ? (
            <div className="text-center py-8 text-text-secondary">Loading mappings...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-text-secondary">No agents available.</div>
          ) : (
            <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {agents.map((agent) => {
                  const checked = userAgentIds.has(agent.id);
                  const busy = mappingBusy.has(agent.id);
                  return (
                    <label
                      key={agent.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${checked ? 'border-accent/40 bg-bg-tertiary/70' : 'border-white/10'} transition-colors`}
                    >
                      <div>
                        <div className="text-sm">{agent.display_name}</div>
                        <div className="text-xs text-text-secondary font-mono">{agent.id}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(e) => onToggleUserAgent(agent.id, e.target.checked)}
                        title={checked ? 'Click to revoke access' : 'Click to grant access'}
                        className="h-4 w-4 accent-accent"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SessionsTab;
