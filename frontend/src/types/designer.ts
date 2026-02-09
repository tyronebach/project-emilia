export interface DesignerAgent {
  id: string;
  name: string;
  description: string;
  vrm_model: string | null;
  voice_id: string | null;
  baseline_valence: number;
  baseline_arousal: number;
  baseline_dominance: number;
  volatility: number;
  recovery: number;
  mood_baseline: Record<string, number>;
  mood_decay_rate: number;
  decay_rates: Record<string, number>;
  trigger_multipliers: Record<string, number>;
  trust_gain_multiplier: number;
  trust_loss_multiplier: number;
}

export interface DesignerMood {
  id: string;
  valence: number;
  arousal: number;
  description: string;
  emoji: string;
  category: 'positive' | 'negative' | 'neutral';
}

export interface DesignerRelationshipSummary {
  type: string;
  description: string;
  trigger_count: number;
}

export interface DesignerRelationship {
  type: string;
  description: string;
  modifiers: Record<string, unknown>;
  behaviors: Record<string, unknown>;
  response_modifiers: Record<string, unknown>;
  trigger_mood_map: Record<string, Record<string, number>>;
  example_responses: Record<string, string>;
  [key: string]: unknown;
}
