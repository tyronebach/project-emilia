/**
 * MicroBehaviorController
 * Priority queue of scheduled micro-behaviors.
 * Accepts micro-behaviors with delays, executes them when ready.
 */

import type { MicroBehavior } from '../types/behavior';

interface ScheduledMicroBehavior {
  behavior: MicroBehavior;
  executeAt: number; // elapsed time in seconds when this should fire
}

export class MicroBehaviorController {
  private queue: ScheduledMicroBehavior[] = [];
  private elapsed: number = 0;
  private maxQueueSize: number = 20;

  /**
   * Schedule a micro-behavior for future execution
   */
  schedule(behavior: MicroBehavior): void {
    if (this.queue.length >= this.maxQueueSize) {
      return; // Drop if queue is full
    }

    const delaySeconds = (behavior.delay || 0) / 1000;
    this.queue.push({
      behavior,
      executeAt: this.elapsed + delaySeconds,
    });

    // Sort by execution time (earliest first)
    this.queue.sort((a, b) => a.executeAt - b.executeAt);
  }

  /**
   * Update and return any ready micro-behaviors
   */
  update(deltaTime: number): MicroBehavior[] {
    this.elapsed += deltaTime;

    const ready: MicroBehavior[] = [];
    while (this.queue.length > 0 && this.queue[0].executeAt <= this.elapsed) {
      const item = this.queue.shift()!;
      ready.push(item.behavior);
    }

    return ready;
  }

  /**
   * Clear all pending micro-behaviors
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get number of pending micro-behaviors
   */
  get pendingCount(): number {
    return this.queue.length;
  }
}

export default MicroBehaviorController;
