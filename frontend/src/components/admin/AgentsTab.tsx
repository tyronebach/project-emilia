import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { Agent } from '../../utils/api';

type EditableField = 'display_name' | 'voice_id' | 'vrm_model' | 'workspace';
type AgentEditableField = EditableField | 'chat_mode' | 'direct_model' | 'direct_api_base';

type AgentWithWorkspace = Agent & {
  workspace: string | null;
  created_at: number;
};

type OptionItem = {
  id: string;
  name: string;
};

interface FieldProps {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
  tooltip?: string;
}

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

interface AgentsTabProps {
  loadingAgents: boolean;
  agents: AgentWithWorkspace[];
  savingAgentId: string | null;
  voicesLoading: boolean;
  voiceOptions: OptionItem[];
  vrmLoading: boolean;
  vrmOptions: OptionItem[];
  onOpenCreateAgent: () => void;
  onFieldChange: (agentId: string, field: AgentEditableField, value: string) => void;
  onVoiceChange: (agent: AgentWithWorkspace, value: string) => Promise<void> | void;
  onReset: (agentId: string) => void;
  onSave: (agent: AgentWithWorkspace) => Promise<void> | void;
  onDeleteAgent: (agentId: string) => void;
  hasChanges: (agent: AgentWithWorkspace) => boolean;
}

function AgentsTab({
  loadingAgents,
  agents,
  savingAgentId,
  voicesLoading,
  voiceOptions,
  vrmLoading,
  vrmOptions,
  onOpenCreateAgent,
  onFieldChange,
  onVoiceChange,
  onReset,
  onSave,
  onDeleteAgent,
  hasChanges,
}: AgentsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Agents</h2>
          <p className="text-sm text-text-secondary">Create, update, or remove agents.</p>
        </div>
        <Button onClick={onOpenCreateAgent} className="gap-2">
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
                    onChange={(v) => onFieldChange(agent.id, 'display_name', v)}
                    placeholder="Agent display name"
                    tooltip="Human-friendly agent name shown in the UI."
                  />
                  <div>
                    <label className="block text-xs text-text-secondary mb-1" title="ElevenLabs voice ID override for this agent.">
                      Voice (ElevenLabs)
                    </label>
                    <select
                      value={agent.voice_id || ''}
                      onChange={(e) => onVoiceChange(agent, e.target.value)}
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
                      onChange={(e) => onFieldChange(agent.id, 'vrm_model', e.target.value)}
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
                    onChange={(v) => onFieldChange(agent.id, 'workspace', v)}
                    placeholder="/home/user/agent-workspace"
                    mono
                    tooltip="Filesystem path used by tools/memory for this agent."
                  />
                  <div>
                    <label className="block text-xs text-text-secondary mb-1" title="Choose which backend handles chat for this agent.">
                      Chat Mode
                    </label>
                    <select
                      value={agent.chat_mode || 'openclaw'}
                      onChange={(e) => onFieldChange(agent.id, 'chat_mode', e.target.value)}
                      disabled={savingAgentId === agent.id}
                      title="OpenClaw uses agent:{id}; Direct uses OpenAI-compatible endpoint."
                      className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    >
                      <option value="openclaw">OpenClaw</option>
                      <option value="direct">Direct</option>
                    </select>
                  </div>
                  <Field
                    label="Direct Model"
                    value={agent.direct_model || ''}
                    onChange={(v) => onFieldChange(agent.id, 'direct_model', v)}
                    placeholder="gpt-4.1-mini"
                    tooltip="Optional model override when chat mode is Direct (use provider model ID)."
                  />
                  <Field
                    label="Direct API Base"
                    value={agent.direct_api_base || ''}
                    onChange={(v) => onFieldChange(agent.id, 'direct_api_base', v)}
                    placeholder="https://api.openai.com/v1"
                    tooltip="Optional base URL override for OpenAI-compatible providers."
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
                      onClick={() => onDeleteAgent(agent.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                    {changed && (
                      <Button
                        onClick={() => onReset(agent.id)}
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                    )}
                    <Button
                      onClick={() => onSave(agent)}
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
  );
}

export default AgentsTab;
