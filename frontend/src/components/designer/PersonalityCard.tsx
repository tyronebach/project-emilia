import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, ChevronDown, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { updatePersonality, resetMoodState } from '../../utils/designerApiV2';
import SliderField from './SliderField';
import KeyValueEditor from './KeyValueEditor';
import TriggerResponseEditor from './TriggerResponseEditor';
import MoodBaselineEditor from './MoodBaselineEditor';
import { HelpDot } from './Tooltip';
import type { AgentPersonality } from '../../types/designer';

interface PersonalityCardProps {
  personality: AgentPersonality;
}

function PersonalityCard({ personality }: PersonalityCardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [essenceOpen, setEssenceOpen] = useState(false);
  const [draft, setDraft] = useState<AgentPersonality>(personality);

  const updateMut = useMutation({
    mutationFn: (updates: Partial<AgentPersonality>) => updatePersonality(personality.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'personalities'] });
    },
  });

  const resetMoodMut = useMutation({
    mutationFn: () => resetMoodState(personality.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'bonds'] });
    },
  });

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(personality);

  const handleSave = () => {
    updateMut.mutate({
      name: draft.name,
      description: draft.description,
      baseline_valence: draft.baseline_valence,
      baseline_arousal: draft.baseline_arousal,
      baseline_dominance: draft.baseline_dominance,
      volatility: draft.volatility,
      recovery_rate: draft.recovery_rate,
      mood_decay_rate: draft.mood_decay_rate,
      mood_baseline: draft.mood_baseline,
      trust_gain_rate: draft.trust_gain_rate,
      trust_loss_rate: draft.trust_loss_rate,
      trigger_sensitivities: draft.trigger_sensitivities,
      trigger_responses: draft.trigger_responses,
      essence_floors: draft.essence_floors,
      essence_ceilings: draft.essence_ceilings,
    });
  };

  const handleApplyBaselineNow = async () => {
    try {
      if (hasChanges) {
        await updateMut.mutateAsync({
          name: draft.name,
          description: draft.description,
          baseline_valence: draft.baseline_valence,
          baseline_arousal: draft.baseline_arousal,
          baseline_dominance: draft.baseline_dominance,
          volatility: draft.volatility,
          recovery_rate: draft.recovery_rate,
          mood_decay_rate: draft.mood_decay_rate,
          mood_baseline: draft.mood_baseline,
          trust_gain_rate: draft.trust_gain_rate,
          trust_loss_rate: draft.trust_loss_rate,
          trigger_sensitivities: draft.trigger_sensitivities,
          trigger_responses: draft.trigger_responses,
          essence_floors: draft.essence_floors,
          essence_ceilings: draft.essence_ceilings,
        });
      }
      await resetMoodMut.mutateAsync();
    } catch {
      // Errors are surfaced via mutation state.
    }
  };

  const handleReset = () => setDraft(personality);

  const patch = (updates: Partial<AgentPersonality>) => setDraft({ ...draft, ...updates });

  return (
    <div
      className={`bg-bg-secondary/70 border rounded-2xl ${hasChanges ? 'border-accent/50' : 'border-white/10'} shadow-[0_20px_40px_-30px_rgba(0,0,0,0.6)]`}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between text-left p-5"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="font-display text-lg">{personality.name}</h3>
          <span className="text-xs text-text-secondary font-mono">{personality.id}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          <div className="border-t border-white/10 pt-4" />

          {/* Basic Info */}
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
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
              Emotional Baseline
              <HelpDot tip="The agent's resting emotional state — where they naturally return to after interactions." />
            </h4>
            <p className="text-[11px] text-text-secondary/70 mb-3">The default mood when nothing is happening.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SliderField label="Valence" value={draft.baseline_valence} onChange={(v) => patch({ baseline_valence: v })} min={-1} max={1} tooltip="Positive = cheerful by default, Negative = melancholic by default" />
              <SliderField label="Arousal" value={draft.baseline_arousal} onChange={(v) => patch({ baseline_arousal: v })} min={-1} max={1} tooltip="High = energetic and alert, Low = calm and relaxed" />
              <SliderField label="Dominance" value={draft.baseline_dominance} onChange={(v) => patch({ baseline_dominance: v })} min={-1} max={1} tooltip="High = assertive and confident, Low = submissive and yielding" />
            </div>
          </div>

          {/* Emotional Dynamics */}
          <div>
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
              Emotional Dynamics
              <HelpDot tip="How quickly the agent reacts to events and how fast they return to baseline." />
            </h4>
            <p className="text-[11px] text-text-secondary/70 mb-3">Controls emotional reactivity and recovery speed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SliderField label="Volatility" value={draft.volatility} onChange={(v) => patch({ volatility: v })} min={0} max={3} step={0.1} tooltip="How strongly the agent reacts to triggers. Higher = dramatic mood swings, Lower = steady temperament." />
              <SliderField label="VAD Recovery Rate" value={draft.recovery_rate} onChange={(v) => patch({ recovery_rate: v })} min={0} max={1} tooltip="How quickly V/A/D fades back to baseline. Higher = bounces back fast, Lower = holds onto feelings." />
              <SliderField label="Mood Decay Rate" value={draft.mood_decay_rate} onChange={(v) => patch({ mood_decay_rate: v })} min={0} max={1} tooltip="How fast named mood weights (supportive, melancholic, etc.) fade back to baseline over time. Higher = moods are fleeting, Lower = moods linger." />
            </div>
          </div>

          {/* Trust Dynamics */}
          <div>
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
              Trust Dynamics
              <HelpDot tip="How easily the agent builds or loses trust. Trust affects how the agent interprets ambiguous messages." />
            </h4>
            <p className="text-[11px] text-text-secondary/70 mb-3">Higher rates mean trust changes faster in that direction.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SliderField label="Trust Gain Rate" value={draft.trust_gain_rate} onChange={(v) => patch({ trust_gain_rate: v })} min={0} max={3} step={0.1} tooltip="How quickly trust builds from positive interactions. Higher = quickly warms up, Lower = slow to trust." />
              <SliderField label="Trust Loss Rate" value={draft.trust_loss_rate} onChange={(v) => patch({ trust_loss_rate: v })} min={0} max={3} step={0.1} tooltip="How quickly trust drops from negative interactions. Higher = easily hurt, Lower = forgiving." />
            </div>
          </div>

          {/* Mood Baseline (collapsible) */}
          <div>
            <button
              className="flex items-center gap-1 text-xs font-medium text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
              onClick={() => setMoodOpen(!moodOpen)}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${moodOpen ? 'rotate-180' : ''}`} />
              Mood Baseline
              <HelpDot tip="The default weight for each mood when no interactions have occurred. Higher values make the agent naturally lean toward that mood." />
            </button>
            <p className="text-[11px] text-text-secondary/70 mb-3">Starting mood disposition — which moods the agent naturally gravitates toward.</p>
            {moodOpen && (
              <>
                <MoodBaselineEditor
                  moodBaseline={draft.mood_baseline}
                  onChange={(mood_baseline) => patch({ mood_baseline })}
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="text-xs gap-1 bg-warning/20 text-warning hover:bg-warning/30 border border-warning/30"
                    onClick={handleApplyBaselineNow}
                    disabled={resetMoodMut.isPending || updateMut.isPending}
                  >
                    <Zap className="w-3 h-3" />
                    {resetMoodMut.isPending || updateMut.isPending ? 'Applying...' : 'Apply Baseline Now'}
                  </Button>
                  <span className={`text-[10px] ${resetMoodMut.isSuccess ? 'text-success' : resetMoodMut.isError ? 'text-error' : 'text-text-secondary'}`}>
                    {resetMoodMut.isSuccess ? 'Done — mood state reset to baseline' : resetMoodMut.isError ? 'Failed to reset' : 'Resets your live mood weights + VAD to this baseline'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Trigger Response Profiles */}
          <div>
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
              Trigger Responses
              <HelpDot tip="How the agent emotionally reacts to different conversation triggers. Pick a preset for each trigger, or use Custom for per-axis control." />
            </h4>
            <p className="text-[11px] text-text-secondary/70 mb-3">Each trigger can have a different emotional direction — from threatening to intense. Use presets or fine-tune per axis.</p>
            <TriggerResponseEditor
              responses={draft.trigger_responses ?? {}}
              onChange={(trigger_responses) => patch({ trigger_responses })}
            />
          </div>

          {/* Essence Traits (collapsible) */}
          <div>
            <button
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              onClick={() => setEssenceOpen(!essenceOpen)}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${essenceOpen ? 'rotate-180' : ''}`} />
              Essence Traits
              <HelpDot tip="Hard limits on emotional dimensions. Floors prevent values from dropping too low, ceilings prevent them from going too high — preserving the agent's core identity." />
            </button>
            {essenceOpen && (
              <div className="mt-3 space-y-4">
                <KeyValueEditor
                  label="Essence Floors"
                  data={draft.essence_floors}
                  onChange={(essence_floors) => patch({ essence_floors })}
                  keyPlaceholder="dimension"
                />
                <KeyValueEditor
                  label="Essence Ceilings"
                  data={draft.essence_ceilings}
                  onChange={(essence_ceilings) => patch({ essence_ceilings })}
                  keyPlaceholder="dimension"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end pt-3 border-t border-bg-tertiary">
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
  );
}

export default PersonalityCard;
