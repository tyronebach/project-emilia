export interface SoulMoodEntry {
  id: string;
  weight: number;
  emoji?: string;
  description?: string;
}

export interface SoulMoodSnapshot {
  user_id: string;
  agent_id: string;
  dominant_mood: SoulMoodEntry;
  secondary_moods: SoulMoodEntry[];
  valence: number;
  arousal: number;
  trust: number;
  intimacy: number;
  interaction_count: number;
  last_interaction: string | null;
}

export interface SoulBondSnapshot {
  user_id: string;
  agent_id: string;
  agent_name: string;
  relationship_type: string;
  dimensions: {
    trust: number;
    intimacy: number;
    familiarity: number;
    attachment: number;
    playfulness_safety: number;
    conflict_tolerance: number;
  };
  labels: {
    trust: string;
    intimacy: string;
    familiarity: string;
  };
  state: {
    valence: number;
    arousal: number;
    dominant_moods: string[];
  };
  stats: {
    interaction_count: number;
    messages_exchanged?: number;
    last_interaction: string | null;
    first_interaction: string | null;
    days_known: number;
  };
  milestones: SoulTimelineItem[];
}

export interface SoulAboutPayload {
  agent_id: string;
  display_name: string;
  sections: {
    identity: Record<string, string>;
    essence: string[];
    personality: string[];
    quirks: string[];
  };
  raw_soul_md: string | null;
}

export interface SoulTimelineItem {
  id: string;
  type: string;
  date: string;
  note?: string | null;
  source?: string | null;
  game?: string | null;
}

export interface SoulEventsPayload {
  schema_version: number;
  user_id: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
  milestones: SoulTimelineItem[];
  upcoming_events: SoulTimelineItem[];
}

export interface SoulEventsMutationRequest {
  action: 'add_milestone' | 'add_event' | 'remove_event';
  id?: string;
  item?: Record<string, unknown>;
}

export interface SoulEventsMutationResponse {
  ok: boolean;
  events: SoulEventsPayload;
}
