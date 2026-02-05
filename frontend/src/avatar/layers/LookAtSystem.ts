/**
 * LookAt System
 * Controls eye gaze and head tracking toward camera.
 * Returns to "home" position when camera exceeds angle threshold.
 * Applies AFTER bone animations so it takes priority.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/** Target types for look-at tracking */
export type LookAtTarget =
  | { type: 'camera' }                     // Track camera (user)
  | { type: 'point'; position: THREE.Vector3 }  // Track world point
  | { type: 'wander' }                     // Random gentle wandering
  | { type: 'fixed'; direction: THREE.Vector3 } // Fixed direction

export interface LookAtConfig {
  /** Max angle in degrees before returning to home (default: 35) */
  maxAngle: number;
  /** How much eyes move relative to target (0-1, default: 1.0) */
  eyeWeight: number;
  /** How much head moves relative to target (0-1, default: 0.25) */
  headWeight: number;
  /** Smoothing speed (higher = faster, default: 8) */
  smoothSpeed: number;
  /** Enable/disable system */
  enabled: boolean;
}

const DEFAULT_CONFIG: LookAtConfig = {
  maxAngle: 35,
  eyeWeight: 1.0,
  headWeight: 0.25,
  smoothSpeed: 8,
  enabled: true,
};

export class LookAtSystem {
  private vrm: VRM;
  private camera: THREE.Camera | null = null;
  private config: LookAtConfig;
  private target: LookAtTarget = { type: 'camera' };

  // Current interpolated angles (radians)
  private currentYaw: number = 0;
  private currentPitch: number = 0;

  // Home position (straight ahead)
  private readonly homeYaw: number = 0;
  private readonly homePitch: number = 0;

  // Wander state
  private wanderYaw: number = 0;
  private wanderPitch: number = 0;
  private wanderTimer: number = 0;
  private wanderInterval: number = 2.5; // seconds between wander updates

  // Cached objects
  private headWorldPos = new THREE.Vector3();
  private headWorldQuat = new THREE.Quaternion();
  private tempVec = new THREE.Vector3();
  private tempQuat = new THREE.Quaternion();

  // Bone references
  private headBone: THREE.Object3D | null = null;
  private leftEyeBone: THREE.Object3D | null = null;
  private rightEyeBone: THREE.Object3D | null = null;
  private neckBone: THREE.Object3D | null = null;

  // Original rotations (captured after animation applies)
  private headOriginalQuat = new THREE.Quaternion();
  private neckOriginalQuat = new THREE.Quaternion();

  constructor(vrm: VRM, config: Partial<LookAtConfig> = {}) {
    this.vrm = vrm;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.cacheBones();
    console.log('[LookAtSystem] Initialized', {
      hasHead: !!this.headBone,
      hasNeck: !!this.neckBone,
      hasEyes: !!(this.leftEyeBone && this.rightEyeBone),
      hasVrmLookAt: !!vrm.lookAt,
    });
  }

  private cacheBones(): void {
    if (!this.vrm.humanoid) return;

    // Use normalized bones (we apply after VRM copies to raw)
    this.headBone = this.vrm.humanoid.getNormalizedBoneNode('head');
    this.neckBone = this.vrm.humanoid.getNormalizedBoneNode('neck');
    this.leftEyeBone = this.vrm.humanoid.getNormalizedBoneNode('leftEye');
    this.rightEyeBone = this.vrm.humanoid.getNormalizedBoneNode('rightEye');
  }

  /**
   * Set camera to track
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Set look-at target
   */
  setTarget(target: LookAtTarget): void {
    this.target = target;
    // Reset wander timer when switching to wander mode
    if (target.type === 'wander') {
      this.wanderTimer = 0;
      this.updateWanderTarget();
    }
  }

  /**
   * Get current target
   */
  getTarget(): LookAtTarget {
    return this.target;
  }

