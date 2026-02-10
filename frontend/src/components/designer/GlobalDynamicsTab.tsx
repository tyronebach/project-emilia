import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { HelpDot } from './Tooltip';
import {
  getMoodInjectionSettings,
  updateMoodInjectionSettings,
} from '../../utils/designerApiV2';
import type { MoodInjectionSettings } from '../../types/designer';

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  help,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  help: string;
  tooltip: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary mb-1">
        {label}
        <HelpDot tip={tooltip} />
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-bg-tertiary border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <p className="text-[11px] text-text-secondary/70 mt-1">{help}</p>
    </div>
  );
}

function GlobalDynamicsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['designer-v2', 'mood-injection-settings'],
    queryFn: getMoodInjectionSettings,
  });
  const [overrides, setOverrides] = useState<Partial<MoodInjectionSettings>>({});
  const draft = data ? { ...data, ...overrides } : null;

  const saveMutation = useMutation({
    mutationFn: (payload: MoodInjectionSettings) => updateMoodInjectionSettings(payload),
    onSuccess: () => {
      setOverrides({});
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'mood-injection-settings'] });
    },
  });

  const canSave = !!draft && Object.keys(overrides).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display text-text-primary">Global Dynamics</h2>
        <p className="text-sm text-text-secondary mt-1">
          Global knobs for volatility-driven mood injection behavior. These apply to chat and drift simulation.
        </p>
      </div>

      {isLoading && <div className="text-sm text-text-secondary">Loading settings...</div>}

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load settings
        </div>
      )}

      {draft && (
        <div className="bg-bg-secondary/70 border border-white/10 rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput
              label="Top K"
              value={draft.top_k}
              onChange={(v) => setOverrides({ ...overrides, top_k: v })}
              min={1}
              max={6}
              step={1}
              help="Number of top moods considered for volatility-based sampling."
              tooltip="Candidate pool size for mood jumps. Higher values allow more variety in selected injected moods."
            />
            <NumberInput
              label="Volatility Threshold"
              value={draft.volatility_threshold}
              onChange={(v) => setOverrides({ ...overrides, volatility_threshold: v })}
              min={0}
              max={1}
              step={0.01}
              help="Minimum normalized volatility before random mood jumps can happen."
              tooltip="If normalized volatility is below this value, mood injection stays deterministic (top mood first)."
            />
            <NumberInput
              label="Min Margin"
              value={draft.min_margin}
              onChange={(v) => setOverrides({ ...overrides, min_margin: v })}
              min={0}
              max={1}
              step={0.01}
              help="If top mood leads by at least this ratio, selection stays deterministic."
              tooltip="Stability gate. Large lead over runner-up blocks random jumps and keeps the top mood selected."
            />
            <NumberInput
              label="Random Strength"
              value={draft.random_strength}
              onChange={(v) => setOverrides({ ...overrides, random_strength: v })}
              min={0}
              max={2}
              step={0.01}
              help="Base strength for volatility-driven random selection."
              tooltip="Scales how aggressively volatility can cause mood selection jumps among close contenders."
            />
            <NumberInput
              label="Max Random Chance"
              value={draft.max_random_chance}
              onChange={(v) => setOverrides({ ...overrides, max_random_chance: v })}
              min={0}
              max={1}
              step={0.01}
              help="Upper cap on random selection probability."
              tooltip="Hard upper limit for random jump probability even when volatility is high and moods are close."
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => draft && saveMutation.mutate(draft)}
              disabled={!canSave || saveMutation.isPending}
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
            {saveMutation.isSuccess && (
              <span className="text-sm text-success">Saved</span>
            )}
            {saveMutation.isError && (
              <span className="text-sm text-error">Failed to save</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalDynamicsTab;
