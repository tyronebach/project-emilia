/**
 * AmbientBehavior
 * Runs continuously, generates micro-behaviors during idle/listening states.
 * Produces natural-looking ambient movements like glances, nods, and posture shifts.
 */

import type { MicroBehavior } from '../types/behavior';

const EMPTY_MICROS: readonly MicroBehavior[] = [];

interface AmbientState {
  isSpeaking: boolean;
  isListening: boolean;
  isGesturePlaying: boolean;
}

export class AmbientBehavior {
  // Timers for different ambient behaviors (seconds)
  private glanceTimer: number = 0;
  private nodTimer: number = 0;

  // Intervals (randomized)
  private nextGlanceInterval: number = this.randomInterval(4, 8);
  private nextNodInterval: number = this.randomInterval(3, 6);

  // Track if currently glancing away (to schedule glance back)
  private isGlancingAway: boolean = false;
  private glanceResetTimer: number = 0;
  private glanceResetDuration: number = 0;

  /**
   * Update and return any triggered micro-behaviors
   */
  update(deltaTime: number, state: AmbientState): readonly MicroBehavior[] {
    // Don't generate ambient behaviors during active gestures
    if (state.isGesturePlaying) {
      return EMPTY_MICROS;
    }

    // Frame-based glance reset timer
    if (this.isGlancingAway) {
      this.glanceResetTimer += deltaTime;
      if (this.glanceResetTimer >= this.glanceResetDuration) {
        this.isGlancingAway = false;
        this.glanceResetTimer = 0;
      }
    }

    const micros: MicroBehavior[] = [];

    this.glanceTimer += deltaTime;
    this.nodTimer += deltaTime;

    // Glance away (when not speaking, 40% chance per interval)
    if (!state.isSpeaking && this.glanceTimer >= this.nextGlanceInterval) {
      this.glanceTimer = 0;
      this.nextGlanceInterval = this.randomInterval(4, 8);

      if (!this.isGlancingAway && Math.random() < 0.4) {
        const glanceDuration = 0.8 + Math.random() * 0.6;
        micros.push({
          type: 'glance_away',
          delay: 0,
          duration: glanceDuration * 1000,
        });
        micros.push({
          type: 'glance_back',
          delay: glanceDuration * 1000,
        });
        this.isGlancingAway = true;
        this.glanceResetTimer = 0;
        this.glanceResetDuration = glanceDuration + 0.2;
      }
    }

    // Listening nods (when user is speaking, 30% chance per interval)
    if (state.isListening && this.nodTimer >= this.nextNodInterval) {
      this.nodTimer = 0;
      this.nextNodInterval = this.randomInterval(3, 6);

      if (Math.random() < 0.3) {
        micros.push({
          type: 'nod_small',
          delay: 0,
          intensity: 0.3 + Math.random() * 0.2,
        });
      }
    }

    return micros;
  }

  /**
   * Generate a random interval between min and max seconds
   */
  private randomInterval(minSeconds: number, maxSeconds: number): number {
    return minSeconds + Math.random() * (maxSeconds - minSeconds);
  }

  /**
   * Reset all timers (e.g., on state change)
   */
  reset(): void {
    this.glanceTimer = 0;
    this.nodTimer = 0;
    this.isGlancingAway = false;
    this.glanceResetTimer = 0;
  }
}

export default AmbientBehavior;
