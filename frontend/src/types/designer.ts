// ============ AGENT PERSONALITY (DNA) ============

export interface AgentPersonality {
  id: string;
  name: string;
  description: string;
  vrm_model: string | null;
  voice_id: string | null;

  // Emotional Baseline
  baseline_valence: number;    // -1 to 1
  baseline_arousal: number;    // -1 to 1
  baseline_dominance: number;  // -1 to 1

  // Emotional Dynamics
  volatility: number;          // 0 to 3
  recovery_rate: number;       // 0 to 1
  mood_decay_rate: number;

  // Mood Disposition
  mood_baseline: Record<string, number>;

  // Trust Dynamics
  trust_gain_rate: number;     // 0 to 3
  trust_loss_rate: number;     // 0 to 3

  // Intrinsic Trigger Sensitivities (personality-based)
  trigger_sensitivities: Record<string, number>;

  // Trigger Response Profiles (per-axis directional overrides)
  trigger_responses: Record<string, TriggerResponseProfile>;

  // Essence Traits (hard limits)
  essence_floors: Record<string, number>;
  essence_ceilings: Record<string, number>;
}

// ============USER-AGENT BOND ============

export interface UserAgentBond {
  user_id: string;
  agent_id: string;
  agent_name: string;

  // Current Emotional State
  valence: number;
  arousal: number;
  dominance: number;

  // Mood State
  mood_weights: Record<string, number>;
  dominant_moods: string[];

  // Relationship Dimensions (0 to 1)
  trust: number;
  intimacy: number;
  playfulness_safety: number;
  conflict_tolerance: number;
  familiarity: number;
  attachment: number;

  // Temporal
  last_interaction: string | null;
  interaction_count: number;

  // Has calibration data
  has_calibration: boolean;
}

export interface UserAgentBondSummary {
  user_id: string;
  agent_id: string;
  agent_name: string;
  trust: number;
  intimacy: number;
  interaction_count: number;
  last_interaction: string | null;
}

// ============TRIGGER CALIBRATION ============

export interface TriggerCalibration {
  trigger_type: string;

  // Counts
  positive_weight: number;
  negative_weight: number;
  neutral_weight: number;
  occurrence_count: number;

  // Computed
  learned_multiplier: number;
  last_occurrence: string | null;
}

export interface ContextBucket {
  key: string;
  trust_level: 'low' | 'mid' | 'high';
  arousal_level: 'calm' | 'activated';
  recent_conflict: boolean;
  calibration: TriggerCalibration;
}

export interface ContextualCalibration {
  trigger_type: string;
  global: TriggerCalibration;
  buckets: ContextBucket[];
}

export interface UserCalibrationProfile {
  user_id: string;
  agent_id: string;
  agent_name: string;
  calibrations: ContextualCalibration[];
  total_interactions: number;
}

// ============SIMULATION ============

export interface SimulationRequest {
  agent_id: string;
  user_id: string;
  message: string;
}

export interface SimulationTriggerDetail {
  trigger: string;
  raw_intensity: number;
  effective_intensity: number;
  dna_sensitivity: number;
  calibration_multiplier: number;
  axis_deltas?: Record<string, number>;
}

export interface SimulationResult {
  detected_triggers: SimulationTriggerDetail[];
  state_before: Record<string, number>;
  state_after: Record<string, number>;
  dimension_deltas: Record<string, number>;
  mood_shifts: Record<string, number>;
  context_block: string;
}

// ============ TRIGGER RESPONSE PROFILES ============

export interface TriggerResponseProfile {
  valence?: number;
  arousal?: number;
  trust?: number;
  attachment?: number;
  intimacy?: number;
  preset?: string;
}

export const TRIGGER_PRESETS = [
  { key: 'threatening', label: 'Threatening', multiplier: -1.5 },
  { key: 'uncomfortable', label: 'Uncomfortable', multiplier: -0.5 },
  { key: 'neutral', label: 'Neutral', multiplier: 0.0 },
  { key: 'muted', label: 'Muted', multiplier: 0.5 },
  { key: 'normal', label: 'Normal', multiplier: 1.0 },
  { key: 'amplified', label: 'Amplified', multiplier: 1.5 },
  { key: 'intense', label: 'Intense', multiplier: 2.0 },
] as const;

export type TriggerPresetKey = (typeof TRIGGER_PRESETS)[number]['key'];

// ============ CONSOLIDATED TRIGGERS ============

export const TRIGGER_TAXONOMY = {
  play: ['teasing', 'banter', 'flirting'],
  care: ['comfort', 'praise', 'affirmation'],
  friction: ['criticism', 'rejection', 'boundary', 'dismissal'],
  repair: ['apology', 'accountability', 'reconnection'],
  vulnerability: ['disclosure', 'trust_signal'],
} as const;

export type TriggerCategory = keyof typeof TRIGGER_TAXONOMY;
export type TriggerType = (typeof TRIGGER_TAXONOMY)[TriggerCategory][number];

export const CATEGORY_DESCRIPTIONS: Record<TriggerCategory, string> = {
  play: 'Lighthearted interactions — teasing, banter, flirting',
  care: 'Supportive interactions — compliments, comfort, encouragement',
  friction: 'Negative interactions — criticism, rejection, dismissal',
  repair: 'Making up after conflict — apologies, accountability',
  vulnerability: 'Sharing something personal — secrets, trust signals',
};

export const TRIGGER_DESCRIPTIONS: Record<string, string> = {
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

// ============ MOOD GROUPS ============

export interface MoodInfo {
  valence: number;
  arousal: number;
}

export interface MoodGroup {
  label: string;
  color: string;
  moods: Record<string, MoodInfo>;
}
