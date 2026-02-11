import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Info } from 'lucide-react';
import { TRIGGER_TAXONOMY, TRIGGER_PRESETS, CATEGORY_DESCRIPTIONS, TRIGGER_DESCRIPTIONS } from '../../types/designer';
import type { TriggerCategory, TriggerResponseProfile, MoodGroup } from '../../types/designer';
import { getTriggerDefaults, getMoodGroups } from '../../utils/designerApiV2';
import SliderField from './SliderField';

/**
 * Per-trigger preset descriptions that explain what each preset means
 * in the context of that specific trigger.
 *
 * Keys: `${trigger}.${preset}` — only non-obvious combos need entries.
 * Falls back to a generic description if no specific one exists.
 */
const PRESET_CONTEXT_HINTS: Record<string, string> = {
  // Positive
  'admiration.normal': 'Admiration feels affirming and warm — default',
  'admiration.amplified': 'Admiration lands deeply — stronger trust and bonding',
  'caring.normal': 'Caring feels soothing and safe — default',
  'caring.intense': 'Caring feels deeply supportive — strong calming effect',
  'gratitude.normal': 'Gratitude feels appreciated and relationship-building',
  'love.normal': 'Love feels emotionally close and intimate — default',
  'love.amplified': 'Love feels deeply meaningful — major bond growth',
  'excitement.normal': 'Excitement is energizing and uplifting',
  'relief.normal': 'Relief helps settle tension and rebuild safety',

  // Negative
  'anger.normal': 'Anger is taken as conflict and increases defensiveness',
  'anger.intense': 'Anger is overwhelming — strong trust and mood damage',
  'disapproval.normal': 'Disapproval stings and lowers trust',
  'disgust.normal': 'Disgust feels rejecting and strongly harmful',
  'fear.normal': 'Fear increases tension and lowers sense of safety',
  'sadness.normal': 'Sadness softens energy and can invite support',

  // Self-conscious
  'embarrassment.normal': 'Embarrassment feels vulnerable but potentially bonding',
  'nervousness.normal': 'Nervousness signals tentative vulnerability',
  'remorse.normal': 'Remorse helps repair by taking responsibility',

  // Neutral / cognitive
  'curiosity.normal': 'Curiosity is engaging and mildly connective',
  'confusion.normal': 'Confusion indicates uncertainty and need for clarity',
  'surprise.normal': 'Surprise spikes activation and unpredictability',
  'realization.normal': 'Realization marks a shift in understanding',

  // Intimate
  'desire.normal': 'Desire increases closeness, attraction, and intimacy',
  'desire.intense': 'Desire strongly amplifies intimate/attachment dynamics',
};

const PRESET_COLORS: Record<string, string> = {
  threatening: 'text-red-400',
  uncomfortable: 'text-orange-400',
  neutral: 'text-text-secondary',
  muted: 'text-yellow-400',
  normal: 'text-text-secondary',
  amplified: 'text-blue-400',
  intense: 'text-purple-400',
  custom: 'text-accent',
};

const AXIS_LABELS: Record<string, string> = {
  valence: 'Val',
  arousal: 'Aro',
  trust: 'Tru',
  attachment: 'Att',
  intimacy: 'Int',
};

const AXIS_FULL_LABELS: Record<string, string> = {
  valence: 'Valence',
  arousal: 'Arousal',
  trust: 'Trust',
  attachment: 'Attachment',
  intimacy: 'Intimacy',
};

function getPresetForResponse(
  response: TriggerResponseProfile | undefined,
  defaults: Record<string, number> | undefined,
): string {
  if (!response) return 'normal';
  if (response.preset) return response.preset;
  if (!defaults) return 'custom';

  // Try to reverse-detect a preset from axis values
  const defaultAxes = Object.keys(defaults);
  if (defaultAxes.length === 0) return 'normal';

  for (const preset of TRIGGER_PRESETS) {
    const match = defaultAxes.every((axis) => {
      const expected = (defaults[axis] ?? 0) * preset.multiplier;
      const actual = (response as Record<string, number | string | undefined>)[axis];
      return typeof actual === 'number' && Math.abs(actual - expected) < 0.005;
    });
    if (match) return preset.key;
  }
  return 'custom';
}

function getPresetHint(trigger: string, preset: string): string {
  const specific = PRESET_CONTEXT_HINTS[`${trigger}.${preset}`];
  if (specific) return specific;

  // Generic fallback based on preset meaning
  const label = trigger.replace(/_/g, ' ');
  switch (preset) {
    case 'threatening': return `${label} feels threatening — strong negative emotional reaction`;
    case 'uncomfortable': return `${label} causes mild discomfort`;
    case 'neutral': return `${label} has no emotional effect`;
    case 'muted': return `${label} is barely felt — dampened response`;
    case 'normal': return `Default reaction — no override applied`;
    case 'amplified': return `${label} hits harder than usual — amplified response`;
    case 'intense': return `${label} triggers a very strong emotional reaction`;
    case 'custom': return 'Per-axis values set manually';
    default: return '';
  }
}

