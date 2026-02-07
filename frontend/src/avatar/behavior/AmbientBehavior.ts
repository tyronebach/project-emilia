/**
 * AmbientBehavior
 * Runs continuously, generates micro-behaviors during idle/listening states.
 * Produces natural-looking ambient movements like glances, nods, and posture shifts.
 */

import type { MicroBehavior } from '../types/behavior';

interface AmbientState {
  isSpeaking: boolean;
  isListening: boolean;
  isGesturePlaying: boolean;
}

export class AmbientBehavior {
  // Timers for different ambient behaviors (seconds)
  private glanceTimer: number = 0;
  private postureTimer: number = 0;
  private nodTimer: number = 0;

  // Intervals (randomized)
  private nextGlanceInterval: number = this.randomInterval(4, 8);
  private nextPostureInterval: number = this.randomInterval(10, 20);
  private nextNodInterval: number = this.randomInterval(3, 6);

  // Track if currently glancing away (to schedule glance back)
  private isGlancingAway: boolean = false;

  /**
   * Update and return any triggered micro-behaviors
   */
  update(deltaTime: number, state: AmbientState): MicroBehavior[] {
    const micros: MicroBehavior[] = [];

    // Don't generate ambient behaviors during active gestures
    if (state.isGesturePlaying) {
      return micros;
    }

    this.glanceTimer += deltaTime;
    this.postureTimer += deltaTime;
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

        // Reset after glance completes
        setTimeout(() => {
          this.isGlancingAway = false;
        }, glanceDuration * 1000 + 200);
      }
    }

    // Posture shift (every 10-20s, subtle)
    if (this.postureTimer >= this.nextPostureInterval) {
      this.postureTimer = 0;
      this.nextPostureInterval = this.randomInterval(10, 20);

      if (Math.random() < 0.5) {
        micros.push({
          type: 'posture_shift',
          delay: 0,
          intensity: 0.2 + Math.random() * 0.2,
        });
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
    this.postureTimer = 0;
    this.nodTimer = 0;
    this.isGlancingAway = false;
  }
}

export default AmbientBehavior;
