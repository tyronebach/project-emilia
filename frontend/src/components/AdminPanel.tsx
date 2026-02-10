import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  Bot,
  Bug,
  CheckCircle,
  Link,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import DeleteConfirmDialog from './designer/DeleteConfirmDialog';
import {
  addUserAgent,
  createAgent,
  createUser,
  deleteAgent,
  deleteUser,
  fetchUserAgents,
  fetchUsers,
  fetchWithAuth,
  removeUserAgent,
  updateUser,
  type Agent,
  type User,
} from '../utils/api';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { useVrmOptions } from '../hooks/useVrmOptions';
import AppTopNav from './AppTopNav';

type EditableField = 'display_name' | 'voice_id' | 'vrm_model' | 'workspace';

type AgentWithWorkspace = Agent & {
  workspace: string | null;
  created_at: number;
};

type TabKey = 'users' | 'agents' | 'mappings';

type FieldProps = {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
  tooltip?: string;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
  readOnly = false,
  tooltip,
}: FieldProps) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1" title={tooltip}>{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        title={tooltip}
        className={`w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none ${mono ? 'font-mono text-xs' : ''} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}

function AdminPanel() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  const [agents, setAgents] = useState<AgentWithWorkspace[]>([]);
  const [originalAgents, setOriginalAgents] = useState<AgentWithWorkspace[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMappings, setLoadingMappings] = useState(false);

  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { voices: voiceOptions, loading: voicesLoading } = useVoiceOptions();
  const { models: vrmOptions, loading: vrmLoading } = useVrmOptions();

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit'>('create');
  const [userForm, setUserForm] = useState({ id: '', display_name: '' });
  const [userSaving, setUserSaving] = useState(false);

  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState({
    id: '',
    display_name: '',
    clawdbot_agent_id: '',
    vrm_model: 'emilia.vrm',
    voice_id: '',
    workspace: '',
  });
  const [agentSaving, setAgentSaving] = useState(false);

  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [userAgentIds, setUserAgentIds] = useState<Set<string>>(new Set());
  const [mappingBusy, setMappingBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    void refreshUsers();
    void refreshAgents();
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserAgentIds(new Set());
      return;
    }
    void refreshUserAgents(selectedUserId);
  }, [selectedUserId]);

  const agentById = useMemo(() => {
    const map = new Map<string, AgentWithWorkspace>();
    agents.forEach((agent) => map.set(agent.id, agent));
    return map;
  }, [agents]);

  const refreshAgents = async () => {
    setLoadingAgents(true);
    try {
      const response = await fetchWithAuth('/api/manage/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data = await response.json();
      const agentList = (data.agents || []).map((agent: Agent) => ({
        ...agent,
        workspace: agent.workspace ?? null,
      })) as AgentWithWorkspace[];
      setAgents(agentList);
      setOriginalAgents(JSON.parse(JSON.stringify(agentList)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoadingAgents(false);
    }
  };

  const refreshUsers = async () => {
    setLoadingUsers(true);
    try {
      const userList = await fetchUsers();
      setUsers(userList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const refreshUserAgents = async (userId: string) => {
    setLoadingMappings(true);
    try {
      const agentsForUser = await fetchUserAgents(userId);
      setUserAgentIds(new Set(agentsForUser.map((agent) => agent.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings');
    } finally {
      setLoadingMappings(false);
    }
  };

  const handleFieldChange = (agentId: string, field: EditableField, value: string) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, [field]: value } : a
    ));
  };

  const handleVoiceChange = async (agent: AgentWithWorkspace, value: string) => {
    const normalized = value.trim();
    const nextVoiceId = normalized ? normalized : null;
    const previousVoiceId = agent.voice_id;

    if (previousVoiceId === nextVoiceId) return;

    setAgents(prev => prev.map(a =>
      a.id === agent.id ? { ...a, voice_id: nextVoiceId } : a
    ));

    setSavingAgentId(agent.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithAuth(`/api/manage/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ voice_id: nextVoiceId }),
      });

      if (!response.ok) throw new Error('Failed to save voice');

      setOriginalAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, voice_id: nextVoiceId } : a
      ));

      setSuccess(`Saved voice for ${agent.display_name}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save voice');
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, voice_id: previousVoiceId } : a
      ));
    } finally {
      setSavingAgentId(null);
    }
  };

  const hasChanges = (agent: AgentWithWorkspace): boolean => {
    const original = originalAgents.find(a => a.id === agent.id);
    if (!original) return false;
    return (
      agent.display_name !== original.display_name ||
      agent.voice_id !== original.voice_id ||
      agent.vrm_model !== original.vrm_model ||
      agent.workspace !== original.workspace
    );
  };

  const handleReset = (agentId: string) => {
    const original = originalAgents.find(a => a.id === agentId);
    if (original) {
      setAgents(prev => prev.map(a =>
        a.id === agentId ? { ...original } : a
      ));
    }
  };

  const handleSave = async (agent: AgentWithWorkspace) => {
    setSavingAgentId(agent.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithAuth(`/api/manage/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: agent.display_name.trim(),
          voice_id: agent.voice_id?.trim() || null,
          vrm_model: agent.vrm_model?.trim() || null,
          workspace: agent.workspace?.trim() || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      setOriginalAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...agent } : a
      ));

      setSuccess(`Saved ${agent.display_name}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAgentId(null);
    }
  };

  const openCreateUser = () => {
    setUserModalMode('create');
    setUserForm({ id: '', display_name: '' });
    setUserModalOpen(true);
  };

  const openEditUser = (user: User) => {
    setUserModalMode('edit');
    setUserForm({ id: user.id, display_name: user.display_name });
    setUserModalOpen(true);
  };

  const handleUserSave = async () => {
    setUserSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (userModalMode === 'create') {
        await createUser({
          id: userForm.id.trim(),
          display_name: userForm.display_name.trim(),
        });
        setSuccess(`Created user ${userForm.display_name}`);
      } else {
        await updateUser(userForm.id, { display_name: userForm.display_name.trim() });
        setSuccess(`Updated user ${userForm.display_name}`);
      }
      setUserModalOpen(false);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setUserSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteUser(deleteUserId);
      setSuccess('User deleted');
      if (selectedUserId === deleteUserId) {
        setSelectedUserId('');
      }
      setDeleteUserId(null);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const openCreateAgent = () => {
    setAgentForm({
      id: '',
      display_name: '',
      clawdbot_agent_id: '',
      vrm_model: 'emilia.vrm',
      voice_id: '',
      workspace: '',
    });
    setAgentModalOpen(true);
  };

  const handleCreateAgent = async () => {
    setAgentSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createAgent({
        id: agentForm.id.trim(),
        display_name: agentForm.display_name.trim(),
        clawdbot_agent_id: agentForm.clawdbot_agent_id.trim(),
        vrm_model: agentForm.vrm_model || 'emilia.vrm',
        voice_id: agentForm.voice_id.trim() || null,
        workspace: agentForm.workspace.trim() || null,
      });
      setSuccess(`Created agent ${agentForm.display_name}`);
      setAgentModalOpen(false);
      await refreshAgents();
      await refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setAgentSaving(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!deleteAgentId) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteAgent(deleteAgentId);
      setSuccess('Agent deleted');
      setDeleteAgentId(null);
      await refreshAgents();
      await refreshUsers();
      if (selectedUserId) {
        await refreshUserAgents(selectedUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    } finally {
      setDeleting(false);
    }
  };

  const toggleUserAgent = async (agentId: string, nextChecked: boolean) => {
    if (!selectedUserId) return;
    const previous = new Set(userAgentIds);
    const updated = new Set(userAgentIds);

    if (nextChecked) {
      updated.add(agentId);
    } else {
      updated.delete(agentId);
    }

    setUserAgentIds(updated);
    setMappingBusy(prev => new Set([...prev, agentId]));
    setError(null);
    setSuccess(null);

    try {
      if (nextChecked) {
        await addUserAgent(selectedUserId, agentId);
        setSuccess('Access granted');
      } else {
        await removeUserAgent(selectedUserId, agentId);
        setSuccess('Access revoked');
      }
      await refreshUsers();
    } catch (err) {
      setUserAgentIds(previous);
      setError(err instanceof Error ? err.message : 'Failed to update mapping');
    } finally {
      setMappingBusy(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'mappings', label: 'Mappings', icon: Link },
  ] as const;

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;
  const deleteUserTarget = deleteUserId ? users.find((user) => user.id === deleteUserId) : null;
  const deleteAgentTarget = deleteAgentId ? agentById.get(deleteAgentId) : null;

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary flex flex-col">
      <AppTopNav
        onBack={() => navigate({ to: '/' })}
        subtitle="Admin Panel"
        rightSlot={(
          <>
            <button
              onClick={() => navigate({ to: '/manage' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Admin Panel"
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

      <div className="px-6 pt-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-wrap gap-2 bg-bg-secondary/70 border border-white/10 rounded-2xl p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-colors ${active
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-lg flex items-center gap-2 text-success text-sm">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl">Users</h2>
                <p className="text-sm text-text-secondary">Manage user accounts and display names.</p>
              </div>
              <Button onClick={openCreateUser} className="gap-2">
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
                              onClick={() => openEditUser(user)}
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-error hover:text-error"
                              onClick={() => setDeleteUserId(user.id)}
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
        )}

        {activeTab === 'agents' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">Agents</h2>
                <p className="text-sm text-text-secondary">Create, update, or remove agents.</p>
              </div>
              <Button onClick={openCreateAgent} className="gap-2">
                <Plus className="w-4 h-4" />
                New Agent
              </Button>
            </div>

            {loadingAgents ? (
              <div className="text-center py-8 text-text-secondary">Loading agents...</div>
            ) : agents.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">No agents found.</div>
            ) : (
              <div className="space-y-6">
                {agents.map((agent) => {
                  const changed = hasChanges(agent);
                  return (
                    <div
                      key={agent.id}
                      className={`bg-bg-secondary/70 border rounded-2xl p-5 ${changed ? 'border-accent/50' : 'border-white/10'} shadow-[0_20px_40px_-30px_rgba(0,0,0,0.6)]`}
                    >
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                        <div>
                          <h3 className="font-display text-lg">{agent.display_name}</h3>
                          <span className="text-xs text-text-secondary font-mono">{agent.id}</span>
                        </div>
                        <div className="text-xs text-text-secondary">
                          Clawdbot: <span className="font-mono">{agent.clawdbot_agent_id}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <Field
                          label="Display Name"
                          value={agent.display_name}
                          onChange={(v) => handleFieldChange(agent.id, 'display_name', v)}
                          placeholder="Agent display name"
                          tooltip="Human-friendly agent name shown in the UI."
                        />
                        <div>
                          <label className="block text-xs text-text-secondary mb-1" title="ElevenLabs voice ID override for this agent.">
                            Voice (ElevenLabs)
                          </label>
                          <select
                            value={agent.voice_id || ''}
                            onChange={(e) => handleVoiceChange(agent, e.target.value)}
                            disabled={savingAgentId === agent.id}
                            title="Optional voice ID override. Leave blank to use the global default."
                            className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                          >
                            <option value="">
                              {voicesLoading ? 'Loading voices...' : 'Default (global)'}
                            </option>
                            {!voicesLoading && agent.voice_id && !voiceOptions.some((voice) => voice.id === agent.voice_id) && (
                              <option value={agent.voice_id}>
                                Custom ({agent.voice_id})
                              </option>
                            )}
                            {voiceOptions.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                {voice.name} ({voice.id})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-text-secondary mb-1" title="VRM filename used by the avatar renderer.">
                            VRM Model
                          </label>
                          <select
                            value={agent.vrm_model || ''}
                            onChange={(e) => handleFieldChange(agent.id, 'vrm_model', e.target.value)}
                            disabled={savingAgentId === agent.id}
                            title="Select a VRM model file. Default is emilia.vrm."
                            className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                          >
                            <option value="">
                              {vrmLoading ? 'Loading models...' : 'Default (emilia.vrm)'}
                            </option>
                            {!vrmLoading && agent.vrm_model && !vrmOptions.some((model) => model.id === agent.vrm_model) && (
                              <option value={agent.vrm_model}>
                                Custom ({agent.vrm_model})
                              </option>
                            )}
                            {vrmOptions.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name} ({model.id})
                              </option>
                            ))}
                          </select>
                        </div>
                        <Field
                          label="Workspace Path"
                          value={agent.workspace}
                          onChange={(v) => handleFieldChange(agent.id, 'workspace', v)}
                          placeholder="/home/user/agent-workspace"
                          mono
                          tooltip="Filesystem path used by tools/memory for this agent."
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-bg-tertiary">
                        <div className="text-xs text-text-secondary">
                          {changed && <span className="text-accent">Unsaved changes</span>}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-error hover:text-error"
                            onClick={() => setDeleteAgentId(agent.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                          {changed && (
                            <Button
                              onClick={() => handleReset(agent.id)}
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Reset
                            </Button>
                          )}
                          <Button
                            onClick={() => handleSave(agent)}
                            disabled={savingAgentId === agent.id || !changed}
                            size="sm"
                            className="gap-1"
                          >
                            <Save className="w-4 h-4" />
                            {savingAgentId === agent.id ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mappings' && (
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
                    onChange={(e) => setSelectedUserId(e.target.value)}
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
                              onChange={(e) => toggleUserAgent(agent.id, e.target.checked)}
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
        )}
      </div>

      <Dialog open={userModalOpen} onOpenChange={(open) => !open && setUserModalOpen(false)}>
        <DialogContent className="w-[min(92vw,420px)] p-5">
          <DialogTitle className="font-display text-lg">
            {userModalMode === 'create' ? 'Add User' : 'Edit User'}
          </DialogTitle>
          <DialogDescription className="sr-only">Manage user details.</DialogDescription>
          <div className="space-y-3">
            <Field
              label="User ID"
              value={userForm.id}
              onChange={(v) => setUserForm(prev => ({ ...prev, id: v }))}
              placeholder="thai"
              mono
              readOnly={userModalMode === 'edit'}
              tooltip="Stable identifier (slug). Used in headers and URLs."
            />
            <Field
              label="Display Name"
              value={userForm.display_name}
              onChange={(v) => setUserForm(prev => ({ ...prev, display_name: v }))}
              placeholder="Thai"
              tooltip="Human-friendly name shown in the UI."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setUserModalOpen(false)} disabled={userSaving}>
              Cancel
            </Button>
            <Button onClick={handleUserSave} disabled={userSaving}>
              {userSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={agentModalOpen} onOpenChange={(open) => !open && setAgentModalOpen(false)}>
        <DialogContent className="w-[min(92vw,520px)] p-5">
          <DialogTitle className="font-display text-lg">New Agent</DialogTitle>
          <DialogDescription className="sr-only">Create a new agent.</DialogDescription>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Agent ID"
              value={agentForm.id}
              onChange={(v) => setAgentForm(prev => ({ ...prev, id: v }))}
              placeholder="emilia-thai"
              mono
              tooltip="Primary key for the agent in this app."
            />
            <Field
              label="Display Name"
              value={agentForm.display_name}
              onChange={(v) => setAgentForm(prev => ({ ...prev, display_name: v }))}
              placeholder="Emilia Thai"
              tooltip="Human-friendly agent name shown in the UI."
            />
            <Field
              label="Clawdbot Agent ID"
              value={agentForm.clawdbot_agent_id}
              onChange={(v) => setAgentForm(prev => ({ ...prev, clawdbot_agent_id: v }))}
              placeholder="emilia-thai"
              mono
              tooltip="OpenClaw agent identifier used for external agent profiles."
            />
            <div>
              <label className="block text-xs text-text-secondary mb-1" title="VRM filename used by the avatar renderer.">
                VRM Model
              </label>
              <select
                value={agentForm.vrm_model}
                onChange={(e) => setAgentForm(prev => ({ ...prev, vrm_model: e.target.value }))}
                title="Select a VRM model file. Default is emilia.vrm."
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">
                  {vrmLoading ? 'Loading models...' : 'Default (emilia.vrm)'}
                </option>
                {vrmOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1" title="Optional ElevenLabs voice ID override.">
                Voice ID
              </label>
              <input
                list="voice-options"
                value={agentForm.voice_id}
                onChange={(e) => setAgentForm(prev => ({ ...prev, voice_id: e.target.value }))}
                placeholder="Leave blank for default"
                title="Optional voice ID override. Leave blank to use the global default."
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <datalist id="voice-options">
                {voiceOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </datalist>
            </div>
            <Field
              label="Workspace Path"
              value={agentForm.workspace}
              onChange={(v) => setAgentForm(prev => ({ ...prev, workspace: v }))}
              placeholder="/home/user/agent-workspace"
              mono
              tooltip="Filesystem path used by tools/memory for this agent."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setAgentModalOpen(false)} disabled={agentSaving}>
              Cancel
            </Button>
            <Button onClick={handleCreateAgent} disabled={agentSaving}>
              {agentSaving ? 'Creating...' : 'Create Agent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(deleteUserId)}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
        title={deleteUserTarget ? `Delete ${deleteUserTarget.display_name}?` : 'Delete user?'}
        description="This will remove the user and all associated mappings."
        onConfirm={handleDeleteUser}
        loading={deleting}
      />

      <DeleteConfirmDialog
        open={Boolean(deleteAgentId)}
        onOpenChange={(open) => !open && setDeleteAgentId(null)}
        title={deleteAgentTarget ? `Delete ${deleteAgentTarget.display_name}?` : 'Delete agent?'}
        description="This will remove the agent and associated mappings/sessions."
        onConfirm={handleDeleteAgent}
        loading={deleting}
      />
    </div>
  );
}

export default AdminPanel;
