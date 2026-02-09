import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { updateAgent } from '../../utils/designerApi';
import SliderField from './SliderField';
import KeyValueEditor from './KeyValueEditor';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import type { DesignerAgent } from '../../types/designer';

interface AgentCardProps {
  agent: DesignerAgent;
  onDelete: (id: string) => void;
  deleting: boolean;
}

function AgentCard({ agent, onDelete, deleting }: AgentCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState<DesignerAgent>(agent);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMut = useMutation({
    mutationFn: (updates: Partial<DesignerAgent>) => updateAgent(agent.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer', 'agents'] });
    },
  });

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(agent);

  const handleSave = () => {
    updateMut.mutate({
      name: draft.name,
      description: draft.description,
      baseline_valence: draft.baseline_valence,
      baseline_arousal: draft.baseline_arousal,
      baseline_dominance: draft.baseline_dominance,
      volatility: draft.volatility,
      recovery: draft.recovery,
      mood_decay_rate: draft.mood_decay_rate,
      mood_baseline: draft.mood_baseline,
      decay_rates: draft.decay_rates,
      trigger_multipliers: draft.trigger_multipliers,
      trust_gain_multiplier: draft.trust_gain_multiplier,
      trust_loss_multiplier: draft.trust_loss_multiplier,
    });
  };

  const handleReset = () => setDraft(agent);

  const patch = (updates: Partial<DesignerAgent>) => setDraft({ ...draft, ...updates });

  return (
    <>
      <div
        className={`bg-bg-secondary/70 border rounded-2xl ${hasChanges ? 'border-accent/50' : 'border-white/10'} shadow-[0_20px_40px_-30px_rgba(0,0,0,0.6)]`}
      >
        {/* Header */}
        <button
          className="w-full flex items-center justify-between text-left p-5"
          onClick={() => setExpanded(!expanded)}
        >
          <div>
            <h3 className="font-display text-lg">{agent.name}</h3>
            <span className="text-xs text-text-secondary font-mono">{agent.id}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-5">
            <div className="border-t border-white/10 pt-4" />

            {/* Basic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  className="w-full bg-bg-tertiary border border-bg-tertiary rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Emotional Baseline */}
            <div>
              <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Emotional Baseline</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SliderField label="Valence" value={draft.baseline_valence} onChange={(v) => patch({ baseline_valence: v })} min={-1} max={1} />
                <SliderField label="Arousal" value={draft.baseline_arousal} onChange={(v) => patch({ baseline_arousal: v })} min={-1} max={1} />
                <SliderField label="Dominance" value={draft.baseline_dominance} onChange={(v) => patch({ baseline_dominance: v })} min={-1} max={1} />
                <SliderField label="Volatility" value={draft.volatility} onChange={(v) => patch({ volatility: v })} min={0} max={3} step={0.1} />
                <SliderField label="Recovery" value={draft.recovery} onChange={(v) => patch({ recovery: v })} />
                <SliderField label="Mood Decay Rate" value={draft.mood_decay_rate} onChange={(v) => patch({ mood_decay_rate: v })} />
              </div>
            </div>

            {/* Mood Baseline */}
            <KeyValueEditor
              label="Mood Baseline"
              data={draft.mood_baseline}
              onChange={(mood_baseline) => patch({ mood_baseline })}
              keyPlaceholder="mood id"
            />

            {/* Advanced (collapsed) */}
            <div>
              <button
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                Advanced
              </button>
              {advancedOpen && (
                <div className="mt-3 space-y-4">
                  <KeyValueEditor
                    label="Decay Rates"
                    data={draft.decay_rates}
                    onChange={(decay_rates) => patch({ decay_rates })}
                    keyPlaceholder="dimension"
                  />
                  <KeyValueEditor
                    label="Trigger Multipliers"
                    data={draft.trigger_multipliers}
                    onChange={(trigger_multipliers) => patch({ trigger_multipliers })}
                    keyPlaceholder="trigger"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <SliderField label="Trust Gain Multiplier" value={draft.trust_gain_multiplier} onChange={(v) => patch({ trust_gain_multiplier: v })} min={0} max={3} step={0.1} />
                    <SliderField label="Trust Loss Multiplier" value={draft.trust_loss_multiplier} onChange={(v) => patch({ trust_loss_multiplier: v })} min={0} max={3} step={0.1} />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-bg-tertiary">
              <Button
                variant="ghost"
                size="xs"
                className="text-error hover:text-error"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </Button>
              <div className="flex gap-2">
                {hasChanges && (
                  <span className="text-xs text-accent self-center mr-2">Unsaved changes</span>
                )}
                {hasChanges && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || updateMut.isPending}
                >
                  <Save className="w-4 h-4" />
                  {updateMut.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete agent "${agent.name}"?`}
        description="This will permanently remove this agent and all its emotional profile data."
        onConfirm={() => {
          onDelete(agent.id);
          setConfirmDelete(false);
        }}
        loading={deleting}
      />
    </>
  );
}

export default AgentCard;
