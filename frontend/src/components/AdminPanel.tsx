import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { fetchWithAuth, type Agent } from '../utils/api';

type EditableField = 'display_name' | 'voice_id' | 'vrm_model' | 'workspace';

interface AgentWithWorkspace extends Agent {
  workspace: string;
  created_at: number;
}

function AdminPanel() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentWithWorkspace[]>([]);
  const [originalAgents, setOriginalAgents] = useState<AgentWithWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await fetchWithAuth('/api/manage/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data = await response.json();
      const agentList = data.agents || [];
      setAgents(agentList);
      setOriginalAgents(JSON.parse(JSON.stringify(agentList)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (agentId: string, field: EditableField, value: string) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, [field]: value } : a
    ));
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
    setSaving(agent.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithAuth(`/api/manage/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          display_name: agent.display_name,
          voice_id: agent.voice_id,
          vrm_model: agent.vrm_model,
          workspace: agent.workspace,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      // Update original to match saved
      setOriginalAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...agent } : a
      ));

      setSuccess(`Saved ${agent.display_name}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    mono = false
  }: {
    label: string;
    value: string | null;
    onChange: (v: string) => void;
    placeholder?: string;
    mono?: boolean;
  }) => (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none ${mono ? 'font-mono text-xs' : ''}`}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Header */}
      <div className="border-b border-bg-tertiary px-4 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-2 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">Agent Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {/* Status messages */}
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {loading ? (
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
                  className={`bg-bg-secondary border rounded-lg p-5 ${changed ? 'border-accent/50' : 'border-bg-tertiary'}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-bg-tertiary">
                    <div>
                      <h3 className="font-semibold text-lg">{agent.display_name}</h3>
                      <span className="text-xs text-text-secondary font-mono">{agent.id}</span>
                    </div>
                    <div className="text-xs text-text-secondary">
                      Clawdbot: <span className="font-mono">{agent.clawdbot_agent_id}</span>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Field
                      label="Display Name"
                      value={agent.display_name}
                      onChange={(v) => handleFieldChange(agent.id, 'display_name', v)}
                      placeholder="Agent display name"
                    />
                    <Field
                      label="Voice ID (ElevenLabs)"
                      value={agent.voice_id}
                      onChange={(v) => handleFieldChange(agent.id, 'voice_id', v)}
                      placeholder="e.g., gNLojYp5VOiuqC8CTCmi"
                      mono
                    />
                    <Field
                      label="VRM Model"
                      value={agent.vrm_model}
                      onChange={(v) => handleFieldChange(agent.id, 'vrm_model', v)}
                      placeholder="e.g., emilia.vrm"
                    />
                    <Field
                      label="Workspace Path"
                      value={agent.workspace}
                      onChange={(v) => handleFieldChange(agent.id, 'workspace', v)}
                      placeholder="/home/user/agent-workspace"
                      mono
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-bg-tertiary">
                    <div className="text-xs text-text-secondary">
                      {changed && <span className="text-accent">Unsaved changes</span>}
                    </div>
                    <div className="flex gap-2">
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
                        disabled={saving === agent.id || !changed}
                        size="sm"
                        className="gap-1"
                      >
                        <Save className="w-4 h-4" />
                        {saving === agent.id ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
