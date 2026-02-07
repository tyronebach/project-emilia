/**
 * Behavior Mappings
 * Maps each Intent to an array of candidate behaviors with weights.
 * The BehaviorPlanner selects from these using weighted random selection.
 */

import type { BehaviorCandidate, Intent, EnergyLevel } from '../types/behavior';

export const BEHAVIOR_MAP: Record<Intent, BehaviorCandidate[]> = {
  greeting: [
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'wave', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.5, gesture: 'head_tilt', gestureAdditive: false, weight: 0.2 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.1 },
  ],

  farewell: [
    { emotion: 'happy', emotionIntensity: 0.5, gesture: 'wave', gestureAdditive: false, weight: 0.5 },
    { emotion: 'sad', emotionIntensity: 0.3, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  agreement: [
    { emotion: 'happy', emotionIntensity: 0.5, gesture: 'nod', gestureAdditive: false, weight: 0.6 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'nod', gestureAdditive: false, weight: 0.1 },
  ],

  disagreement: [
    { emotion: 'sad', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.4 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
  ],

  thinking: [
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'thinking_pose', gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.2, gesture: 'head_tilt', gestureAdditive: false, weight: 0.2 },
  ],

  listening: [
    { emotion: 'neutral', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  affection: [
    { emotion: 'happy', emotionIntensity: 0.9, gesture: null, gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
  ],

  embarrassed: [
    { emotion: 'neutral', emotionIntensity: 0.5, gesture: null, gestureAdditive: false, weight: 0.5 },
    { emotion: 'happy', emotionIntensity: 0.3, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'sad', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  playful: [
    { emotion: 'happy', emotionIntensity: 0.8, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.9, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.2 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'wave', gestureAdditive: false, weight: 0.2 },
  ],

  curious: [
    { emotion: 'surprised', emotionIntensity: 0.4, gesture: 'head_tilt', gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  surprised: [
    { emotion: 'surprised', emotionIntensity: 0.8, gesture: null, gestureAdditive: false, weight: 0.5 },
    { emotion: 'surprised', emotionIntensity: 0.7, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.6, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  pleased: [
    { emotion: 'happy', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'nod', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'head_tilt', gestureAdditive: false, weight: 0.2 },
  ],

  annoyed: [
    { emotion: 'angry', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.5 },
    { emotion: 'sad', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'head_tilt', gestureAdditive: false, weight: 0.2 },
  ],

  'attention-seeking': [
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'wave', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'head_tilt', gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.3 },
  ],

  neutral: [
    { emotion: 'neutral', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.6 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.1, gesture: null, gestureAdditive: false, weight: 0.1 },
  ],
};

export const ENERGY_MULTIPLIERS: Record<EnergyLevel, number> = {
  low: 0.7,
  medium: 1.0,
  high: 1.3,
};
