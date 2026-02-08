/**
 * LookAt System - Eyes via VRM + Manual Head Tracking
 * 
 * VRM's built-in lookAt only handles eyes (bone or expression type).
 * Head tracking must be done manually by rotating head/neck bones.
 * 
 * Architecture:
 * - Eyes: VRM handles via vrm.lookAt.target + vrm.update()
 * - Head: We manually rotate head bone toward target with constraints
 * 
 * ## Why Two Code Paths (VRM 0.x vs 1.0)?
 * 
 * VRM versions have different coordinate systems:
 * - VRM 0.x: Model faces -Z in local space (like Unity default)
 * - VRM 1.0: Model faces +Z in local space (glTF standard)
 * 
 * Even though VRMUtils.rotateVRM0() rotates the scene for visual consistency,
 * the bone-local coordinate system remains different. When calculating head
 * rotation from camera direction in avatar-local space:
 * 
 * VRM 0.x: targetYaw = atan2(-toCamera.x, -toCamera.z)
 *          (forward is -Z, negate both for correct direction)
 * 
 * VRM 1.0: targetYaw = atan2(toCamera.x, toCamera.z)
 *          (forward is +Z, use as-is)
 * 
 * The pitch calculation also differs due to the Y-axis relationship with
 * the forward direction in each coordinate system.
 * 
 * Detection: vrm.meta.metaVersion === '0' for VRM 0.x, '1' for VRM 1.0
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export interface LookAtConfig {
  enabled: boolean;
  headTrackingEnabled: boolean;
  // Head rotation limits (degrees)
  maxYaw: number;        // Left/right
  maxPitchUp: number;    // Looking up (positive pitch)
  maxPitchDown: number;  // Looking down (negative pitch)
  // How much of the look direction head follows (0-1)
  headWeight: number;
  // Smoothing speed (higher = faster response)
  smoothSpeed: number;
}

const DEFAULT_CONFIG: LookAtConfig = {
  enabled: true,
  headTrackingEnabled: true,
  maxYaw: 30,
  maxPitchUp: 25,      // Can look up more
  maxPitchDown: 15,    // Less range looking down
  headWeight: 0.4,
  smoothSpeed: 6,
};

export class LookAtSystem {
  private vrm: VRM;
  private camera: THREE.Camera | null = null;
  private config: LookAtConfig;
  
  // The target Object3D that VRM looks at (for eyes)
  private lookAtTarget: THREE.Object3D;
  
  // Head tracking state
  private headBone: THREE.Object3D | null = null;
  private headRestQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private currentHeadYaw: number = 0;
  private currentHeadPitch: number = 0;
  
  // Debug info
  private _lastAngle: number = 0;
  private _hasLookAt: boolean = false;
  private _lookAtType: string = 'none';
  private _isVRM0: boolean = false;

  // External glance offset (from HeadGlanceSystem)
  private externalGlanceYaw: number = 0;
  private externalGlancePitch: number = 0;

  // Reusable objects (avoid GC)
  private _tempVec3: THREE.Vector3 = new THREE.Vector3();
  private _tempVec3B: THREE.Vector3 = new THREE.Vector3();
  private _tempQuat: THREE.Quaternion = new THREE.Quaternion();
  private _tempQuat2: THREE.Quaternion = new THREE.Quaternion();
  private _tempEuler: THREE.Euler = new THREE.Euler();

  constructor(vrm: VRM, config: Partial<LookAtConfig> = {}) {
    this.vrm = vrm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._hasLookAt = !!vrm.lookAt;
    
    // Detect lookAt type
    if (vrm.lookAt) {
      const applier = vrm.lookAt.applier as { type?: string } | undefined;
      this._lookAtType = applier?.type || 'unknown';
    }

    // Detect VRM version (0.x vs 1.0)
    // metaVersion is '0' for VRM 0.x, '1' for VRM 1.0
    const meta = vrm.meta as { metaVersion?: string };
    this._isVRM0 = meta?.metaVersion === '0';

    // Create the lookAt target Object3D for eyes
    this.lookAtTarget = new THREE.Object3D();
    this.lookAtTarget.name = 'LookAtTarget';

    // Set up VRM lookAt for eyes
    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookAtTarget;
    }

    // Get head bone and store rest pose
    this.headBone = vrm.humanoid?.getNormalizedBoneNode('head') || null;
    if (this.headBone) {
      this.headRestQuaternion.copy(this.headBone.quaternion);
    }

    console.log('[LookAtSystem] Init:', {
      hasVrmLookAt: this._hasLookAt,
      lookAtType: this._lookAtType,
      isVRM0: this._isVRM0,
      metaVersion: meta?.metaVersion,
      hasHeadBone: !!this.headBone,
      headRestQuat: this.headBone ? {
        x: this.headRestQuaternion.x.toFixed(3),
        y: this.headRestQuaternion.y.toFixed(3),
        z: this.headRestQuaternion.z.toFixed(3),
        w: this.headRestQuaternion.w.toFixed(3),
      } : null,
    });
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    
    // Add lookAtTarget as child of camera (for eye tracking)
    camera.add(this.lookAtTarget);
    
    // Position target at camera position (0,0,0 in camera local space)
    this.lookAtTarget.position.set(0, 0, 0);
    
    console.log('[LookAtSystem] Camera set');
  }

  setConfig(config: Partial<LookAtConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    
    if (!enabled && this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
    } else if (enabled && this.vrm.lookAt) {
      this.vrm.lookAt.target = this.lookAtTarget;
    }
    
    // Reset head to rest pose when disabled
    if (!enabled && this.headBone) {
      this.headBone.quaternion.copy(this.headRestQuaternion);
      this.currentHeadYaw = 0;
      this.currentHeadPitch = 0;
    }
  }

  /**
   * Set glance offset from external source (HeadGlanceSystem).
   * These offsets are added to the camera tracking direction.
   */
  setGlanceOffset(yaw: number, pitch: number): void {
    this.externalGlanceYaw = yaw;
    this.externalGlancePitch = pitch;
  }

  /**
   * Update head tracking
   * Eyes are handled by VRM automatically via vrm.update()
   */
  update(deltaTime: number): void {
    if (!this.config.enabled) return;
    if (!this.camera) return;

    // Calculate direction to camera
    const headBone = this.headBone;
    if (!headBone) return;

    // Get head world position
    const headWorldPos = this._tempVec3;
    headBone.getWorldPosition(headWorldPos);

    // Get camera world position
    const camWorldPos = this._tempVec3B;
    this.camera.getWorldPosition(camWorldPos);

    // Direction from head to camera
    const toCamera = camWorldPos.sub(headWorldPos);

    // Get avatar's world rotation to transform to local space
    const avatarWorldQuat = this._tempQuat;
    this.vrm.scene.getWorldQuaternion(avatarWorldQuat);

    // Transform direction to avatar local space (reuse temp quat to avoid clone)
    const avatarWorldQuatInverse = this._tempQuat2.copy(avatarWorldQuat).invert();
    toCamera.applyQuaternion(avatarWorldQuatInverse);

    // Calculate yaw (Y rotation) and pitch (X rotation) in degrees
    const horizontalDist = Math.sqrt(toCamera.x * toCamera.x + toCamera.z * toCamera.z);

    let targetYaw: number;
    let targetPitch: number;

    if (this._isVRM0) {
      targetYaw = Math.atan2(-toCamera.x, -toCamera.z) * (180 / Math.PI);
      targetPitch = Math.atan2(toCamera.y - 0.1, horizontalDist) * (180 / Math.PI);
    } else {
      targetYaw = Math.atan2(toCamera.x, toCamera.z) * (180 / Math.PI);
      targetPitch = Math.atan2(-(toCamera.y - 0.1), horizontalDist) * (180 / Math.PI);
    }

    // Apply external glance offset (from HeadGlanceSystem)
    targetYaw += this.externalGlanceYaw;
    targetPitch += this.externalGlancePitch;

    // Store for debug
    this._lastAngle = Math.abs(targetYaw);

    // Head tracking
    if (this.config.headTrackingEnabled && this.headBone) {
      this.updateHeadTracking(targetYaw, targetPitch, deltaTime);
    }
  }

  /**
   * Apply head rotation toward target with constraints and smoothing
   */
  private updateHeadTracking(targetYaw: number, targetPitch: number, deltaTime: number): void {
    if (!this.headBone) return;

    const { maxYaw, maxPitchUp, maxPitchDown, headWeight, smoothSpeed } = this.config;

    // Apply weight (head follows partially, eyes do the rest)
    let headYaw = targetYaw * headWeight;
    let headPitch = targetPitch * headWeight;

    // Clamp to limits (asymmetric pitch: up is positive, down is negative)
    headYaw = Math.max(-maxYaw, Math.min(maxYaw, headYaw));
    headPitch = Math.max(-maxPitchDown, Math.min(maxPitchUp, headPitch));

    // Smooth interpolation
    const t = 1 - Math.exp(-smoothSpeed * deltaTime);
    this.currentHeadYaw += (headYaw - this.currentHeadYaw) * t;
    this.currentHeadPitch += (headPitch - this.currentHeadPitch) * t;

    // Apply rotation on top of rest pose
    // Order: Y (yaw) then X (pitch)
    const euler = this._tempEuler;
    euler.set(
      this.currentHeadPitch * (Math.PI / 180),
      this.currentHeadYaw * (Math.PI / 180),
      0,
      'YXZ'
    );

    const rotationQuat = this._tempQuat;
    rotationQuat.setFromEuler(euler);

    // Combine with rest pose
    this.headBone.quaternion.copy(this.headRestQuaternion);
    this.headBone.quaternion.multiply(rotationQuat);
  }

  getState() {
    return {
      enabled: this.config.enabled,
      headTrackingEnabled: this.config.headTrackingEnabled,
      angleToCamera: this._lastAngle,
      currentHeadYaw: this.currentHeadYaw,
      currentHeadPitch: this.currentHeadPitch,
      hasCamera: !!this.camera,
      hasHeadBone: !!this.headBone,
      hasVrmLookAt: this._hasLookAt,
      lookAtType: this._lookAtType,
      isVRM0: this._isVRM0,
      config: this.config,
    };
  }

  dispose(): void {
    if (this.camera) {
      this.camera.remove(this.lookAtTarget);
    }
    this.camera = null;
    
    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
    }
    
    // Reset head to rest pose
    if (this.headBone) {
      this.headBone.quaternion.copy(this.headRestQuaternion);
    }
  }
}

export default LookAtSystem;
