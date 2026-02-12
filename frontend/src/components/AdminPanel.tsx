import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  Bot,
  Bug,
  CheckCircle,
  Gamepad2,
  Link,
  Palette,
  Sliders,
  Users,
} from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import DeleteConfirmDialog from './designer/DeleteConfirmDialog';
import AgentsTab from './admin/AgentsTab';
import GamesTab from './admin/GamesTab';
import SessionsTab from './admin/SessionsTab';
import UsersTab from './admin/UsersTab';
import {
  addUserAgent,
  createAgent,
  createUser,
  deleteAgent,
  deleteAgentGameConfig,
  deleteUser,
  fetchUserAgents,
  fetchUsers,
  fetchWithAuth,
  fetchManageGames,
  fetchAgentGames,
  createManageGame,
  deactivateManageGame,
  updateAgentGameConfig,
  updateManageGame,
  removeUserAgent,
  updateUser,
  type Agent,
  type ManageGame,
  type ManageAgentGame,
  type User,
} from '../utils/api';
import { queryClient } from '../lib/queryClient';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { useVrmOptions } from '../hooks/useVrmOptions';
import AppTopNav from './AppTopNav';

type EditableField =
  | 'display_name'
  | 'voice_id'
  | 'vrm_model'
  | 'workspace'
  | 'chat_mode'
  | 'direct_model'
  | 'direct_api_base';

type AgentWithWorkspace = Agent & {
  workspace: string | null;
  created_at: number;
  chat_mode: 'openclaw' | 'direct';
  direct_model: string | null;
  direct_api_base: string | null;
};

type GameFormState = {
  id: string;
  display_name: string;
  category: 'board' | 'card' | 'word' | 'creative';
  description: string;
  module_key: string;
  active: boolean;
  move_provider_default: 'llm' | 'engine' | 'random';
  rule_mode: 'strict' | 'narrative' | 'spectator';
  prompt_instructions: string;
  version: string;
};

