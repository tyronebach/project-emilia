/**
 * Emilia Animation Trigger System
 * Handles triggered animations (nod, wave, thinking, etc.)
 */

import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Bone, Rotation3D } from './types';
import type { IdleAnimations } from './IdleAnimations';

export class AnimationTrigger {
  private vrm: VRM;
  private currentAnimation: string | null = null;
  private animationTimer: number = 0;
  private animationQueue: string[] = [];

  // Cached bones
  private headBone: Bone;
  private rightUpperArmBone: Bone;
  private rightLowerArmBone: Bone;

  // Original rotations
  private originalRotations: Record<string, Rotation3D> = {};

  // Reference to idle system for pausing
  private idleAnimations: IdleAnimations | null = null;

  constructor(vrm: VRM) {
    this.vrm = vrm;

    // Cache bones
    this.headBone = this.getBone('head');
    this.rightUpperArmBone = this.getBone('rightUpperArm');
    this.rightLowerArmBone = this.getBone('rightLowerArm');

    // Store original rotations
    this.cacheOriginalRotations();

    console.log('[AnimationTrigger] Initialized', {
      hasHead: !!this.headBone,
      hasRightUpperArm: !!this.rightUpperArmBone,
      hasRightLowerArm: !!this.rightLowerArmBone,
      humanoidAvailable: !!this.vrm?.humanoid
    });
  }

  private getBone(name: VRMHumanBoneName): Bone {
    try {
      if (this.vrm?.humanoid) {
        // Try raw bone first (for direct manipulation), then normalized
        const raw = this.vrm.humanoid.getRawBoneNode(name);
        const normalized = this.vrm.humanoid.getNormalizedBoneNode(name);
        const bone = raw || normalized;
        if (!bone) {
          console.log(`[AnimationTrigger] Bone '${name}' not found (raw: ${!!raw}, normalized: ${!!normalized})`);
        }
        return bone;
      }
    } catch (e) {
      console.error(`[AnimationTrigger] Error getting bone '${name}':`, e);
    }
    return null;
  }

  private cacheOriginalRotations(): void {
    const bones: VRMHumanBoneName[] = ['head', 'neck', 'rightUpperArm', 'rightLowerArm'];

    for (const name of bones) {
      const bone = this.getBone(name);
      if (bone) {
        this.originalRotations[name] = {
          x: bone.rotation.x,
          y: bone.rotation.y,
          z: bone.rotation.z
        };
      }
    }
  }

  /**
   * Set reference to idle animation system
   */
  setIdleAnimations(idleAnimations: IdleAnimations): void {
    this.idleAnimations = idleAnimations;
  }

  /**
   * Trigger a named animation
   */
  trigger(name: string): void {
    console.log('[AnimationTrigger] trigger() called with:', name);
    console.log('[AnimationTrigger] Current state:', {
      hasHead: !!this.headBone,
      hasArm: !!this.rightUpperArmBone,
      currentAnimation: this.currentAnimation
    });

    if (this.currentAnimation && name !== this.currentAnimation) {
      console.log('[AnimationTrigger] Queuing animation:', name);
      this.animationQueue.push(name);
      return;
    }

    this.currentAnimation = name;
    this.animationTimer = 0;

    // Pause idle animations
    if (this.idleAnimations) {
      this.idleAnimations.pause();
    }
  }

  isPlaying(): boolean {
    return this.currentAnimation !== null;
  }

  update(deltaTime: number): void {
    if (!this.currentAnimation) {
      if (this.animationQueue.length > 0) {
        this.trigger(this.animationQueue.shift()!);
      }
      return;
    }

    this.animationTimer += deltaTime * 1000;

    switch (this.currentAnimation) {
      case 'nod':
        this.animateNod();
        break;
      case 'head_shake':
      case 'shake':
        this.animateHeadShake();
        break;
      case 'thinking_pose':
      case 'thinking':
        this.animateThinking();
        break;
      case 'wave':
        this.animateWave();
        break;
      case 'surprised':
        this.animateSurprised();
        break;
      default:
        this.finishAnimation();
    }
  }

  private finishAnimation(): void {
    this.resetBones();
    this.currentAnimation = null;
    this.animationTimer = 0;

    if (this.idleAnimations) {
      this.idleAnimations.resume();
    }
  }

  private resetBones(): void {
    for (const [name, rotation] of Object.entries(this.originalRotations)) {
      const bone = this.getBone(name as VRMHumanBoneName);
      if (bone) {
        bone.rotation.x = rotation.x;
        bone.rotation.y = rotation.y;
        bone.rotation.z = rotation.z;
      }
    }
  }

  private animateNod(): void {
    if (!this.headBone) {
      // Fallback: blink rapidly to indicate acknowledgment
      if (this.vrm?.expressionManager) {
        const t = this.animationTimer / 600;
        if (t < 1) {
          const blinkPhase = Math.sin(t * Math.PI * 2);
          this.vrm.expressionManager.setValue('blink', blinkPhase > 0 ? blinkPhase : 0);
        } else {
          this.vrm.expressionManager.setValue('blink', 0);
          this.finishAnimation();
        }
      } else {
        this.finishAnimation();
      }
      return;
    }

    const t = this.animationTimer / 800; // Slightly faster nod
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };

