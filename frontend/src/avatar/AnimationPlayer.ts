/**
 * Animation Player
 * Plays GLB animations on VRM model using Three.js AnimationMixer
 * 
 * Animation files go in: public/animations/{name}.glb
 * Supported: nod, wave, thinking, surprised, etc.
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
   * Animations must exist as GLB files in public/animations/
   */
  async play(name: string, options: PlayOptions = {}): Promise<boolean> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // If already playing something, queue this animation
    if (this.currentAction && !this.currentAction.paused) {
      console.log(`[AnimationPlayer] Queuing '${name}' (currently playing '${this.currentAnimationName}')`);
      this.queue.push({ name, options: opts });
      return true;
    }

    // Try to load GLB animation
    const animData = await animationLibrary.load(name);
    if (!animData) {
      // Animation not available - skip silently
      console.log(`[AnimationPlayer] Animation '${name}' not found (add /animations/${name}.glb)`);
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
   * Converts common naming conventions (Mixamo, BVH/Bandai-Namco, etc.) to VRM standard
   */
  private retargetToVRM(clip: THREE.AnimationClip): THREE.AnimationClip {
    // Bone name mapping (various formats → VRM humanoid bone names)
    const boneMap: Record<string, string> = {
      // Mixamo format
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
      // Bandai-Namco BVH format (from Blender export)
      'Hips': 'hips',
      'Spine': 'spine',
      'Chest': 'chest',
      'Neck': 'neck',
      'Head': 'head',
      'Shoulder_L': 'leftShoulder',
      'UpperArm_L': 'leftUpperArm',
      'LowerArm_L': 'leftLowerArm',
      'Hand_L': 'leftHand',
      'Shoulder_R': 'rightShoulder',
      'UpperArm_R': 'rightUpperArm',
      'LowerArm_R': 'rightLowerArm',
      'Hand_R': 'rightHand',
      'UpperLeg_L': 'leftUpperLeg',
      'LowerLeg_L': 'leftLowerLeg',
      'Foot_L': 'leftFoot',
      'Toes_L': 'leftToes',
      'UpperLeg_R': 'rightUpperLeg',
      'LowerLeg_R': 'rightLowerLeg',
      'Foot_R': 'rightFoot',
      'Toes_R': 'rightToes',
    };

    // Bones to skip (root bones, helpers)
    const skipBones = new Set(['joint_Root', 'Armature', 'Root']);

    // Build VRM bone name cache
    const vrmBoneNodes: Record<string, THREE.Object3D> = {};
    if (this.vrm.humanoid) {
      console.log('[AnimationPlayer] Building bone map...');
      for (const [srcName, vrmName] of Object.entries(boneMap)) {
        const node = this.vrm.humanoid.getRawBoneNode(vrmName as any);
        if (node) {
          vrmBoneNodes[srcName] = node;
          console.log(`  ${srcName} → ${vrmName} → ${node.name}`);
        }
      }
    }

    console.log('[AnimationPlayer] VRM bone nodes found:', Object.keys(vrmBoneNodes).length);

    // Filter and remap tracks
    const newTracks: THREE.KeyframeTrack[] = [];
    let mappedCount = 0;
    let skippedCount = 0;

    for (const track of clip.tracks) {
      // Track names are like "Hips.position" or "Head.quaternion"
      const dotIndex = track.name.indexOf('.');
      if (dotIndex === -1) {
        skippedCount++;
        continue;
      }

      const boneName = track.name.substring(0, dotIndex);
      const property = track.name.substring(dotIndex + 1);

      // Skip root/helper bones
      if (skipBones.has(boneName)) {
        skippedCount++;
        continue;
      }

      // Find VRM bone node
      const vrmNode = vrmBoneNodes[boneName];
      if (!vrmNode) {
        console.log(`[AnimationPlayer] No VRM bone for: ${boneName}`);
        skippedCount++;
        continue;
      }

      // Clone track with new target name
      const newTrackName = `${vrmNode.name}.${property}`;
      const newTrack = track.clone();
      newTrack.name = newTrackName;
      newTracks.push(newTrack);
      mappedCount++;
    }

    console.log(`[AnimationPlayer] Retargeted: ${mappedCount} tracks, skipped: ${skippedCount}`);

    // Create new clip with filtered tracks
    const newClip = new THREE.AnimationClip(clip.name, clip.duration, newTracks);
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
