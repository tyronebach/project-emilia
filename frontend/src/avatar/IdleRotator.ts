/**
 * IdleRotator
 * Rotates through a weighted pool of idle animations.
 * Each idle plays for 8-16 seconds, then crossfades (0.4s) to the next.
 * Avoids repeating the same idle consecutively.
 */

import { animationLibrary } from './AnimationLibrary';
import { animationStateMachine, type IdleEntry } from './AnimationStateMachine';
import type { AnimationGraph } from './AnimationGraph';

const MIN_DURATION = 8;
const MAX_DURATION = 16;
const CROSSFADE_DURATION = 0.4;

export class IdleRotator {
  private animationGraph: AnimationGraph;
  private pool: IdleEntry[] = [];
  private totalWeight: number = 0;
  private currentFile: string = '';
  private timer: number = 0;
  private nextSwitch: number = 0;
  private running: boolean = false;
  private paused: boolean = false;
  private started: boolean = false;

  constructor(animationGraph: AnimationGraph) {
    this.animationGraph = animationGraph;
  }

  /**
   * Load idle pool from state machine config and start rotating
   */
  async start(): Promise<void> {
    if (!animationStateMachine.isLoaded()) {
      await animationStateMachine.load();
    }

    this.pool = animationStateMachine.getIdles();
    if (this.pool.length === 0) {
      console.warn('[IdleRotator] No idles in config, falling back to single idle');
      return;
    }

    this.totalWeight = this.pool.reduce((sum, e) => sum + e.weight, 0);
    this.running = true;
    this.paused = false;
    this.started = true;
    this.timer = 0;
    this.nextSwitch = 0; // trigger immediate first pick

    console.log(`[IdleRotator] Started with ${this.pool.length} idles (total weight: ${this.totalWeight})`);
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.started = false;
    this.currentFile = '';
  }

  pause(): void {
    if (this.running) {
      this.paused = true;
    }
  }

  resume(): void {
    if (this.started) {
      this.paused = false;
    }
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  getCurrentFile(): string {
    return this.currentFile;
  }

  /**
   * Call every frame. Handles timer and triggers rotation.
   */
  update(deltaTime: number): void {
    if (!this.running || this.paused || this.pool.length === 0) return;

    this.timer += deltaTime;

    if (this.timer >= this.nextSwitch) {
      this.timer = 0;
      this.nextSwitch = this.randomDuration();
      this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    const file = this.pickWeightedRandom();
    if (!file) return;

    this.currentFile = file;

    const animData = await animationLibrary.load(file);
    if (!animData) {
      console.warn(`[IdleRotator] Failed to load idle: ${file}`);
      return;
    }

    this.animationGraph.playBase(animData.clip, CROSSFADE_DURATION);
    console.log(`[IdleRotator] Switched to: ${file}`);
  }

  /**
   * Weighted random selection, avoiding consecutive repeats
   */
  private pickWeightedRandom(): string | null {
    if (this.pool.length === 0) return null;
    if (this.pool.length === 1) return this.pool[0].file;

    // Filter out current to avoid repeat
    const candidates = this.pool.filter(e => e.file !== this.currentFile);
    const candidateWeight = candidates.reduce((sum, e) => sum + e.weight, 0);

    let roll = Math.random() * candidateWeight;
    for (const entry of candidates) {
      roll -= entry.weight;
      if (roll <= 0) return entry.file;
    }

    return candidates[candidates.length - 1].file;
  }

  private randomDuration(): number {
    return MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION);
  }
}

export default IdleRotator;
