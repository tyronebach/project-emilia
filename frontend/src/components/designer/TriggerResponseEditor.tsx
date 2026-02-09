import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Info } from 'lucide-react';
import { TRIGGER_TAXONOMY, TRIGGER_PRESETS } from '../../types/designer';
import type { TriggerCategory, TriggerResponseProfile, MoodGroup } from '../../types/designer';
import { getTriggerDefaults, getMoodGroups } from '../../utils/designerApiV2';
import SliderField from './SliderField';

const CATEGORY_DESCRIPTIONS: Record<TriggerCategory, string> = {
  play: 'Lighthearted interactions — teasing, banter, flirting',
  care: 'Supportive interactions — compliments, comfort, encouragement',
  friction: 'Negative interactions — criticism, rejection, dismissal',
  repair: 'Making up after conflict — apologies, accountability',
  vulnerability: 'Sharing something personal — secrets, trust signals',
};

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  teasing: 'Playful poking or light mocking',
  banter: 'Quick back-and-forth witty exchanges',
  flirting: 'Romantic or suggestive playfulness',
  comfort: 'Soothing words during distress',
  praise: 'Complimenting abilities or character',
  affirmation: 'Validating feelings or identity',
  criticism: 'Pointing out flaws or mistakes',
  rejection: 'Refusing or pushing away',
  boundary: 'Setting limits on behavior',
  dismissal: 'Ignoring or belittling feelings',
  apology: 'Expressing regret for an action',
  accountability: 'Taking responsibility for mistakes',
  reconnection: 'Reaching out after a period of silence',
  disclosure: 'Sharing personal or sensitive information',
  trust_signal: 'Actions that demonstrate trust',
};

/**
 * Per-trigger preset descriptions that explain what each preset means
 * in the context of that specific trigger.
 *
 * Keys: `${trigger}.${preset}` — only non-obvious combos need entries.
 * Falls back to a generic description if no specific one exists.
 */
const PRESET_CONTEXT_HINTS: Record<string, string> = {
  // Play
  'teasing.threatening': 'Teasing feels hurtful and hostile — triggers a defensive reaction',
  'teasing.uncomfortable': 'Teasing causes mild discomfort — agent gets a little guarded',
  'teasing.neutral': 'Teasing has no emotional effect — agent ignores it',
  'teasing.muted': 'Teasing is slightly pleasant but barely noticeable',
  'teasing.normal': 'Teasing is mildly fun — default playful response',
  'teasing.amplified': 'Teasing is genuinely exciting — strong bonding signal',
  'teasing.intense': 'Teasing is thrilling — agent loves it and leans in hard',

  'banter.threatening': 'Witty exchanges feel like veiled attacks',
  'banter.uncomfortable': 'Banter creates slight anxiety — too edgy',
  'banter.neutral': 'Banter rolls off — no emotional impact',
  'banter.normal': 'Banter is fun and energizing — default',
  'banter.amplified': 'Banter is a favorite — makes the agent light up',
  'banter.intense': 'Banter is the best thing ever — pure joy',

  'flirting.threatening': 'Flirting feels invasive and alarming — strong negative reaction',
  'flirting.uncomfortable': 'Flirting makes the agent uneasy — mild withdrawal',
  'flirting.neutral': 'Flirting has no effect — completely ignored',
  'flirting.muted': 'Flirting is noticed but barely registers emotionally',
  'flirting.normal': 'Flirting is flattering — pleasant default reaction',
  'flirting.amplified': 'Flirting is exciting and welcome — agent reciprocates easily',
  'flirting.intense': 'Flirting is deeply thrilling — agent gets very flustered and happy',

  // Care
  'comfort.threatening': 'Comfort feels patronizing — triggers defensiveness',
  'comfort.neutral': 'Comfort has no emotional impact',
  'comfort.normal': 'Comfort is soothing and appreciated — default',
  'comfort.intense': 'Comfort is deeply meaningful — strong trust boost',

  'praise.threatening': 'Praise feels sarcastic or manipulative',
  'praise.uncomfortable': 'Praise causes embarrassment — agent deflects',
  'praise.neutral': 'Praise has no effect',
  'praise.normal': 'Praise feels warm and genuine — default',
  'praise.amplified': 'Praise is very meaningful — agent glows',
  'praise.intense': 'Praise is overwhelming in the best way — huge mood boost',

  'affirmation.normal': 'Validation feels supportive — default',
  'affirmation.intense': 'Validation hits deep — powerful emotional anchor',

  // Friction
  'criticism.threatening': 'Criticism feels devastating — very strong negative spiral',
  'criticism.uncomfortable': 'Criticism stings mildly',
  'criticism.neutral': 'Criticism is ignored — water off a duck',
  'criticism.muted': 'Criticism is noted but barely felt',
  'criticism.normal': 'Criticism hurts moderately — default reaction',
  'criticism.amplified': 'Criticism cuts deep — strong defensive reaction',
  'criticism.intense': 'Criticism is crushing — major emotional damage',

  'rejection.normal': 'Rejection is painful — default',
  'rejection.muted': 'Rejection is noted but shrugged off — thick skin',
  'rejection.intense': 'Rejection is devastating — trust collapse',

  'boundary.threatening': 'Boundaries feel like rejection — very painful',
  'boundary.neutral': 'Boundaries are respected without emotional impact',
  'boundary.normal': 'Boundaries cause some friction — default',
  'boundary.muted': 'Boundaries are accepted gracefully',

  'dismissal.normal': 'Dismissal hurts — default',
  'dismissal.muted': 'Dismissal barely registers — independent',
  'dismissal.intense': 'Dismissal is deeply wounding',

  // Repair
  'apology.normal': 'Apologies help heal — default',
  'apology.amplified': 'Apologies are very effective — quick forgiveness',
  'apology.muted': 'Apologies don\'t mean much — hard to impress',
  'apology.threatening': 'Apologies feel manipulative — makes things worse',

  'accountability.normal': 'Taking responsibility builds trust — default',
  'accountability.amplified': 'Accountability is deeply valued — major trust boost',

  'reconnection.normal': 'Reaching out is welcome — default healing',
  'reconnection.amplified': 'Reconnection is very meaningful — eager to repair',
  'reconnection.muted': 'Reconnection is acknowledged but guarded',

  // Vulnerability
  'disclosure.threatening': 'Sharing feels like an imposition — agent recoils',
  'disclosure.neutral': 'Disclosure is received neutrally',
  'disclosure.normal': 'Sharing builds trust — default reciprocal opening',
  'disclosure.amplified': 'Disclosure is deeply bonding — agent opens up in return',
  'disclosure.intense': 'Disclosure creates a profound connection',

  'trust_signal.normal': 'Trust signals are reassuring — default',
  'trust_signal.amplified': 'Trust signals are deeply meaningful — strong bond growth',
  'trust_signal.muted': 'Trust signals are noticed but don\'t move the needle much',
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
          <p className="mt-1">For example, if flirting normally gives <span className="text-success">+valence</span>, setting it to <span className="text-red-400">Threatening</span> flips it to <span className="text-error">-valence</span> at 1.5x strength.</p>
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

  return (
    <div className="space-y-4">
      <PresetLegend />

      {categories.map((category) => {
        const triggers = TRIGGER_TAXONOMY[category];
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