  /**
   * Update config
   */
  setConfig(config: Partial<LookAtConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable/disable
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Update wander target with random offset
   */
  private updateWanderTarget(): void {
    const maxWander = 15 * (Math.PI / 180); // 15 degrees max wander
    this.wanderYaw = (Math.random() - 0.5) * 2 * maxWander;
    this.wanderPitch = (Math.random() - 0.5) * maxWander; // Less vertical
  }

  /**
   * Update each frame - call AFTER animation mixer update, BEFORE vrm.update()
   */
  update(deltaTime: number): void {
    if (!this.config.enabled) return;

    // Get target angles based on current target type
    const { targetYaw, targetPitch } = this.getTargetAngles(deltaTime);

    // Smooth interpolation
    const lerpFactor = 1 - Math.exp(-this.config.smoothSpeed * deltaTime);
    this.currentYaw += (targetYaw - this.currentYaw) * lerpFactor;
    this.currentPitch += (targetPitch - this.currentPitch) * lerpFactor;

    // Apply to bones
    this.applyToHead();
    this.applyToEyes();
  }

  /**
   * Get target angles based on current target type
   */
  private getTargetAngles(deltaTime: number): { targetYaw: number; targetPitch: number } {
    switch (this.target.type) {
      case 'camera': {
        if (!this.camera) return { targetYaw: this.homeYaw, targetPitch: this.homePitch };
        const { yaw, pitch, isInRange } = this.calculateAnglesTo(this.camera.position);
        return {
          targetYaw: isInRange ? yaw : this.homeYaw,
          targetPitch: isInRange ? pitch : this.homePitch,
        };
      }
      
      case 'point': {
        const { yaw, pitch, isInRange } = this.calculateAnglesTo(this.target.position);
        return {
          targetYaw: isInRange ? yaw : this.homeYaw,
          targetPitch: isInRange ? pitch : this.homePitch,
        };
      }
      
      case 'wander': {
        // Update wander target periodically
        this.wanderTimer += deltaTime;
        if (this.wanderTimer >= this.wanderInterval) {
          this.wanderTimer = 0;
          this.updateWanderTarget();
        }
        return { targetYaw: this.wanderYaw, targetPitch: this.wanderPitch };
      }
      
      case 'fixed': {
        // Calculate angles to look in the fixed direction
        const { yaw, pitch } = this.calculateAnglesFromDirection(this.target.direction);
        return { targetYaw: yaw, targetPitch: pitch };
      }
      
      default:
        return { targetYaw: this.homeYaw, targetPitch: this.homePitch };
    }
  }

  /**
   * Calculate yaw/pitch to a world position and whether it's in range
   */
  private calculateAnglesTo(targetPos: THREE.Vector3): { yaw: number; pitch: number; isInRange: boolean } {
    if (!this.headBone) {
      return { yaw: 0, pitch: 0, isInRange: true };
    }

    // Get head world position
    this.headBone.getWorldPosition(this.headWorldPos);

    // Direction from head to target
    this.tempVec.subVectors(targetPos, this.headWorldPos);
    this.tempVec.normalize();

    // Get head's forward direction in world space
    this.headBone.getWorldQuaternion(this.headWorldQuat);
    const headForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.headWorldQuat);

    // Calculate angles relative to head's forward
    // Yaw = horizontal angle, Pitch = vertical angle
    const yaw = Math.atan2(this.tempVec.x, this.tempVec.z) - Math.atan2(headForward.x, headForward.z);
    const pitch = Math.asin(this.tempVec.y) - Math.asin(headForward.y);

    // Check if within max angle threshold
    const maxAngleRad = (this.config.maxAngle * Math.PI) / 180;
    const totalAngle = Math.sqrt(yaw * yaw + pitch * pitch);
    const isInRange = totalAngle <= maxAngleRad;

    // Clamp angles even when in range (don't break neck)
    const clampedYaw = Math.max(-maxAngleRad, Math.min(maxAngleRad, yaw));
    const clampedPitch = Math.max(-maxAngleRad * 0.6, Math.min(maxAngleRad * 0.6, pitch));

    return { yaw: clampedYaw, pitch: clampedPitch, isInRange };
  }

  /**
   * Calculate angles from a direction vector
   */
  private calculateAnglesFromDirection(direction: THREE.Vector3): { yaw: number; pitch: number } {
    const normalizedDir = direction.clone().normalize();
    const yaw = Math.atan2(normalizedDir.x, normalizedDir.z);
    const pitch = Math.asin(normalizedDir.y);
    
    // Clamp to max angles
    const maxAngleRad = (this.config.maxAngle * Math.PI) / 180;
    return {
      yaw: Math.max(-maxAngleRad, Math.min(maxAngleRad, yaw)),
      pitch: Math.max(-maxAngleRad * 0.6, Math.min(maxAngleRad * 0.6, pitch)),
    };
  }

  /**
   * Apply look-at rotation to head (and neck for natural movement)
   */
  private applyToHead(): void {
    if (!this.headBone || this.config.headWeight <= 0) return;

    const headYaw = this.currentYaw * this.config.headWeight;
    const headPitch = this.currentPitch * this.config.headWeight;

    // Create rotation quaternion for look-at
    // Apply as additional rotation on top of animation
    this.tempQuat.setFromEuler(new THREE.Euler(headPitch, headYaw, 0, 'YXZ'));

    // Multiply with current rotation (additive)
    this.headBone.quaternion.multiply(this.tempQuat);

    // Apply smaller portion to neck for natural movement
    if (this.neckBone && this.config.headWeight > 0.1) {
      const neckWeight = this.config.headWeight * 0.3;
      this.tempQuat.setFromEuler(new THREE.Euler(
        headPitch * neckWeight,
        headYaw * neckWeight,
        0,
        'YXZ'
      ));
      this.neckBone.quaternion.multiply(this.tempQuat);
    }
  }

  /**
   * Apply look-at to eye bones (if available) or VRM lookAt
   */
  private applyToEyes(): void {
    if (this.config.eyeWeight <= 0) return;

    const eyeYaw = this.currentYaw * this.config.eyeWeight;
    const eyePitch = this.currentPitch * this.config.eyeWeight;

    // Use VRM's lookAt system if available (handles expression-based eyes)
    if (this.vrm.lookAt) {
      // VRM lookAt expects a world-space target point
      // Calculate target point in front of avatar at the look direction
      this.headBone?.getWorldPosition(this.headWorldPos);
      const lookDistance = 5;
      const lookTarget = new THREE.Vector3(
        this.headWorldPos.x + Math.sin(eyeYaw) * lookDistance,
        this.headWorldPos.y + Math.sin(eyePitch) * lookDistance,
        this.headWorldPos.z + Math.cos(eyeYaw) * lookDistance
      );
      this.vrm.lookAt.target = lookTarget;
      return;
    }

    // Fallback: Direct eye bone manipulation
    if (this.leftEyeBone && this.rightEyeBone) {
      this.tempQuat.setFromEuler(new THREE.Euler(eyePitch, eyeYaw, 0, 'YXZ'));
      this.leftEyeBone.quaternion.copy(this.tempQuat);
      this.rightEyeBone.quaternion.copy(this.tempQuat);
    }
  }

  /**
   * Get current look angles for debugging
   */
  getState(): { yaw: number; pitch: number; yawDeg: number; pitchDeg: number } {
    return {
      yaw: this.currentYaw,
      pitch: this.currentPitch,
      yawDeg: (this.currentYaw * 180) / Math.PI,
      pitchDeg: (this.currentPitch * 180) / Math.PI,
    };
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.camera = null;
  }
}

export default LookAtSystem;