function DeltaArrow({ axis, value }: { axis: string; value: number }) {
  if (Math.abs(value) < 0.001) return null;
  const color = value > 0 ? 'text-success' : 'text-error';
  const arrow = value > 0 ? '\u2191' : '\u2193';
  const magnitude = Math.abs(value) > 0.1 ? 'font-bold' : '';
  return (
    <span className={`text-[10px] font-mono ${color} ${magnitude}`} title={`${AXIS_FULL_LABELS[axis] ?? axis}: ${value > 0 ? '+' : ''}${value.toFixed(3)}`}>
      {arrow}{AXIS_LABELS[axis] ?? axis}
    </span>
  );
}

function PresetLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-text-secondary/70 hover:text-text-secondary transition-colors"
      >
        <Info className="w-3 h-3" />
        What do the presets mean?
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-bg-tertiary/50 rounded-lg px-3 py-2 text-[10px] text-text-secondary/80 space-y-0.5">
          <p>Presets scale the default emotional effect of each trigger:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-1 font-mono">
            <span><span className="text-red-400">Threatening</span> = -1.5x (flipped + amplified)</span>
            <span><span className="text-orange-400">Uncomfortable</span> = -0.5x (flipped, mild)</span>
            <span><span className="text-text-secondary">Neutral</span> = 0x (no effect)</span>
            <span><span className="text-yellow-400">Muted</span> = 0.5x (same direction, weaker)</span>
            <span><span className="text-text-secondary">Normal</span> = 1.0x (default, no override)</span>
            <span><span className="text-blue-400">Amplified</span> = 1.5x (same direction, stronger)</span>
            <span><span className="text-purple-400">Intense</span> = 2.0x (same direction, much stronger)</span>
            <span><span className="text-accent">Custom</span> = manual per-axis values</span>
          </div>
          <p className="mt-1">For example, if admiration normally gives <span className="text-success">+valence</span>, setting it to <span className="text-red-400">Threatening</span> flips it to <span className="text-error">-valence</span> at 1.5x strength.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Client-side dot product projection matching backend logic.
 * Returns top affected moods with delta direction.
 */
function computeMoodDrift(
  deltas: Record<string, number>,
  moodGroups: Record<string, MoodGroup>,
): { mood: string; delta: number; color: string }[] {
  const dv = deltas.valence ?? 0;
  const da = deltas.arousal ?? 0;
  if (Math.abs(dv) < 0.001 && Math.abs(da) < 0.001) return [];

  const results: { mood: string; delta: number; color: string }[] = [];
  for (const group of Object.values(moodGroups)) {
    for (const [moodId, info] of Object.entries(group.moods)) {
      const mag = Math.sqrt(info.valence ** 2 + info.arousal ** 2);
      if (mag < 0.001) continue;
      const uv = info.valence / mag;
      const ua = info.arousal / mag;
      const dot = dv * uv + da * ua;
      if (Math.abs(dot) > 0.01) {
        results.push({ mood: moodId, delta: dot, color: group.color });
      }
    }
  }
  results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return results.slice(0, 4);
}

function MoodDriftBadges({ deltas, moodGroups }: {
  deltas: Record<string, number>;
  moodGroups: Record<string, MoodGroup>;
}) {
  const drifts = computeMoodDrift(deltas, moodGroups);
  if (drifts.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
      <span className="text-[9px] text-text-secondary/50">mood drift:</span>
      {drifts.map(({ mood, delta, color }) => (
        <span
          key={mood}
          className="text-[10px] font-mono px-1 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}15` }}
        >
          {mood} {delta > 0 ? '\u2191' : '\u2193'}
        </span>
      ))}
    </div>
  );
}

interface TriggerResponseEditorProps {
  responses: Record<string, TriggerResponseProfile>;
  onChange: (updated: Record<string, TriggerResponseProfile>) => void;
}