type TabKey = 'users' | 'agents' | 'mappings' | 'games';

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
    chat_mode: 'openclaw' as 'openclaw' | 'direct',
    direct_model: '',
    direct_api_base: '',
  });
  const [agentSaving, setAgentSaving] = useState(false);

  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [userAgentIds, setUserAgentIds] = useState<Set<string>>(new Set());
  const [mappingBusy, setMappingBusy] = useState<Set<string>>(new Set());

  const [games, setGames] = useState<ManageGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [selectedAgentForGames, setSelectedAgentForGames] = useState('');
  const [agentGames, setAgentGames] = useState<ManageAgentGame[]>([]);
  const [loadingAgentGames, setLoadingAgentGames] = useState(false);
  const [agentGameBusy, setAgentGameBusy] = useState<Set<string>>(new Set());
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [gameModalMode, setGameModalMode] = useState<'create' | 'edit'>('create');
  const [gameSaving, setGameSaving] = useState(false);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [gameForm, setGameForm] = useState<GameFormState>({
    id: '',
    display_name: '',
    category: 'board',
    description: '',
    module_key: '',
    active: true,
    move_provider_default: 'llm',
    rule_mode: 'strict',
    prompt_instructions: '',
    version: '1',
  });

  useEffect(() => {
    void refreshUsers();
    void refreshAgents();
    void refreshGames();
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserAgentIds(new Set());
      return;
    }
    void refreshUserAgents(selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    if (!agents.length) {
      setSelectedAgentForGames('');
      setAgentGames([]);
      return;
    }

    setSelectedAgentForGames((prev) => (prev && agents.some((a) => a.id === prev) ? prev : agents[0].id));
  }, [agents]);

  useEffect(() => {
    if (!selectedAgentForGames) {
      setAgentGames([]);
      return;
    }
    void refreshAgentGames(selectedAgentForGames);
  }, [selectedAgentForGames]);

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
        chat_mode: agent.chat_mode === 'direct' ? 'direct' : 'openclaw',
        direct_model: agent.direct_model ?? null,
        direct_api_base: agent.direct_api_base ?? null,
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

  const refreshGames = async () => {
    setLoadingGames(true);
    try {
      const gameList = await fetchManageGames();
      setGames(gameList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoadingGames(false);
    }
  };

  const refreshAgentGames = async (agentId: string) => {
    setLoadingAgentGames(true);
    try {
      const items = await fetchAgentGames(agentId);
      setAgentGames(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent game config');
    } finally {
      setLoadingAgentGames(false);
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
      agent.workspace !== original.workspace ||
      agent.chat_mode !== original.chat_mode ||
      agent.direct_model !== original.direct_model ||
      agent.direct_api_base !== original.direct_api_base
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
          chat_mode: agent.chat_mode,
          direct_model: agent.direct_model?.trim() || null,
          direct_api_base: agent.direct_api_base?.trim() || null,
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
      chat_mode: 'openclaw',
      direct_model: '',
      direct_api_base: '',
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
        chat_mode: agentForm.chat_mode,
        direct_model: agentForm.direct_model.trim() || null,
        direct_api_base: agentForm.direct_api_base.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'personalities'] });
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
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'personalities'] });
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

  const resetGameForm = () => {
    setGameForm({
      id: '',
      display_name: '',
      category: 'board',
      description: '',
      module_key: '',
      active: true,
      move_provider_default: 'llm',
      rule_mode: 'strict',
      prompt_instructions: '',
      version: '1',
    });
  };

  const openCreateGame = () => {
    setGameModalMode('create');
    resetGameForm();
    setGameModalOpen(true);
  };

  const openEditGame = (game: ManageGame) => {
    setGameModalMode('edit');
    setGameForm({
      id: game.id,
      display_name: game.display_name,
      category: game.category as 'board' | 'card' | 'word' | 'creative',
      description: game.description,
      module_key: game.module_key,
      active: Boolean(game.active),
      move_provider_default: game.move_provider_default as 'llm' | 'engine' | 'random',
      rule_mode: game.rule_mode as 'strict' | 'narrative' | 'spectator',
      prompt_instructions: game.prompt_instructions ?? '',
      version: game.version,
    });
    setGameModalOpen(true);
  };

  const handleGameSave = async () => {
    const payload = {
      display_name: gameForm.display_name.trim(),
      category: gameForm.category,
      description: gameForm.description.trim(),
      module_key: gameForm.module_key.trim(),
      active: gameForm.active,
      move_provider_default: gameForm.move_provider_default,
      rule_mode: gameForm.rule_mode,
      prompt_instructions: gameForm.prompt_instructions.trim() || null,
      version: gameForm.version.trim(),
    };

    if (
      !gameForm.id.trim() ||
      !payload.display_name ||
      !payload.description ||
      !payload.module_key ||
      !payload.version
    ) {
      setError('Game ID, display name, description, module key, and version are required.');
      return;
    }

    setGameSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (gameModalMode === 'create') {
        await createManageGame({
          id: gameForm.id.trim(),
          ...payload,
        });
        setSuccess(`Created game ${payload.display_name}`);
      } else {
        await updateManageGame(gameForm.id, payload);
        setSuccess(`Updated game ${payload.display_name}`);
      }

      setGameModalOpen(false);
      await refreshGames();
      if (selectedAgentForGames) {
        await refreshAgentGames(selectedAgentForGames);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game');
    } finally {
      setGameSaving(false);
    }
  };

  const handleDeactivateGame = async () => {
    if (!deleteGameId) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deactivateManageGame(deleteGameId);
      setSuccess('Game deactivated');
      setDeleteGameId(null);
      await refreshGames();
      if (selectedAgentForGames) {
        await refreshAgentGames(selectedAgentForGames);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate game');
    } finally {
      setDeleting(false);
    }
  };

  const setAgentGameEnabled = async (gameId: string, enabled: boolean) => {
    if (!selectedAgentForGames) return;
    setAgentGameBusy((prev) => new Set([...prev, gameId]));
    setError(null);
    setSuccess(null);
    try {
      await updateAgentGameConfig(selectedAgentForGames, gameId, { enabled });
      await refreshAgentGames(selectedAgentForGames);
      setSuccess(enabled ? 'Game enabled for agent' : 'Game disabled for agent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent game');
    } finally {
      setAgentGameBusy((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  };

  const clearAgentGameOverride = async (gameId: string) => {
    if (!selectedAgentForGames) return;
    setAgentGameBusy((prev) => new Set([...prev, gameId]));
    setError(null);
    setSuccess(null);
    try {
      await deleteAgentGameConfig(selectedAgentForGames, gameId);
      await refreshAgentGames(selectedAgentForGames);
      setSuccess('Agent game override removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear override');
    } finally {
      setAgentGameBusy((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  };

  const tabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'mappings', label: 'Mappings', icon: Link },
    { id: 'games', label: 'Games', icon: Gamepad2 },
  ] as const;

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;
  const deleteUserTarget = deleteUserId ? users.find((user) => user.id === deleteUserId) : null;
  const deleteAgentTarget = deleteAgentId ? agentById.get(deleteAgentId) : null;
  const deleteGameTarget = deleteGameId ? games.find((game) => game.id === deleteGameId) : null;

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
          <UsersTab
            loadingUsers={loadingUsers}
            users={users}
            onOpenCreateUser={openCreateUser}
            onOpenEditUser={openEditUser}
            onDeleteUser={(userId) => setDeleteUserId(userId)}
          />
        )}

        {activeTab === 'agents' && (
          <AgentsTab
            loadingAgents={loadingAgents}
            agents={agents}
            savingAgentId={savingAgentId}
            voicesLoading={voicesLoading}
            voiceOptions={voiceOptions}
            vrmLoading={vrmLoading}
            vrmOptions={vrmOptions}
            onOpenCreateAgent={openCreateAgent}
            onFieldChange={handleFieldChange}
            onVoiceChange={handleVoiceChange}
            onReset={handleReset}
            onSave={handleSave}
            onDeleteAgent={(agentId) => setDeleteAgentId(agentId)}
            hasChanges={hasChanges}
          />
        )}

        {activeTab === 'mappings' && (
          <SessionsTab
            loadingUsers={loadingUsers}
            users={users}
            selectedUserId={selectedUserId}
            selectedUser={selectedUser}
            loadingMappings={loadingMappings}
            agents={agents}
            userAgentIds={userAgentIds}
            mappingBusy={mappingBusy}
            onSelectUserId={setSelectedUserId}
            onToggleUserAgent={toggleUserAgent}
          />
        )}

        {activeTab === 'games' && (
          <GamesTab
            loadingGames={loadingGames}
            games={games}
            agents={agents}
            selectedAgentForGames={selectedAgentForGames}
            loadingAgentGames={loadingAgentGames}
            agentGames={agentGames}
            agentGameBusy={agentGameBusy}
            onOpenCreateGame={openCreateGame}
            onOpenEditGame={openEditGame}
            onDeactivateGame={(gameId) => setDeleteGameId(gameId)}
            onSelectAgentForGames={setSelectedAgentForGames}
            onSetAgentGameEnabled={setAgentGameEnabled}
            onClearAgentGameOverride={clearAgentGameOverride}
          />
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
            <div>
              <label className="block text-xs text-text-secondary mb-1" title="Choose which backend handles chat for this agent.">
                Chat Mode
              </label>
              <select
                value={agentForm.chat_mode}
                onChange={(e) => setAgentForm(prev => ({ ...prev, chat_mode: e.target.value as 'openclaw' | 'direct' }))}
                title="OpenClaw uses agent:{id}; Direct uses OpenAI-compatible endpoint."
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="openclaw">OpenClaw</option>
                <option value="direct">Direct</option>
              </select>
            </div>
            <Field
              label="Direct Model"
              value={agentForm.direct_model}
              onChange={(v) => setAgentForm(prev => ({ ...prev, direct_model: v }))}
              placeholder="gpt-4.1-mini"
              tooltip="Optional model override when chat mode is Direct (use provider model ID)."
            />
            <Field
              label="Direct API Base"
              value={agentForm.direct_api_base}
              onChange={(v) => setAgentForm(prev => ({ ...prev, direct_api_base: v }))}
              placeholder="https://api.openai.com/v1"
              tooltip="Optional base URL override for OpenAI-compatible providers."
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

      <Dialog open={gameModalOpen} onOpenChange={(open) => !open && setGameModalOpen(false)}>
        <DialogContent className="w-[min(96vw,640px)] p-5">
          <DialogTitle className="font-display text-lg">
            {gameModalMode === 'create' ? 'Add Game' : 'Edit Game'}
          </DialogTitle>
          <DialogDescription className="sr-only">Manage game registry entries.</DialogDescription>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Game ID"
              value={gameForm.id}
              onChange={(v) => setGameForm((prev) => ({ ...prev, id: v }))}
              placeholder="tic-tac-toe"
              mono
              readOnly={gameModalMode === 'edit'}
            />
            <Field
              label="Display Name"
              value={gameForm.display_name}
              onChange={(v) => setGameForm((prev) => ({ ...prev, display_name: v }))}
              placeholder="Tic Tac Toe"
            />

            <div>
              <label className="block text-xs text-text-secondary mb-1">Category</label>
              <select
                value={gameForm.category}
                onChange={(e) => setGameForm((prev) => ({ ...prev, category: e.target.value as GameFormState['category'] }))}
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="board">Board</option>
                <option value="card">Card</option>
                <option value="word">Word</option>
                <option value="creative">Creative</option>
              </select>
            </div>

            <Field
              label="Module Key"
              value={gameForm.module_key}
              onChange={(v) => setGameForm((prev) => ({ ...prev, module_key: v }))}
              placeholder="tic-tac-toe"
              mono
            />

            <div>
              <label className="block text-xs text-text-secondary mb-1">Move Provider</label>
              <select
                value={gameForm.move_provider_default}
                onChange={(e) => setGameForm((prev) => ({ ...prev, move_provider_default: e.target.value as GameFormState['move_provider_default'] }))}
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="llm">LLM</option>
                <option value="engine">Engine</option>
                <option value="random">Random</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Rule Mode</label>
              <select
                value={gameForm.rule_mode}
                onChange={(e) => setGameForm((prev) => ({ ...prev, rule_mode: e.target.value as GameFormState['rule_mode'] }))}
                className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                <option value="strict">Strict</option>
                <option value="narrative">Narrative</option>
                <option value="spectator">Spectator</option>
              </select>
            </div>

            <Field
              label="Version"
              value={gameForm.version}
              onChange={(v) => setGameForm((prev) => ({ ...prev, version: v }))}
              placeholder="1"
            />

            <label className="flex items-center gap-2 text-sm text-text-secondary pt-6">
              <input
                type="checkbox"
                checked={gameForm.active}
                onChange={(e) => setGameForm((prev) => ({ ...prev, active: e.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              Active
            </label>
          </div>

          <div className="mt-3">
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <textarea
              value={gameForm.description}
              onChange={(e) => setGameForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="mt-3">
            <label className="block text-xs text-text-secondary mb-1">Prompt Instructions (optional)</label>
            <textarea
              value={gameForm.prompt_instructions}
              onChange={(e) => setGameForm((prev) => ({ ...prev, prompt_instructions: e.target.value }))}
              rows={4}
              className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none font-mono"
              placeholder="Instructions used when this game is active."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setGameModalOpen(false)} disabled={gameSaving}>
              Cancel
            </Button>
            <Button onClick={handleGameSave} disabled={gameSaving}>
              {gameSaving ? 'Saving...' : 'Save Game'}
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

      <DeleteConfirmDialog
        open={Boolean(deleteGameId)}
        onOpenChange={(open) => !open && setDeleteGameId(null)}
        title={deleteGameTarget ? `Deactivate ${deleteGameTarget.display_name}?` : 'Deactivate game?'}
        description="This keeps existing records but removes the game from active catalogs."
        onConfirm={handleDeactivateGame}
        loading={deleting}
      />
    </div>
  );
}

export default AdminPanel;
