import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';

interface Agent {
  id: string;
  display_name: string;
  voice_id: string;
  vrm_model: string;
}

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

function AdminPanel() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/agents`);
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data = await response.json();
      setAgents(data.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceIdChange = (agentId: string, voiceId: string) => {
    setAgents(prev => prev.map(a => 
      a.id === agentId ? { ...a, voice_id: voiceId } : a
    ));
  };

  const handleSave = async (agent: Agent) => {
    setSaving(agent.id);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch(`${API_URL}/api/admin/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: agent.voice_id }),
      });
      
      if (!response.ok) throw new Error('Failed to save');
      setSuccess(`Saved ${agent.display_name}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

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
        <h1 className="text-lg font-semibold">Admin Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
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

        <h2 className="text-xl font-semibold mb-4">Agent Voice Settings</h2>

        {loading ? (
          <div className="text-center py-8 text-text-secondary">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">No agents found.</div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => (
              <div 
                key={agent.id}
                className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{agent.display_name}</h3>
                  <span className="text-xs text-text-secondary">{agent.id}</span>
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-text-secondary mb-1">Voice ID</label>
                    <input
                      type="text"
                      value={agent.voice_id}
                      onChange={(e) => handleVoiceIdChange(agent.id, e.target.value)}
                      placeholder="e.g., alloy, echo, shimmer"
                      className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                  
                  <div className="flex items-end">
                    <Button
                      onClick={() => handleSave(agent)}
                      disabled={saving === agent.id}
                      size="sm"
                      className="gap-1"
                    >
                      <Save className="w-4 h-4" />
                      {saving === agent.id ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
                
                {agent.vrm_model && (
                  <div className="mt-2 text-xs text-text-secondary">
                    VRM: {agent.vrm_model}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