function TriggerResponseEditor({ responses, onChange }: TriggerResponseEditorProps) {
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null);

  const { data: triggerDefaults } = useQuery({
    queryKey: ['designer-v2', 'trigger-defaults'],
    queryFn: getTriggerDefaults,
    staleTime: 5 * 60 * 1000,
  });

  const { data: moodGroups } = useQuery({
    queryKey: ['designer-v2', 'mood-groups'],
    queryFn: getMoodGroups,
    staleTime: 5 * 60 * 1000,
  });

  const handlePresetChange = (trigger: string, presetKey: string) => {
    if (presetKey === 'custom') {
      // Switch to custom: keep current values, remove preset marker
      const current = responses[trigger] ?? {};
      onChange({ ...responses, [trigger]: { ...current, preset: 'custom' } });
      setExpandedTrigger(trigger);
      return;
    }

    const defaults = triggerDefaults?.[trigger] ?? {};
    const preset = TRIGGER_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;

    if (presetKey === 'normal') {
      // Remove override entirely (use defaults)
      const next = { ...responses };
      delete next[trigger];
      onChange(next);
      setExpandedTrigger(null);
      return;
    }

    // Compute concrete axis values from preset multiplier
    const computed: TriggerResponseProfile = { preset: presetKey };
    for (const [axis, delta] of Object.entries(defaults)) {
      (computed as Record<string, number | string>)[axis] = (delta as number) * preset.multiplier;
    }

    onChange({ ...responses, [trigger]: computed });
    setExpandedTrigger(null);
  };

  const handleAxisChange = (trigger: string, axis: string, value: number) => {
    const current = responses[trigger] ?? { preset: 'custom' };
    onChange({ ...responses, [trigger]: { ...current, preset: 'custom', [axis]: value } });
  };

  const getEffectiveDeltas = (trigger: string): Record<string, number> => {
    const resp = responses[trigger];
    if (resp) {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(resp)) {
        if (k !== 'preset' && typeof v === 'number') result[k] = v;
      }
      return result;
    }
    return triggerDefaults?.[trigger] ?? {};
  };

  const categories = Object.keys(TRIGGER_TAXONOMY) as TriggerCategory[];
  const seenTriggers = new Set<string>();

  return (
    <div className="space-y-4">
      <PresetLegend />

      {categories.map((category) => {
        const triggers = TRIGGER_TAXONOMY[category].filter((trigger) => {
          if (seenTriggers.has(trigger)) return false;
          seenTriggers.add(trigger);
          return true;
        });
        if (triggers.length === 0) return null;
        return (
          <div key={category}>
            <h5 className="text-xs font-medium text-text-secondary uppercase tracking-wider capitalize">
              {category}
            </h5>
            <p className="text-[10px] text-text-secondary/60 mb-2">{CATEGORY_DESCRIPTIONS[category]}</p>
            <div className="space-y-2 pl-2">
              {triggers.map((trigger) => {
                const defaults = triggerDefaults?.[trigger] ?? {};
                const currentPreset = getPresetForResponse(responses[trigger], defaults);
                const isCustom = currentPreset === 'custom';
                const isExpanded = expandedTrigger === trigger;
                const effectiveDeltas = getEffectiveDeltas(trigger);
                const hint = getPresetHint(trigger, currentPreset);

                return (
                  <div key={trigger} className="bg-bg-tertiary/30 rounded-lg px-3 py-2">
                    {/* Row 1: trigger name + preset + arrows */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Trigger name + description */}
                      <div className="min-w-[120px]">
                        <span className="text-xs text-text-primary capitalize font-medium">
                          {trigger.replace(/_/g, ' ')}
                        </span>
                        <p className="text-[10px] text-text-secondary/60 leading-tight">
                          {TRIGGER_DESCRIPTIONS[trigger] ?? ''}
                        </p>
                      </div>

                      {/* Preset dropdown */}
                      <select
                        value={currentPreset}
                        onChange={(e) => handlePresetChange(trigger, e.target.value)}
                        className={`bg-bg-tertiary border border-white/10 rounded px-2 py-0.5 text-xs focus:border-accent focus:outline-none ${PRESET_COLORS[currentPreset] ?? 'text-text-secondary'}`}
                      >
                        {TRIGGER_PRESETS.map((p) => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                        <option value="custom">Custom</option>
                      </select>

                      {/* Direction arrows */}
                      <div className="flex items-center gap-1 ml-auto">
                        {Object.entries(effectiveDeltas).map(([axis, value]) => (
                          <DeltaArrow key={axis} axis={axis} value={value} />
                        ))}
                      </div>

                      {/* Expand button for custom */}
                      {(isCustom || isExpanded) && (
                        <button
                          onClick={() => setExpandedTrigger(isExpanded ? null : trigger)}
                          className="text-text-secondary hover:text-text-primary"
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* Row 2: contextual hint for the selected preset */}
                    {currentPreset !== 'normal' && hint && (
                      <p className={`text-[10px] mt-1 ${PRESET_COLORS[currentPreset] ?? 'text-text-secondary/70'}`}>
                        {hint}
                      </p>
                    )}

                    {/* Row 3: mood drift preview */}
                    {currentPreset !== 'normal' && moodGroups && (
                      <MoodDriftBadges deltas={effectiveDeltas} moodGroups={moodGroups} />
                    )}

                    {/* Custom axis sliders */}
                    {isExpanded && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-white/5 pt-3">
                        {Object.keys(AXIS_FULL_LABELS).map((axis) => {
                          const defaultVal = (defaults as Record<string, number>)[axis];
                          const currentVal = (responses[trigger] as Record<string, number | string | undefined> | undefined)?.[axis];
                          const value = typeof currentVal === 'number' ? currentVal : (defaultVal ?? 0);
                          return (
                            <SliderField
                              key={axis}
                              label={AXIS_FULL_LABELS[axis]}
                              value={value}
                              onChange={(v) => handleAxisChange(trigger, axis, v)}
                              min={-1}
                              max={1}
                              step={0.01}
                              tooltip={`Default: ${(defaultVal ?? 0).toFixed(3)}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TriggerResponseEditor;
