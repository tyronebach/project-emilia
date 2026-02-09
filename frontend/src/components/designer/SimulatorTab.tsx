import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Send, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { simulate, getPersonalities, getBonds } from '../../utils/designerApiV2';
import TriggerBadge from './TriggerBadge';
import SimulationHistory from './SimulationHistory';
import type { SimulationResult, SimulationTriggerDetail } from '../../types/designer';

const AXIS_SHORT: Record<string, string> = {
  valence: 'Val',
  arousal: 'Aro',
  trust: 'Tru',
  attachment: 'Att',
  intimacy: 'Int',
};

function formatDim(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function AxisDeltaArrows({ deltas }: { deltas?: Record<string, number> }) {
  if (!deltas) return null;
  const entries = Object.entries(deltas).filter(([, v]) => Math.abs(v) >= 0.001);
  if (entries.length === 0) return null;
  return (
    <span className="inline-flex gap-0.5">
      {entries.map(([axis, value]) => {
        const color = value > 0 ? 'text-success' : 'text-error';
        const arrow = value > 0 ? '\u2191' : '\u2193';
        return (
          <span key={axis} className={`text-[9px] font-mono ${color}`} title={`${axis}: ${value > 0 ? '+' : ''}${value.toFixed(3)}`}>
            {arrow}{AXIS_SHORT[axis] ?? axis}
          </span>
        );
      })}
    </span>
  );
}

function DeltaSpan({ value }: { value: number }) {
  if (Math.abs(value) < 0.001) return null;
  const color = value > 0 ? 'text-success' : 'text-error';
  return <span className={`font-mono ${color}`}>({formatDim(value)})</span>;
}

function SimulatorTab() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [history, setHistory] = useState<SimulationResult[]>([]);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['designer-v2', 'personalities'],
    queryFn: getPersonalities,
  });

  const { data: bonds, isLoading: bondsLoading } = useQuery({
    queryKey: ['designer-v2', 'bonds', selectedAgent],
    queryFn: () => getBonds(selectedAgent || undefined),
    enabled: !!selectedAgent,
  });

  const simulateMut = useMutation({
    mutationFn: simulate,
    onSuccess: (data) => {
      setResult(data);
      setHistory((prev) => [data, ...prev]);
    },
  });

  const handleSimulate = () => {
    if (!selectedAgent || !selectedUser || !message.trim()) return;
    simulateMut.mutate({
      agent_id: selectedAgent,
      user_id: selectedUser,
      message: message.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSimulate();
    }
  };

  const changedDimensions = result
    ? Object.keys(result.state_after).filter(
        (k) => Math.abs((result.state_after[k] ?? 0) - (result.state_before[k] ?? 0)) >= 0.001
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-display text-text-primary">Trigger Simulator</h2>
        <p className="text-sm text-text-secondary mt-1">
          Test how a message would affect the agent's emotional state without sending it in a real conversation. See which triggers are detected, how they're modified by personality and calibration, and what state changes would result.
        </p>
      </div>

      {/* Agent + User selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Agent</label>
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value);
              setSelectedUser('');
              setResult(null);
            }}
            disabled={agentsLoading}
            className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Select agent...</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">User</label>
          <select
            value={selectedUser}
            onChange={(e) => {
              setSelectedUser(e.target.value);
              setResult(null);
            }}
            disabled={!selectedAgent || bondsLoading}
            className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">Select user...</option>
            {bonds?.map((b) => (
              <option key={b.user_id} value={b.user_id}>
                {b.user_id} (trust: {(b.trust * 100).toFixed(0)}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Message input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to simulate..."
          disabled={!selectedAgent || !selectedUser}
          className="flex-1 bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
        />
        <Button
          size="sm"
          onClick={handleSimulate}
          disabled={!selectedAgent || !selectedUser || !message.trim() || simulateMut.isPending}
        >
          {simulateMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Simulate
        </Button>
      </div>

      {/* Error */}
      {simulateMut.isError && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {simulateMut.error instanceof Error ? simulateMut.error.message : 'Simulation failed'}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Detected Triggers Table */}
          <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Detected Triggers
              </h4>
            </div>

            {result.detected_triggers.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-secondary">
                No triggers detected
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">Trigger</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary" title="Base intensity detected from the message">Raw</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary" title="Personality-based sensitivity multiplier (set in Personality tab)">DNA Sens</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary" title="Learned multiplier from past interactions (see Calibration tab)">Calibration</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary" title="Final intensity = Raw x DNA Sens x Calibration">Effective</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-secondary" title="Per-axis delta direction">Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.detected_triggers.map((t: SimulationTriggerDetail) => (
                      <tr key={t.trigger} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-2">
                          <TriggerBadge trigger={t.trigger} size="sm" />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-secondary">
                          {t.raw_intensity.toFixed(3)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-secondary">
                          x{t.dna_sensitivity.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-secondary">
                          x{t.calibration_multiplier.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-primary font-medium">
                          {t.effective_intensity.toFixed(3)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <AxisDeltaArrows deltas={t.axis_deltas} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* State Changes */}
          {changedDimensions.length > 0 && (
            <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
              <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
                State Changes
              </h4>
              <div className="space-y-1.5">
                {changedDimensions.map((dim) => {
                  const before = result.state_before[dim] ?? 0;
                  const after = result.state_after[dim] ?? 0;
                  const delta = after - before;
                  return (
                    <div key={dim} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary capitalize">{dim.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-text-primary">
                        {formatDim(before)} → {formatDim(after)}{' '}
                        <DeltaSpan value={delta} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mood Shifts */}
          {Object.keys(result.mood_shifts).length > 0 && (
            <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4">
              <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
                Mood Shifts
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.mood_shifts).map(([mood, delta]) => (
                  <span
                    key={mood}
                    className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-full border ${
                      delta > 0
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-error/10 border-error/30 text-error'
                    }`}
                  >
                    {mood}
                    <span>{formatDim(delta)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Context Block */}
          {result.context_block && (
            <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  LLM Context Block
                </h4>
                <p className="text-[10px] text-text-secondary/60 mt-0.5">This text gets injected into the AI's system prompt to guide its behavior.</p>
              </div>
              <pre className="p-4 text-xs font-mono text-text-secondary whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-y-auto">
                {result.context_block}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Simulation History */}
      {history.length > 0 && (
        <SimulationHistory
          history={history}
          onClear={() => {
            setHistory([]);
            setResult(null);
          }}
        />
      )}
    </div>
  );
}

export default SimulatorTab;
