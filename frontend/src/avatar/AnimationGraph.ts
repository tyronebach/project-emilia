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
  private disposed = false;

  // Base layer (idle)
  private baseAction: THREE.AnimationAction | null = null;
  private baseClip: THREE.AnimationClip | null = null;

  // Gesture layer (crossfade on top)
  private gestureAction: THREE.AnimationAction | null = null;
  private gestureClip: THREE.AnimationClip | null = null;

  // Track pending timeouts for cleanup
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private boundOnFinished: (event: { action: THREE.AnimationAction }) => void;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    this.mixer = new THREE.AnimationMixer(mixerRoot);

    // Listen for gesture end to restore idle weight
    this.boundOnFinished = this.onFinished.bind(this);
    this.mixer.addEventListener('finished', this.boundOnFinished);
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
      this.safeTimeout(() => {
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
   * Play a gesture animation.
   * Simple approach: stop idle, play gesture, return to idle when done.
   */
  playCrossfade(clip: THREE.AnimationClip, options: {
    fadeIn?: number;
    fadeOut?: number;
    loop?: boolean;
    timeScale?: number;
  } = {}): void {
    const {
      fadeIn = 0.3,
      fadeOut = 0.3,
      loop = false,
      timeScale = 1.0,
    } = options;

    console.log('[AnimationGraph] playCrossfade:', clip.name, 'tracks:', clip.tracks.length, 'duration:', clip.duration);
    
    // Debug: Log first few track names
    clip.tracks.slice(0, 3).forEach((t, i) => {
      console.log(`[AnimationGraph] Track ${i}: ${t.name}`);
    });

    // Stop previous gesture if any
    if (this.gestureAction && this.gestureClip) {
      this.gestureAction.stop();
      this.mixer.uncacheAction(this.gestureClip);
      this.mixer.uncacheClip(this.gestureClip);
    }

    this.gestureClip = clip;
    this.gestureAction = this.mixer.clipAction(clip);
    
    const root = this.mixer.getRoot();
    console.log('[AnimationGraph] Created action, mixer root:', (root as THREE.Object3D).name || 'unnamed');
    
    this.gestureAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    this.gestureAction.clampWhenFinished = !loop;
    this.gestureAction.timeScale = timeScale;
    (this.gestureAction as THREE.AnimationAction & { _fadeOutDuration?: number })._fadeOutDuration = fadeOut;

    // Simple crossfade using THREE.js built-in
    this.gestureAction.reset();
    this.gestureAction.play();
    
    if (this.baseAction) {
      this.gestureAction.crossFadeFrom(this.baseAction, fadeIn, false);
      console.log('[AnimationGraph] crossFadeFrom base, fadeIn:', fadeIn);
    } else {
      this.gestureAction.fadeIn(fadeIn);
    }
  }

  /**
   * Stop gesture animation and restore idle weight
   */
  stopGesture(fadeOut: number = 0.3): void {
    if (this.gestureAction) {
      // Crossfade back to idle
      if (this.baseAction) {
        this.baseAction.reset();
        this.baseAction.play();
        this.baseAction.crossFadeFrom(this.gestureAction, fadeOut, false);
      }

      const clip = this.gestureClip;
      const action = this.gestureAction;
      this.safeTimeout(() => {
        action.stop();
        if (clip) {
          this.mixer.uncacheAction(clip);
          this.mixer.uncacheClip(clip);
        }
      }, fadeOut * 1000);

      this.gestureAction = null;
      this.gestureClip = null;
    }
  }

  /**
   * Handle animation finished (gesture complete)
   */
  private onFinished(event: { action: THREE.AnimationAction }): void {
    if (this.disposed) return;
    const action = event.action;

    // Only handle gesture finish, not base
    if (action === this.gestureAction) {
      console.log('[AnimationGraph] Gesture finished, returning to idle');

      const fadeOut = (action as THREE.AnimationAction & { _fadeOutDuration?: number })._fadeOutDuration ?? 0.3;

      // Crossfade back to idle
      if (this.baseAction) {
        this.baseAction.reset();
        this.baseAction.play();
        this.baseAction.crossFadeFrom(action, fadeOut, false);
      }

      const clip = this.gestureClip;
      this.safeTimeout(() => {
        action.stop();
        if (clip) {
          this.mixer.uncacheAction(clip);
          this.mixer.uncacheClip(clip);
        }
      }, fadeOut * 1000);

      this.gestureAction = null;
      this.gestureClip = null;
    }
  }

  /**
   * Schedule a timeout that is automatically cancelled on dispose
   */
  private safeTimeout(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      if (!this.disposed) fn();
      this.pendingTimeouts = this.pendingTimeouts.filter(t => t !== id);
    }, ms);
    this.pendingTimeouts.push(id);
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
   * Reset VRM skeleton to bind pose
   * Stops all animations and resets bone transforms
   */
  resetToBindPose(): void {
    // Stop all animations
    if (this.gestureAction) {
      this.gestureAction.stop();
      this.gestureAction = null;
    }
    if (this.baseAction) {
      this.baseAction.stop();
      this.baseAction = null;
    }
    this.mixer.stopAllAction();

    // Uncache all clips
    if (this.baseClip) {
      this.mixer.uncacheClip(this.baseClip);
      this.baseClip = null;
    }
    if (this.gestureClip) {
      this.mixer.uncacheClip(this.gestureClip);
      this.gestureClip = null;
    }

    // Reset all humanoid bones to identity rotation
    if (this.vrm.humanoid) {
      const boneNames = [
        'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
        'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
        'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
        'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
        'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
      ];

      for (const boneName of boneNames) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bone names are runtime strings
        const node = this.vrm.humanoid.getNormalizedBoneNode(boneName as any);
        if (node) {
          node.quaternion.identity();
          node.position.set(0, 0, 0);
        }
      }
    }

    // Force VRM update to apply bone resets
    this.vrm.update(0);

    console.log('[AnimationGraph] Reset to bind pose');
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.disposed = true;

    // Cancel all pending timeouts
    for (const id of this.pendingTimeouts) clearTimeout(id);
    this.pendingTimeouts = [];

    // Remove event listener
    this.mixer.removeEventListener('finished', this.boundOnFinished);

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
