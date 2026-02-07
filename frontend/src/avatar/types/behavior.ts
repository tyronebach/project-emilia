/**
 * Behavior System Type Definitions
 * Types for the intent-driven behavior planning system.
 */

export type Intent =
  | 'greeting'
  | 'farewell'
  | 'agreement'
  | 'disagreement'
  | 'thinking'
  | 'listening'
  | 'affection'
  | 'embarrassed'
  | 'playful'
  | 'curious'
  | 'surprised'
  | 'pleased'
  | 'annoyed'
  | 'attention-seeking'
  | 'neutral';

export type Mood =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'calm'
  | 'anxious'
  | 'neutral';

export type EnergyLevel = 'low' | 'medium' | 'high';

export interface BehaviorInput {
  intent: Intent | string;
  mood: Mood | string;
  energy: EnergyLevel | string;
  isSpeaking: boolean;
  isListening: boolean;
  turnCount: number;
  timeSinceUserMessage: number;
  timeSinceLastBehavior: number;
  sessionDuration: number;
  userAction?: UserAction;
}

export interface BehaviorOutput {
  facialEmotion: {
    expression: string;
    intensity: number;
    transitionMs: number;
  };
  bodyAction: {
    gesture: string | null;
    intensity: number;
    additive: boolean;
  } | null;
  microBehaviors: MicroBehavior[];
  vocalHints: string[];
}

export type MicroBehaviorType =
  | 'glance_away'
  | 'glance_back'
  | 'nod_small'
  | 'head_tilt'
  | 'posture_shift'
  | 'anticipation';

export interface MicroBehavior {
  type: MicroBehaviorType;
  delay: number;     // ms before executing
  duration?: number;  // ms for timed behaviors (glance)
  intensity?: number; // 0-1
}

export interface UserAction {
  type: 'tap_face' | 'tap_body' | 'drag' | 'hold' | 'rapid_taps' | 'idle_timeout';
  position?: { x: number; y: number };
  duration?: number;
}

export interface BehaviorCandidate {
  emotion: string;
  emotionIntensity: number;
  gesture: string | null;
  gestureAdditive: boolean;
  weight: number;
}
