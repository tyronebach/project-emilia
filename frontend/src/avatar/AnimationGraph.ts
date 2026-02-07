/**
 * AnimationGraph - Unified animation system
 * Single THREE.AnimationMixer with logical layers for base (idle) and gesture animations.
 * Gestures crossfade with idle using weight blending - idle never fully stops.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export class AnimationGraph {
  private mixer: THREE.AnimationMixer;
  private vrm: VRM;

  // Base layer (idle)
  private baseAction: THREE.AnimationAction | null = null;
  private baseClip: THREE.AnimationClip | null = null;

  // Gesture layer (crossfade on top)
  private gestureAction: THREE.AnimationAction | null = null;
  private gestureClip: THREE.AnimationClip | null = null;
  private gestureRestoreWeight: number = 1.0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    this.mixer = new THREE.AnimationMixer(mixerRoot);

    // Listen for gesture end to restore idle weight
    this.mixer.addEventListener('finished', this.onFinished.bind(this));
  }

  /**
   * Play a clip on the base (idle) layer.
   * Always loops. Previous base clip is crossfaded out.
   */
  playBase(clip: THREE.AnimationClip, fadeIn: number = 0.3): void {
    // Clean up previous base
    if (this.baseAction && this.baseClip) {
      this.baseAction.fadeOut(fadeIn);
      const oldClip = this.baseClip;
      const oldAction = this.baseAction;
      setTimeout(() => {
        oldAction.stop();
        this.mixer.uncacheAction(oldClip);
        this.mixer.uncacheClip(oldClip);
      }, fadeIn * 1000);
    }

    this.baseClip = clip;
    this.baseAction = this.mixer.clipAction(clip);
    this.baseAction.setLoop(THREE.LoopRepeat, Infinity);
    this.baseAction.weight = 1.0;
    this.baseAction.reset();
    this.baseAction.fadeIn(fadeIn);
    this.baseAction.play();
  }

  /**
   * Play a gesture animation with crossfade blending.
   * Reduces idle weight during gesture, restores after.
   */
  playCrossfade(clip: THREE.AnimationClip, options: {
    fadeIn?: number;
    fadeOut?: number;
    loop?: boolean;
    timeScale?: number;
    idleWeight?: number;
  } = {}): void {
    const {
      fadeIn = 0.25,
      fadeOut = 0.25,
      loop = false,
      timeScale = 1.0,
      idleWeight = 0.3,
    } = options;

    // Stop previous gesture if any
    if (this.gestureAction && this.gestureClip) {
      this.gestureAction.fadeOut(fadeIn);
      const oldClip = this.gestureClip;
      const oldAction = this.gestureAction;
      setTimeout(() => {
        oldAction.stop();
        this.mixer.uncacheAction(oldClip);
        this.mixer.uncacheClip(oldClip);
      }, fadeIn * 1000);
    }

    // Reduce idle weight during gesture
    this.gestureRestoreWeight = 1.0;
    if (this.baseAction) {
      this.baseAction.weight = idleWeight;
    }

    this.gestureClip = clip;
    this.gestureAction = this.mixer.clipAction(clip);
    this.gestureAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    this.gestureAction.clampWhenFinished = !loop;
    this.gestureAction.timeScale = timeScale;

    // Store fadeOut for use in onFinished
    (this.gestureAction as THREE.AnimationAction & { _fadeOutDuration?: number })._fadeOutDuration = fadeOut;

    this.gestureAction.reset();
    this.gestureAction.fadeIn(fadeIn);
    this.gestureAction.play();
  }

  /**
   * Stop gesture animation and restore idle weight
   */
  stopGesture(fadeOut: number = 0.25): void {
    if (this.gestureAction) {
      this.gestureAction.fadeOut(fadeOut);

      const clip = this.gestureClip;
      const action = this.gestureAction;
      setTimeout(() => {
        action.stop();
        if (clip) {
          this.mixer.uncacheAction(clip);
          this.mixer.uncacheClip(clip);
        }
      }, fadeOut * 1000);

      this.gestureAction = null;
      this.gestureClip = null;
    }

    // Restore idle weight
    if (this.baseAction) {
      this.baseAction.weight = 1.0;
    }
  }

  /**
   * Handle animation finished (gesture complete)
   */
  private onFinished(event: { action: THREE.AnimationAction }): void {
    const action = event.action;

    // Only handle gesture finish, not base
    if (action === this.gestureAction) {
      const fadeOut = (action as THREE.AnimationAction & { _fadeOutDuration?: number })._fadeOutDuration ?? 0.25;

      action.fadeOut(fadeOut);
      const clip = this.gestureClip;
      setTimeout(() => {
        action.stop();
        if (clip) {
          this.mixer.uncacheAction(clip);
          this.mixer.uncacheClip(clip);
        }
      }, fadeOut * 1000);

      this.gestureAction = null;
      this.gestureClip = null;

      // Restore idle weight
      if (this.baseAction) {
        this.baseAction.weight = this.gestureRestoreWeight;
      }
    }
  }

  /**
   * Update the mixer each frame
   */
  update(deltaTime: number): void {
    this.mixer.update(deltaTime);
  }

  /**
   * Get the underlying mixer (for cases that need direct access)
   */
  getMixer(): THREE.AnimationMixer {
    return this.mixer;
  }

  /**
   * Check if a gesture is currently playing
   */
  isGesturePlaying(): boolean {
    return this.gestureAction !== null && this.gestureAction.isRunning();
  }

  /**
   * Check if base (idle) is playing
   */
  isBasePlaying(): boolean {
    return this.baseAction !== null && this.baseAction.isRunning();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (this.gestureAction) {
      this.gestureAction.stop();
    }
    if (this.baseAction) {
      this.baseAction.stop();
    }
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
  }
}

export default AnimationGraph;
