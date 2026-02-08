/**
 * Animation Player
 * Plays GLB/VRMA gesture animations on VRM model via AnimationGraph.
 * Handles retargeting, queuing, and state machine config lookup.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { animationLibrary, type AnimationClipData } from './AnimationLibrary';
import { animationStateMachine } from './AnimationStateMachine';
import type { AnimationGraph } from './AnimationGraph';

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
  private animationGraph: AnimationGraph | null = null;
  private currentAnimationName: string | null = null;
  private queue: Array<{ name: string; options: PlayOptions }> = [];

  constructor(vrm: VRM, animationGraph?: AnimationGraph) {
    this.vrm = vrm;
    this.animationGraph = animationGraph ?? null;
  }

  /**
   * Set the AnimationGraph (for deferred init)
   */
  setAnimationGraph(graph: AnimationGraph): void {
    this.animationGraph = graph;
  }

  /**
   * Play an animation by action name or filename
   * First checks state machine for action config, then falls back to direct file load
   */
  async play(name: string, options: PlayOptions = {}): Promise<boolean> {
    // Ensure state machine is loaded
    if (!animationStateMachine.isLoaded()) {
      await animationStateMachine.load();
    }
    
    // Check state machine for action config
    const actionConfig = animationStateMachine.getAction(name);

    let file: string;
    let opts: Required<PlayOptions>;

    if (actionConfig) {
      file = actionConfig.file;
      opts = {
        loop: options.loop ?? actionConfig.loop,
        fadeIn: options.fadeIn ?? actionConfig.fadeIn,
        fadeOut: options.fadeOut ?? actionConfig.fadeOut,
        timeScale: options.timeScale ?? DEFAULT_OPTIONS.timeScale,
      };
    } else {
      file = name;
      opts = { ...DEFAULT_OPTIONS, ...options };
    }

    // If already playing something, queue this animation
    if (this.animationGraph?.isGesturePlaying()) {
      this.queue.push({ name: file, options: opts });
      return true;
    }

    // Check for procedural test animations
    if (name === 'test_wave') {
      const clip = this.createProceduralWave();
      if (clip) {
        return this.playClipViaGraph(clip, 'test_wave', opts);
      }
      return false;
    }

    // Lazy-load gesture animation (may have small delay on first use, then cached)
    console.log('[AnimationPlayer] Loading:', file);
    const animData = await animationLibrary.load(file);
    if (!animData) {
      console.warn('[AnimationPlayer] Failed to load:', file);
      return false;
    }
    console.log('[AnimationPlayer] Loaded:', file, 'type:', animData.type, 'tracks:', animData.clip.tracks.length);

    return this.playClip(animData, opts);
  }

  /**
   * Create a procedural wave animation for testing
   */
  private createProceduralWave(): THREE.AnimationClip | null {
    if (!this.vrm.humanoid) return null;

    const rightUpperArm = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const rightLowerArm = this.vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

    if (!rightUpperArm || !rightLowerArm) {
      return null;
    }

    const duration = 2.0;
    const tracks: THREE.KeyframeTrack[] = [];

    const upperArmTimes = [0, 0.5, 1.5, 2.0];
    const upperArmValues = [
      0, 0, 0, 1,
      0, 0, -0.6, 0.8,
      0, 0, -0.6, 0.8,
      0, 0, 0, 1,
    ];
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${rightUpperArm.name}.quaternion`,
      upperArmTimes,
      upperArmValues
    ));

    const lowerArmTimes = [0, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 2.0];
    const lowerArmValues = [
      0, 0, 0, 1,
      0.2, 0, 0, 0.98,
      0.3, 0, 0, 0.95,
      0.1, 0, 0, 0.99,
      0.3, 0, 0, 0.95,
      0.1, 0, 0, 0.99,
      0.2, 0, 0, 0.98,
      0, 0, 0, 1,
    ];
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${rightLowerArm.name}.quaternion`,
      lowerArmTimes,
      lowerArmValues
    ));

    return new THREE.AnimationClip('test_wave', duration, tracks);
  }

  /**
   * Play a clip via AnimationGraph (for procedural animations)
   */
  private playClipViaGraph(clip: THREE.AnimationClip, name: string, options: Required<PlayOptions>): boolean {
    if (!this.animationGraph) return false;

    this.animationGraph.playCrossfade(clip, {
      fadeIn: options.fadeIn,
      fadeOut: options.fadeOut,
      loop: options.loop,
      timeScale: options.timeScale,
    });

    this.currentAnimationName = name;

    // Schedule cleanup tracking
    if (!options.loop) {
      const duration = clip.duration / options.timeScale;
      setTimeout(() => {
        if (this.currentAnimationName === name) {
          this.currentAnimationName = null;
          this.playNextInQueue();
        }
      }, (duration + options.fadeOut) * 1000);
    }

    return true;
  }

  /**
   * Play a loaded animation clip
   */
  private playClip(animData: AnimationClipData, options: Required<PlayOptions>): boolean {
    const { clip, type } = animData;

    // VRMA and FBX clips are already retargeted by AnimationLibrary
    // Only GLB needs retargeting here (legacy BVH-style naming)
    const finalClip = (type === 'vrma' || type === 'fbx') ? clip : this.retargetToVRM(clip);

    if (!this.animationGraph) return false;

    this.animationGraph.playCrossfade(finalClip, {
      fadeIn: options.fadeIn,
      fadeOut: options.fadeOut,
      loop: options.loop,
      timeScale: options.timeScale,
    });

    this.currentAnimationName = animData.name;

    // Schedule cleanup tracking for non-looping
    if (!options.loop) {
      const duration = finalClip.duration / options.timeScale;
      setTimeout(() => {
        if (this.currentAnimationName === animData.name) {
          this.currentAnimationName = null;
          this.playNextInQueue();
        }
      }, (duration + options.fadeOut) * 1000);
    }

    return true;
  }

  /**
   * Play next queued animation or clean up
   */
  private playNextInQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.play(next.name, next.options);
    }
  }

  /**
   * Retarget animation clip to VRM bone names
   */
  private retargetToVRM(clip: THREE.AnimationClip): THREE.AnimationClip {
    const boneMap: Record<string, string> = {
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

    const skipBones = new Set(['joint_Root', 'Armature', 'Root']);

    const bvhOnlyBones = new Set([
      'Spine', 'Chest', 'Neck', 'Head',
      'Shoulder_L', 'UpperArm_L', 'LowerArm_L', 'Hand_L',
      'Shoulder_R', 'UpperArm_R', 'LowerArm_R', 'Hand_R',
      'Hips', 'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'Toes_L',
      'UpperLeg_R', 'LowerLeg_R', 'Foot_R', 'Toes_R',
    ]);

    const isMixamo = clip.tracks.some(t => t.name.includes('mixamorig'));

    const vrmBoneNodes: Record<string, THREE.Object3D> = {};
    if (this.vrm.humanoid) {
      for (const [srcName, vrmName] of Object.entries(boneMap)) {
        const node = this.vrm.humanoid.getNormalizedBoneNode(vrmName as any);
        if (node) {
          vrmBoneNodes[srcName] = node;
        }
      }
    }

    const newTracks: THREE.KeyframeTrack[] = [];

    for (const track of clip.tracks) {
      const dotIndex = track.name.indexOf('.');
      if (dotIndex === -1) continue;

      const boneName = track.name.substring(0, dotIndex);
      const property = track.name.substring(dotIndex + 1);

      if (skipBones.has(boneName)) continue;

      if (!isMixamo && bvhOnlyBones.has(boneName)) {
        const upperBodyBvh = ['Spine', 'Chest', 'Neck', 'Head',
          'Shoulder_L', 'UpperArm_L', 'LowerArm_L', 'Hand_L',
          'Shoulder_R', 'UpperArm_R', 'LowerArm_R', 'Hand_R'];
        if (!upperBodyBvh.includes(boneName)) continue;
      }

      if (property === 'position' || property === 'translation') continue;

      const vrmNode = vrmBoneNodes[boneName];
      if (!vrmNode) continue;

      const newTrackName = `${vrmNode.name}.${property}`;
      const newTrack = track.clone();
      newTrack.name = newTrackName;
      newTracks.push(newTrack);
    }

    return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
  }

  /**
   * Stop current animation
   */
  stop(fadeOut: number = 0.25): void {
    if (this.animationGraph) {
      this.animationGraph.stopGesture(fadeOut);
    }
    this.currentAnimationName = null;
    this.queue = [];
  }

  /**
   * Update - no-op since AnimationGraph owns the mixer now
   */
  update(_deltaTime: number): void {
    // AnimationGraph.update() handles mixer updates
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.animationGraph?.isGesturePlaying() ?? false;
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
    // AnimationGraph handles cleanup
  }
}

export default AnimationPlayer;
