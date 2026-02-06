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
    
    // Use normalized humanoid root for mixer - VRM copies normalized → raw on update
    const mixerRoot = vrm.humanoid?.normalizedHumanBonesRoot || vrm.scene;
    this.mixer = new THREE.AnimationMixer(mixerRoot);

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
      this.queue.push({ name, options: opts });
      return true;
    }

    // Check for procedural test animations
    if (name === 'test_wave') {
      const clip = this.createProceduralWave();
      if (clip) {
        return this.playClipDirect(clip, 'test_wave', opts);
      }
      return false;
    }

    // Try to load GLB animation
    const animData = await animationLibrary.load(name);
    if (!animData) {
      return false;
    }

    return this.playClip(animData, opts);
  }

  /**
   * Create a procedural wave animation for testing
   */
  private createProceduralWave(): THREE.AnimationClip | null {
    if (!this.vrm.humanoid) return null;

    // Use NORMALIZED bones - mixer targets normalized root
    const rightUpperArm = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const rightLowerArm = this.vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    
    if (!rightUpperArm || !rightLowerArm) {
      return null;
    }

    const duration = 2.0;
    const tracks: THREE.KeyframeTrack[] = [];

    // Right upper arm - raise up (rotate around Z axis for VRM)
    // VRM T-pose: arms down, Z is forward/back, X is up/down for shoulder rotation
    const upperArmTimes = [0, 0.5, 1.5, 2.0];
    const upperArmValues = [
      // Start: neutral (identity quaternion components: x, y, z, w)
      0, 0, 0, 1,
      // Raised: rotate to raise arm (around local Z, about -90 degrees)
      0, 0, -0.6, 0.8,
      // Still raised
      0, 0, -0.6, 0.8,
      // Back to neutral
      0, 0, 0, 1,
    ];
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${rightUpperArm.name}.quaternion`,
      upperArmTimes,
      upperArmValues
    ));

    // Right lower arm - wave motion (small oscillation)
    const lowerArmTimes = [0, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 2.0];
    const lowerArmValues = [
      0, 0, 0, 1,           // Start
      0.2, 0, 0, 0.98,      // Bend slightly
      0.3, 0, 0, 0.95,      // Wave 1
      0.1, 0, 0, 0.99,      // Wave 2
      0.3, 0, 0, 0.95,      // Wave 3
      0.1, 0, 0, 0.99,      // Wave 4
      0.2, 0, 0, 0.98,      // Wave 5
      0, 0, 0, 1,           // End
    ];
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${rightLowerArm.name}.quaternion`,
      lowerArmTimes,
      lowerArmValues
    ));

    return new THREE.AnimationClip('test_wave', duration, tracks);
  }

  /**
   * Play a clip directly (for procedural animations)
   */
  private playClipDirect(clip: THREE.AnimationClip, name: string, options: Required<PlayOptions>): boolean {
    const action = this.mixer.clipAction(clip);
    action.setLoop(options.loop ? THREE.LoopRepeat : THREE.LoopOnce, options.loop ? Infinity : 1);
    action.clampWhenFinished = !options.loop;
    action.timeScale = options.timeScale;

    if (this.currentAction) {
      this.currentAction.fadeOut(options.fadeIn);
    }

    if (this.idleAnimations) {
      this.idleAnimations.pause();
    }

    action.reset();
    action.fadeIn(options.fadeIn);
    action.play();

    this.currentAction = action;
    this.currentAnimationName = name;
    return true;
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
    return true;
  }

  /**
   * Retarget animation clip to VRM bone names
   * Converts common naming conventions (Mixamo, BVH/Bandai-Namco, etc.) to VRM standard
   */
  private retargetToVRM(clip: THREE.AnimationClip): THREE.AnimationClip {
    // Bone name mapping (various formats → VRM humanoid bone names)
    const boneMap: Record<string, string> = {
      // Mixamo format (with colon separator)
      'mixamorig:Hips': 'hips',
      'mixamorig:Spine': 'spine',
      'mixamorig:Spine1': 'chest',
      'mixamorig:Spine2': 'upperChest',
      'mixamorig:Neck': 'neck',
      'mixamorig:Head': 'head',
      'mixamorig:LeftShoulder': 'leftShoulder',
      'mixamorig:LeftArm': 'leftUpperArm',
      'mixamorig:LeftForeArm': 'leftLowerArm',
      'mixamorig:LeftHand': 'leftHand',
      'mixamorig:RightShoulder': 'rightShoulder',
      'mixamorig:RightArm': 'rightUpperArm',
      'mixamorig:RightForeArm': 'rightLowerArm',
      'mixamorig:RightHand': 'rightHand',
      'mixamorig:LeftUpLeg': 'leftUpperLeg',
      'mixamorig:LeftLeg': 'leftLowerLeg',
      'mixamorig:LeftFoot': 'leftFoot',
      'mixamorig:LeftToeBase': 'leftToes',
      'mixamorig:RightUpLeg': 'rightUpperLeg',
      'mixamorig:RightLeg': 'rightLowerLeg',
      'mixamorig:RightFoot': 'rightFoot',
      'mixamorig:RightToeBase': 'rightToes',
      // Mixamo format (no separator - legacy)
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
    
    // Allow all mapped bones for Mixamo (their rig matches humanoid standard)
    // Only restrict BVH bones (rest pose mismatch)
    const bvhOnlyBones = new Set([
      'Spine', 'Chest', 'Neck', 'Head',
      'Shoulder_L', 'UpperArm_L', 'LowerArm_L', 'Hand_L',
      'Shoulder_R', 'UpperArm_R', 'LowerArm_R', 'Hand_R',
      'Hips', 'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'Toes_L',
      'UpperLeg_R', 'LowerLeg_R', 'Foot_R', 'Toes_R',
    ]);
    
    // Check if this is a Mixamo animation (has mixamorig: prefix)
    const isMixamo = clip.tracks.some(t => t.name.includes('mixamorig'));

    // Build VRM bone name cache - use NORMALIZED bones (mixer targets normalized root)
    const vrmBoneNodes: Record<string, THREE.Object3D> = {};
    if (this.vrm.humanoid) {
      for (const [srcName, vrmName] of Object.entries(boneMap)) {
        const node = this.vrm.humanoid.getNormalizedBoneNode(vrmName as any);
        if (node) {
          vrmBoneNodes[srcName] = node;
        }
      }
    }

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

      // For BVH (non-Mixamo): only allow upper body until rest pose retargeting is fixed
      if (!isMixamo && bvhOnlyBones.has(boneName)) {
        // BVH bone - check if it's upper body
        const upperBodyBvh = ['Spine', 'Chest', 'Neck', 'Head', 
          'Shoulder_L', 'UpperArm_L', 'LowerArm_L', 'Hand_L',
          'Shoulder_R', 'UpperArm_R', 'LowerArm_R', 'Hand_R'];
        if (!upperBodyBvh.includes(boneName)) {
          skippedCount++;
          continue;
        }
      }

      // Skip position/translation tracks (causes flying/movement)
      // Only keep quaternion (rotation) tracks
      if (property === 'position' || property === 'translation') {
        skippedCount++;
        continue;
      }

      // Find VRM bone node
      const vrmNode = vrmBoneNodes[boneName];
      if (!vrmNode) {
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

    // Create new clip with filtered tracks
    const newClip = new THREE.AnimationClip(clip.name, clip.duration, newTracks);
    return newClip;
  }

  /**
   * Handle animation finished event
   */
  private onAnimationFinished(_event: THREE.Event): void {
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

  // Debug: direct bone test
  private debugBoneTest: THREE.Object3D | null = null;
  private debugTestTime: number = 0;
  private debugTestActive: boolean = false;

  /**
   * Start direct bone manipulation test using VRM normalized bone
   */
  testDirectBone(): void {
    if (!this.vrm.humanoid) return;
    this.debugBoneTest = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    this.debugTestTime = 0;
    this.debugTestActive = true;
  }

  /**
   * Update mixer (call each frame)
   */
  update(deltaTime: number): void {
    this.mixer.update(deltaTime);

    // Direct bone manipulation test - manipulate NORMALIZED bone (before VRM copies to raw)
    if (this.debugTestActive && this.debugBoneTest) {
      this.debugTestTime += deltaTime;
      const angle = Math.sin(this.debugTestTime * 3) * 0.5; // oscillate
      
      // Set rotation on normalized bone - VRM will copy to raw bone in vrm.update()
      this.debugBoneTest.quaternion.setFromEuler(new THREE.Euler(0, 0, angle));
      
      if (this.debugTestTime > 3) {
        // Reset to identity
        this.debugBoneTest.quaternion.identity();
        this.debugTestActive = false;
      }
    }
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
