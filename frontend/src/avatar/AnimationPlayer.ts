/**
 * Animation Player
 * Plays GLB animations on VRM model using Three.js AnimationMixer
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { animationLibrary, type AnimationClipData } from './AnimationLibrary';
import type { IdleAnimations } from './IdleAnimations';

export interface PlayOptions {
  loop?: boolean;
  fadeIn?: number;   // Fade in duration (seconds)
  fadeOut?: number;  // Fade out duration (seconds)
  timeScale?: number; // Playback speed
}

const DEFAULT_OPTIONS: Required<PlayOptions> = {
  loop: false,
  fadeIn: 0.25,
  fadeOut: 0.25,
  timeScale: 1.0
};

export class AnimationPlayer {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimationName: string | null = null;
  private queue: Array<{ name: string; options: PlayOptions }> = [];
  private idleAnimations: IdleAnimations | null = null;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    // Listen for animation end
    this.mixer.addEventListener('finished', this.onAnimationFinished.bind(this));
  }

  /**
   * Set reference to idle animation system for pausing during triggered animations
   */
  setIdleAnimations(idleAnimations: IdleAnimations): void {
    this.idleAnimations = idleAnimations;
  }

  /**
   * Play an animation by name
   */
  async play(name: string, options: PlayOptions = {}): Promise<boolean> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // If already playing something, queue this animation
    if (this.currentAction && !this.currentAction.paused) {
      console.log(`[AnimationPlayer] Queuing '${name}' (currently playing '${this.currentAnimationName}')`);
      this.queue.push({ name, options: opts });
      return true;
    }

    // Load animation if needed
    const animData = await animationLibrary.load(name);
    if (!animData) {
      console.warn(`[AnimationPlayer] Animation '${name}' not available`);
      return false;
    }

    return this.playClip(animData, opts);
  }

  /**
   * Play a clip directly
   */
  private playClip(animData: AnimationClipData, options: Required<PlayOptions>): boolean {
    const { clip } = animData;

    // Retarget animation to VRM if needed
    // VRM uses normalized bone names, may need to map from Mixamo etc.
    const retargetedClip = this.retargetToVRM(clip);

    // Create action
    const action = this.mixer.clipAction(retargetedClip);
    action.setLoop(options.loop ? THREE.LoopRepeat : THREE.LoopOnce, options.loop ? Infinity : 1);
    action.clampWhenFinished = !options.loop;
    action.timeScale = options.timeScale;

    // Fade out current animation if any
    if (this.currentAction) {
      this.currentAction.fadeOut(options.fadeIn);
    }

    // Pause idle animations
    if (this.idleAnimations) {
      this.idleAnimations.pause();
    }

    // Start new animation
    action.reset();
    action.fadeIn(options.fadeIn);
    action.play();

    this.currentAction = action;
    this.currentAnimationName = animData.name;

    console.log(`[AnimationPlayer] Playing '${animData.name}' (${animData.duration.toFixed(2)}s)`);
    return true;
  }

  /**
   * Retarget animation clip to VRM bone names
   * Converts common naming conventions (Mixamo, etc.) to VRM standard
   */
  private retargetToVRM(clip: THREE.AnimationClip): THREE.AnimationClip {
    // Clone to avoid modifying original
    const newClip = clip.clone();

    // Bone name mapping (Mixamo → VRM)
    const boneMap: Record<string, string> = {
      'mixamorigHips': 'hips',
      'mixamorigSpine': 'spine',
      'mixamorigSpine1': 'chest',
      'mixamorigSpine2': 'upperChest',
      'mixamorigNeck': 'neck',
      'mixamorigHead': 'head',
      'mixamorigLeftShoulder': 'leftShoulder',
      'mixamorigLeftArm': 'leftUpperArm',
      'mixamorigLeftForeArm': 'leftLowerArm',
      'mixamorigLeftHand': 'leftHand',
      'mixamorigRightShoulder': 'rightShoulder',
      'mixamorigRightArm': 'rightUpperArm',
      'mixamorigRightForeArm': 'rightLowerArm',
      'mixamorigRightHand': 'rightHand',
      'mixamorigLeftUpLeg': 'leftUpperLeg',
      'mixamorigLeftLeg': 'leftLowerLeg',
      'mixamorigLeftFoot': 'leftFoot',
      'mixamorigRightUpLeg': 'rightUpperLeg',
      'mixamorigRightLeg': 'rightLowerLeg',
      'mixamorigRightFoot': 'rightFoot',
    };

    // Remap track names
    for (const track of newClip.tracks) {
      // Track names are like "mixamorigHips.position" or "mixamorigHead.quaternion"
      const parts = track.name.split('.');
      if (parts.length >= 2) {
        const boneName = parts[0];
        const property = parts.slice(1).join('.');
        
        const vrmBoneName = boneMap[boneName];
        if (vrmBoneName) {
          // Get actual bone node name from VRM
          const boneNode = this.vrm.humanoid?.getRawBoneNode(vrmBoneName as any);
          if (boneNode) {
            track.name = `${boneNode.name}.${property}`;
          }
        }
      }
    }

    return newClip;
  }

  /**
   * Handle animation finished event
   */
  private onAnimationFinished(_event: THREE.Event): void {
    console.log(`[AnimationPlayer] Animation '${this.currentAnimationName}' finished`);
    
    this.currentAction = null;
    this.currentAnimationName = null;

    // Resume idle animations
    if (this.idleAnimations) {
      this.idleAnimations.resume();
    }

    // Play next in queue
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.play(next.name, next.options);
    }
  }

  /**
   * Stop current animation
   */
  stop(fadeOut: number = 0.25): void {
    if (this.currentAction) {
      this.currentAction.fadeOut(fadeOut);
      setTimeout(() => {
        if (this.currentAction) {
          this.currentAction.stop();
          this.currentAction = null;
          this.currentAnimationName = null;
        }
        if (this.idleAnimations) {
          this.idleAnimations.resume();
        }
      }, fadeOut * 1000);
    }
    this.queue = [];
  }

  /**
   * Update mixer (call each frame)
   */
  update(deltaTime: number): void {
    this.mixer.update(deltaTime);
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.currentAction !== null && !this.currentAction.paused;
  }

  /**
   * Get current animation name
   */
  getCurrentAnimation(): string | null {
    return this.currentAnimationName;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
  }
}

export default AnimationPlayer;
