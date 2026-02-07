import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Save, AlertCircle, CheckCircle, RotateCcw, Bug, Sliders } from 'lucide-react';
import { Button } from './ui/button';
import { fetchWithAuth, type Agent } from '../utils/api';
import { useVoiceOptions } from '../hooks/useVoiceOptions';
import { useVrmOptions } from '../hooks/useVrmOptions';
import AppTopNav from './AppTopNav';

type EditableField = 'display_name' | 'voice_id' | 'vrm_model' | 'workspace';

interface AgentWithWorkspace extends Agent {
  workspace: string;
  created_at: number;
}

type FieldProps = {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
  readOnly = false
}: FieldProps) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none ${mono ? 'font-mono text-xs' : ''} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}

function AdminPanel() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentWithWorkspace[]>([]);
  const [originalAgents, setOriginalAgents] = useState<AgentWithWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { voices: voiceOptions, loading: voicesLoading } = useVoiceOptions();
  const { models: vrmOptions, loading: vrmLoading } = useVrmOptions();

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

  const handleVoiceChange = async (agent: AgentWithWorkspace, value: string) => {
    const normalized = value.trim();
    const nextVoiceId = normalized ? normalized : null;
    const previousVoiceId = agent.voice_id;

    if (previousVoiceId === nextVoiceId) return;

    setAgents(prev => prev.map(a =>
      a.id === agent.id ? { ...a, voice_id: nextVoiceId } : a
    ));

    setSaving(agent.id);
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
      setSaving(null);
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

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary flex flex-col">
      <AppTopNav
        onBack={() => navigate({ to: '/' })}
        subtitle="Agent Settings"
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
              onClick={() => navigate({ to: '/debug' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Debug Avatar"
            >
              <Bug className="w-5 h-5" />
            </button>
          </>
        )}
      />

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
          <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-lg flex items-center gap-2 text-success text-sm">
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
                  className={`bg-bg-secondary/70 border rounded-2xl p-5 ${changed ? 'border-accent/50' : 'border-white/10'} shadow-[0_20px_40px_-30px_rgba(0,0,0,0.6)]`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                    <div>
                      <h3 className="font-display text-lg">{agent.display_name}</h3>
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
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Voice (ElevenLabs)</label>
                      <select
                        value={agent.voice_id || ''}
                        onChange={(e) => handleVoiceChange(agent, e.target.value)}
                        disabled={saving === agent.id}
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
                      <label className="block text-xs text-text-secondary mb-1">VRM Model</label>
                      <select
                        value={agent.vrm_model || ''}
                        onChange={(e) => handleFieldChange(agent.id, 'vrm_model', e.target.value)}
                        disabled={saving === agent.id}
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
