/**
 * Idle Animation System
 * Plays a looping VRMA animation as the base idle state.
 * Triggered animations fade out from idle, then fade back when done.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { animationLibrary } from './AnimationLibrary';

// Default idle animation file
const DEFAULT_IDLE_ANIMATION = 'fm_vrma_motion_pack_01_02.vrma';

export class IdleAnimations {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;
  private idleAction: THREE.AnimationAction | null = null;
  private idleClip: THREE.AnimationClip | null = null;
  private isPaused: boolean = false;
  private isLoaded: boolean = false;
  private currentIdleFile: string = DEFAULT_IDLE_ANIMATION;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    
    // Use normalized humanoid root for mixer (same as AnimationPlayer)
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    this.mixer = new THREE.AnimationMixer(mixerRoot);
    
    // Auto-load default idle
    this.loadIdle(DEFAULT_IDLE_ANIMATION);
  }

  /**
   * Load and start playing an idle animation
   */
  async loadIdle(filename: string): Promise<boolean> {
    this.currentIdleFile = filename;
    
    // Stop current idle if any
    if (this.idleAction) {
      this.idleAction.stop();
      if (this.idleClip) {
        this.mixer.uncacheAction(this.idleClip);
        this.mixer.uncacheClip(this.idleClip);
      }
      this.idleAction = null;
      this.idleClip = null;
    }

    // Load animation from library
    const animData = await animationLibrary.load(filename);
    if (!animData) {
      console.warn(`[IdleAnimations] Could not load idle: ${filename}`);
      return false;
    }

    this.idleClip = animData.clip;
    this.idleAction = this.mixer.clipAction(this.idleClip);
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.play();
    this.isLoaded = true;

    console.log(`[IdleAnimations] Playing idle: ${filename} (${animData.duration.toFixed(1)}s)`);
    return true;
  }

  /**
   * Update mixer each frame
   */
  update(deltaTime: number): void {
    if (this.isPaused) return;
    this.mixer.update(deltaTime);
  }

  /**
   * Pause idle animation (called when triggered animation plays)
   */
  pause(): void {
    this.isPaused = true;
    if (this.idleAction) {
      this.idleAction.fadeOut(0.25);
    }
  }

  /**
   * Resume idle animation (called when triggered animation ends)
   */
  resume(): void {
    this.isPaused = false;
    if (this.idleAction) {
      this.idleAction.reset();
      this.idleAction.fadeIn(0.25);
      this.idleAction.play();
    }
  }

  /**
   * Get current idle animation filename
   */
  getCurrentIdle(): string {
    return this.currentIdleFile;
  }

  /**
   * Check if idle is loaded and playing
   */
  isPlaying(): boolean {
    return this.isLoaded && !this.isPaused && this.idleAction !== null;
  }

  /**
   * Dispose
   */
  dispose(): void {
    if (this.idleAction) {
      this.idleAction.stop();
    }
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
  }
}

export default IdleAnimations;
