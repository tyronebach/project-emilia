/**
 * BehaviorPlanner - The behavior brain
 * Takes BehaviorInput (intent, mood, energy, context) and produces BehaviorOutput
 * (what emotion to show, what gesture to play, micro-behaviors to schedule).
 *
 * Uses weighted random selection from behavior candidates, with history
 * tracking to avoid repetition.
 */

import type {
  BehaviorInput,
  BehaviorOutput,
  BehaviorCandidate,
  Intent,
  EnergyLevel,
  MicroBehavior,
} from '../types/behavior';
import { BEHAVIOR_MAP, ENERGY_MULTIPLIERS } from './behavior-mappings';

const MAX_HISTORY = 5;

export class BehaviorPlanner {
  private history: string[] = []; // Recent gesture names for anti-repetition

  /**
   * Main decision function
   */
  plan(input: BehaviorInput): BehaviorOutput {
    const intent = (input.intent || 'neutral') as Intent;
    const energy = (input.energy || 'medium') as EnergyLevel;

    // Get candidates for this intent (fall back to neutral)
    const candidates = BEHAVIOR_MAP[intent] ?? BEHAVIOR_MAP.neutral;

    // Select a candidate using weighted random with anti-repetition
    const selected = this.weightedSelect(candidates);

    // Apply energy multiplier to intensity
    const energyMultiplier = ENERGY_MULTIPLIERS[energy] ?? 1.0;
    const emotionIntensity = Math.min(1, selected.emotionIntensity * energyMultiplier);

    // Track gesture in history
    if (selected.gesture) {
      this.history.push(selected.gesture);
      if (this.history.length > MAX_HISTORY) {
        this.history.shift();
      }
    }

    // Generate micro-behaviors based on context
    const microBehaviors = this.generateMicroBehaviors(input, selected);

    return {
      facialEmotion: {
        expression: selected.emotion,
        intensity: emotionIntensity,
        transitionMs: 300,
      },
      bodyAction: selected.gesture ? {
        gesture: selected.gesture,
        intensity: energyMultiplier,
        additive: selected.gestureAdditive,
      } : null,
      microBehaviors,
      vocalHints: [],
    };
  }

  /**
   * Weighted random selection with anti-repetition bias
   */
  private weightedSelect(candidates: BehaviorCandidate[]): BehaviorCandidate {
    if (candidates.length === 0) {
      return { emotion: 'neutral', emotionIntensity: 0.3, gesture: null, gestureAdditive: false, weight: 1 };
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Adjust weights: reduce weight for recently used gestures
    const adjustedWeights = candidates.map(c => {
      let w = c.weight;
      if (c.gesture && this.history.includes(c.gesture)) {
        w *= 0.3; // Reduce weight for recently used gestures
      }
      return w;
    });

    // Normalize weights
    const totalWeight = adjustedWeights.reduce((sum, w) => sum + w, 0);
    if (totalWeight <= 0) {
      return candidates[0];
    }

    // Random selection
    let random = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      random -= adjustedWeights[i];
      if (random <= 0) {
        return candidates[i];
      }
    }

    return candidates[candidates.length - 1];
  }

  /**
   * Generate contextual micro-behaviors
   */
  private generateMicroBehaviors(input: BehaviorInput, _selected: BehaviorCandidate): MicroBehavior[] {
    const micros: MicroBehavior[] = [];

    // After speaking starts, schedule a glance away then back
    if (input.isSpeaking && input.turnCount > 0 && Math.random() < 0.3) {
      micros.push({
        type: 'glance_away',
        delay: 1500 + Math.random() * 2000,
        duration: 800 + Math.random() * 400,
      });
      micros.push({
        type: 'glance_back',
        delay: 2500 + Math.random() * 2000,
      });
    }

    // During long sessions, occasional posture shifts
    if (input.sessionDuration > 60000 && Math.random() < 0.15) {
      micros.push({
        type: 'posture_shift',
        delay: 500 + Math.random() * 1000,
        intensity: 0.3,
      });
    }

    return micros;
  }
}

export default BehaviorPlanner;
