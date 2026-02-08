/**
 * Behavior Mappings
 * Maps each Intent to an array of candidate behaviors with weights.
 * The BehaviorPlanner selects from these using weighted random selection.
 * 
 * Gestures must match state-machine.json actions:
 * wave, bow, nod, thinking, shy, surprised, excited, dance,
 * agree, disagree, angry, annoyed, dismissive, happy, smug,
 * relieved, look_away, sarcastic
 */

import type { BehaviorCandidate, Intent, EnergyLevel } from '../types/behavior';

export const BEHAVIOR_MAP: Record<Intent, BehaviorCandidate[]> = {
  greeting: [
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'wave', gestureAdditive: false, weight: 0.5 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  farewell: [
    { emotion: 'happy', emotionIntensity: 0.5, gesture: 'wave', gestureAdditive: false, weight: 0.4 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'bow', gestureAdditive: false, weight: 0.4 },
    { emotion: 'sad', emotionIntensity: 0.3, gesture: 'nod', gestureAdditive: false, weight: 0.2 },
  ],

  agreement: [
    { emotion: 'happy', emotionIntensity: 0.5, gesture: 'nod', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'agree', gestureAdditive: false, weight: 0.4 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  disagreement: [
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'disagree', gestureAdditive: false, weight: 0.5 },
    { emotion: 'sad', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'look_away', gestureAdditive: false, weight: 0.2 },
  ],

  thinking: [
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'thinking', gestureAdditive: false, weight: 0.6 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'look_away', gestureAdditive: false, weight: 0.2 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  listening: [
    { emotion: 'neutral', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.2, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  affection: [
    { emotion: 'happy', emotionIntensity: 0.9, gesture: 'shy', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'happy', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.3 },
  ],

  embarrassed: [
    { emotion: 'neutral', emotionIntensity: 0.5, gesture: 'shy', gestureAdditive: false, weight: 0.5 },
    { emotion: 'happy', emotionIntensity: 0.3, gesture: 'look_away', gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  playful: [
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'happy', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.9, gesture: 'excited', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'dance', gestureAdditive: false, weight: 0.2 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  curious: [
    { emotion: 'surprised', emotionIntensity: 0.4, gesture: 'thinking', gestureAdditive: false, weight: 0.4 },
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'look_away', gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 0.3 },
  ],

  surprised: [
    { emotion: 'surprised', emotionIntensity: 0.8, gesture: 'surprised', gestureAdditive: false, weight: 0.6 },
    { emotion: 'surprised', emotionIntensity: 0.7, gesture: null, gestureAdditive: false, weight: 0.3 },
    { emotion: 'surprised', emotionIntensity: 0.6, gesture: 'excited', gestureAdditive: false, weight: 0.1 },
  ],

  pleased: [
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'happy', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'nod', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.8, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  annoyed: [
    { emotion: 'angry', emotionIntensity: 0.4, gesture: 'annoyed', gestureAdditive: false, weight: 0.4 },
    { emotion: 'angry', emotionIntensity: 0.5, gesture: 'dismissive', gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'look_away', gestureAdditive: false, weight: 0.3 },
  ],

  dismissive: [
    { emotion: 'neutral', emotionIntensity: 0.3, gesture: 'dismissive', gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.4, gesture: 'look_away', gestureAdditive: false, weight: 0.3 },
    { emotion: 'neutral', emotionIntensity: 0.2, gesture: 'sarcastic', gestureAdditive: false, weight: 0.2 },
  ],

  confident: [
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'smug', gestureAdditive: false, weight: 0.5 },
    { emotion: 'neutral', emotionIntensity: 0.5, gesture: 'nod', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.4, gesture: null, gestureAdditive: false, weight: 0.2 },
  ],

  excited: [
    { emotion: 'happy', emotionIntensity: 0.9, gesture: 'excited', gestureAdditive: false, weight: 0.5 },
    { emotion: 'happy', emotionIntensity: 0.8, gesture: 'dance', gestureAdditive: false, weight: 0.3 },
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'happy', gestureAdditive: false, weight: 0.2 },
  ],

  'attention-seeking': [
    { emotion: 'happy', emotionIntensity: 0.7, gesture: 'wave', gestureAdditive: false, weight: 0.4 },
    { emotion: 'happy', emotionIntensity: 0.6, gesture: 'excited', gestureAdditive: false, weight: 0.3 },
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
