/**
 * Idle Animation System
 * Plays a looping animation as the base idle state.
 * Uses AnimationStateMachine config to determine which file to play.
 * Delegates to AnimationGraph's base layer - idle never pauses.
 *
 * If the config defines an idle rotation pool (idles[]),
 * IdleRotator takes over after the initial idle loads.
 */

import type { VRM } from '@pixiv/three-vrm';
import { animationLibrary } from './AnimationLibrary';
import { animationStateMachine } from './AnimationStateMachine';
import type { AnimationGraph } from './AnimationGraph';
import { IdleRotator } from './IdleRotator';

export class IdleAnimations {
  private vrm: VRM;
  private animationGraph: AnimationGraph | null = null;
  private isLoaded: boolean = false;
  private currentIdleFile: string = '';
  private fadeIn: number = 0.3;
  private fadeOut: number = 0.3;
  private idleRotator: IdleRotator | null = null;

  constructor(vrm: VRM, animationGraph?: AnimationGraph) {
    this.vrm = vrm;
    this.animationGraph = animationGraph ?? null;

    // Load idle from state machine config
    this.loadFromStateMachine();
  }

  /**
   * Set the AnimationGraph (for deferred init)
   */
  setAnimationGraph(graph: AnimationGraph): void {
    this.animationGraph = graph;
  }

  /**
   * Load idle config from state machine.
   * Idles are preloaded upfront; gestures lazy-load on first use.
   */
  private async loadFromStateMachine(): Promise<void> {
    // Ensure state machine is loaded
    if (!animationStateMachine.isLoaded()) {
      await animationStateMachine.load();
    }

    // Preload all idles upfront (no stutter during rotation)
    await animationStateMachine.preloadIdles();

    const idle = animationStateMachine.getIdle();
    if (idle) {
      this.fadeIn = idle.fadeIn;
      this.fadeOut = idle.fadeOut;
      await this.loadIdle(idle.file);
    } else {
      console.warn('[IdleAnimations] No idle config found in state machine');
    }

    // Start idle rotator if pool is available
    const idles = animationStateMachine.getIdles();
    if (idles.length > 0 && this.animationGraph) {
      this.idleRotator = new IdleRotator(this.animationGraph);
      await this.idleRotator.start();
    }
  }

  /**
   * Load and start playing an idle animation
   */
  async loadIdle(filename: string): Promise<boolean> {
    this.currentIdleFile = filename;

    // Load animation from library
    const animData = await animationLibrary.load(filename);
    if (!animData) {
      console.warn(`[IdleAnimations] Could not load idle: ${filename}`);
      return false;
    }

    // Play via AnimationGraph base layer
    if (this.animationGraph) {
      this.animationGraph.playBase(animData.clip, this.fadeIn);
    }

    this.isLoaded = true;
    console.log(`[IdleAnimations] Playing idle: ${filename} (${animData.duration.toFixed(1)}s)`);
    return true;
  }

  /**
   * Update - drives IdleRotator timer
   */
  update(deltaTime: number): void {
    this.idleRotator?.update(deltaTime);
  }

  /**
   * Get current idle animation filename
   */
  getCurrentIdle(): string {
    return this.idleRotator?.getCurrentFile() || this.currentIdleFile;
  }

  /**
   * Check if idle is loaded and playing
   */
  isPlaying(): boolean {
    return this.isLoaded && (this.animationGraph?.isBasePlaying() ?? false);
  }

  /**
   * Pause idle rotation (e.g. during gesture)
   */
  pauseRotation(): void {
    this.idleRotator?.pause();
  }

  /**
   * Resume idle rotation
   */
  resumeRotation(): void {
    this.idleRotator?.resume();
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.idleRotator?.stop();
  }
}

export default IdleAnimations;