    // Two nods for better visibility
    if (t < 1) {
      const nodAmount = Math.sin(t * Math.PI * 2) * 0.18; // More pronounced
      this.headBone.rotation.x = orig.x + nodAmount;
    } else {
      this.finishAnimation();
    }
  }

  private animateHeadShake(): void {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }

    const t = this.animationTimer / 1000;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };

    if (t < 1) {
      this.headBone.rotation.y = orig.y + (Math.sin(t * Math.PI * 3) * 0.1);
    } else {
      this.finishAnimation();
    }
  }

  private animateThinking(): void {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }

    const t = this.animationTimer / 2000;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };

    if (t < 0.2) {
      const easeT = t / 0.2;
      this.headBone.rotation.z = orig.z + (0.1 * easeT);
      this.headBone.rotation.x = orig.x + (-0.05 * easeT);
    } else if (t < 0.8) {
      this.headBone.rotation.z = orig.z + 0.1;
      this.headBone.rotation.x = orig.x - 0.05;
    } else if (t < 1) {
      const easeT = (t - 0.8) / 0.2;
      this.headBone.rotation.z = orig.z + (0.1 * (1 - easeT));
      this.headBone.rotation.x = orig.x + (-0.05 * (1 - easeT));
    } else {
      this.finishAnimation();
    }
  }

  private animateWave(): void {
    const t = this.animationTimer / 2000;
    const hasArmBones = this.rightUpperArmBone && this.rightLowerArmBone;

    console.log('[AnimationTrigger] animateWave t=', t.toFixed(2), 'hasArm:', hasArmBones);

    if (hasArmBones) {
      const origUpper = this.originalRotations.rightUpperArm || { x: 0, y: 0, z: 0 };
      const origLower = this.originalRotations.rightLowerArm || { x: 0, y: 0, z: 0 };

      if (t < 0.2) {
        const easeT = t / 0.2;
        this.rightUpperArmBone!.rotation.z = origUpper.z + (-1.2 * easeT);
        this.rightLowerArmBone!.rotation.y = origLower.y + (0.5 * easeT);
      } else if (t < 0.8) {
        const waveT = (t - 0.2) / 0.6;
        this.rightUpperArmBone!.rotation.z = origUpper.z - 1.2;
        this.rightLowerArmBone!.rotation.y = origLower.y + 0.5 + (Math.sin(waveT * Math.PI * 4) * 0.3);
      } else if (t < 1) {
        const easeT = (t - 0.8) / 0.2;
        this.rightUpperArmBone!.rotation.z = origUpper.z + (-1.2 * (1 - easeT));
        this.rightLowerArmBone!.rotation.y = origLower.y + (0.5 * (1 - easeT));
      }
    }

    // Happy expression (always do this as fallback visual feedback)
    if (this.vrm?.expressionManager) {
      if (t < 1) {
        const v = t < 0.1 ? t / 0.1 : (t > 0.9 ? (1 - t) / 0.1 : 1);
        this.vrm.expressionManager.setValue('happy', v * 0.7);
      } else {
        this.vrm.expressionManager.setValue('happy', 0);
      }
    }

    // Also do a head nod for wave if no arm bones (more noticeable)
    if (!hasArmBones && this.headBone) {
      const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
      // Side-to-side wave motion with head + slight tilt
      if (t < 0.2) {
        const easeT = t / 0.2;
        this.headBone.rotation.y = orig.y + (0.15 * easeT);
        this.headBone.rotation.z = orig.z + (0.08 * easeT);
      } else if (t < 0.8) {
        // Oscillate side to side
        const waveT = (t - 0.2) / 0.6;
        this.headBone.rotation.y = orig.y + 0.15 * Math.cos(waveT * Math.PI * 3);
        this.headBone.rotation.z = orig.z + 0.08 * Math.cos(waveT * Math.PI * 3);
      } else if (t < 1) {
        const easeT = (t - 0.8) / 0.2;
        this.headBone.rotation.y = orig.y + (0.15 * (1 - easeT));
        this.headBone.rotation.z = orig.z + (0.08 * (1 - easeT));
      }
    }

    if (t >= 1) {
      this.finishAnimation();
    }
  }

  private animateSurprised(): void {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }

    const t = this.animationTimer / 1500;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };

    if (this.vrm?.expressionManager) {
      const v = t < 0.1 ? t / 0.1 : (t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1);
      this.vrm.expressionManager.setValue('surprised', v);
    }

    if (t < 0.15) {
      const easeT = t / 0.15;
      this.headBone.rotation.x = orig.x + (-0.1 * easeT);
    } else if (t < 0.7) {
      this.headBone.rotation.x = orig.x - 0.1;
    } else if (t < 1) {
      const easeT = (t - 0.7) / 0.3;
      this.headBone.rotation.x = orig.x + (-0.1 * (1 - easeT));
    } else {
      if (this.vrm?.expressionManager) {
        this.vrm.expressionManager.setValue('surprised', 0);
      }
      this.finishAnimation();
    }
  }
}

export default AnimationTrigger;
