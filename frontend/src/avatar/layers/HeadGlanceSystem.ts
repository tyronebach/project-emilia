/**
 * Head Glance System
 * Adds procedural head variety during idle - random glances away and back.
 * Separate from LookAt system - works even when camera tracking is disabled.
 * 
 * Only active during idle; disabled during gesture animations.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export interface HeadGlanceConfig {
  enabled: boolean;
  // Glance range (degrees)
  maxYaw: number;
  maxPitch: number;
  // Timing
  glanceIntervalMin: number;  // seconds between glances
  glanceIntervalMax: number;
  glanceDuration: number;     // how long to hold the glance
  // Speed
  smoothSpeed: number;
}

const DEFAULT_CONFIG: HeadGlanceConfig = {
  enabled: true,
  maxYaw: 25,
  maxPitch: 10,
  glanceIntervalMin: 4,
  glanceIntervalMax: 10,
  glanceDuration: 1.0,
  smoothSpeed: 4,
};

type GlanceState = 'idle' | 'glancing' | 'returning';

export class HeadGlanceSystem {
  private vrm: VRM;
  private config: HeadGlanceConfig;
  
  private headBone: THREE.Object3D | null = null;
  private headRestQuaternion = new THREE.Quaternion();
  
  // State
  private state: GlanceState = 'idle';
  private timer: number = 0;
  private nextGlanceTime: number = 0;
  
  // Current glance target
  private targetYaw: number = 0;
  private targetPitch: number = 0;
  
  // Smoothed current values
  private currentYaw: number = 0;
  private currentPitch: number = 0;
  
  // Pause state (during gestures)
  private paused: boolean = false;
  
  // Temp objects to avoid allocation
  private _tempEuler = new THREE.Euler();
  private _tempQuat = new THREE.Quaternion();
  
  // Track if LookAt is handling head (don't double-apply)
  private lookAtActive: boolean = false;

  constructor(vrm: VRM, config: Partial<HeadGlanceConfig> = {}) {
    this.vrm = vrm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Get head bone
    this.headBone = vrm.humanoid?.getNormalizedBoneNode('head') || null;
    if (this.headBone) {
      this.headRestQuaternion.copy(this.headBone.quaternion);
    }
    
    this.scheduleNextGlance();
  }

  setConfig(config: Partial<HeadGlanceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.returnToNeutral();
    }
  }

  /**
   * Pause glances (during gesture animations)
   */
  pause(): void {
    if (this.paused) return;  // Already paused
    this.paused = true;
    this.returnToNeutral();
  }

  /**
   * Resume glances (back to idle)
   */
  resume(): void {
    if (!this.paused) return;  // Already running
    this.paused = false;
    this.scheduleNextGlance();
  }

  /**
   * Tell glance system whether LookAt is handling head rotation.
   * If LookAt is active, we apply glance as offset to LookAt, not directly to bone.
   */
  setLookAtActive(active: boolean): void {
    this.lookAtActive = active;
  }

  /**
   * Get current glance offset (for LookAt to incorporate)
   */
  getGlanceOffset(): { yaw: number; pitch: number } {
    return { yaw: this.currentYaw, pitch: this.currentPitch };
  }

  private scheduleNextGlance(): void {
    const { glanceIntervalMin, glanceIntervalMax } = this.config;
    this.nextGlanceTime = glanceIntervalMin + Math.random() * (glanceIntervalMax - glanceIntervalMin);
    this.timer = 0;
    this.state = 'idle';
  }

  private startGlance(): void {
    const { maxYaw, maxPitch } = this.config;
    
    // Random direction
    this.targetYaw = (Math.random() - 0.5) * 2 * maxYaw;
    this.targetPitch = (Math.random() - 0.5) * 2 * maxPitch;
    
    this.state = 'glancing';
    this.timer = 0;
  }

  private returnToNeutral(): void {
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.state = 'returning';
  }

  /**
   * Update each frame
   */
  update(deltaTime: number): void {
    if (!this.config.enabled || this.paused || !this.headBone) return;

    const { glanceDuration, smoothSpeed } = this.config;

    // State machine
    switch (this.state) {
      case 'idle':
        this.timer += deltaTime;
        if (this.timer >= this.nextGlanceTime) {
          this.startGlance();
        }
        break;

      case 'glancing':
        this.timer += deltaTime;
        if (this.timer >= glanceDuration) {
          this.returnToNeutral();
        }
        break;

      case 'returning':
        // Check if we've returned to neutral
        if (Math.abs(this.currentYaw) < 0.5 && Math.abs(this.currentPitch) < 0.5) {
          this.currentYaw = 0;
          this.currentPitch = 0;
          this.scheduleNextGlance();
        }
        break;
    }

    // Smooth interpolation toward target
    const t = 1 - Math.exp(-smoothSpeed * deltaTime);
    this.currentYaw += (this.targetYaw - this.currentYaw) * t;
    this.currentPitch += (this.targetPitch - this.currentPitch) * t;

    // If LookAt is handling head, don't apply directly - let LookAt read our offset
    if (this.lookAtActive) {
      return;
    }

    // Apply rotation directly to head bone (when LookAt is disabled)
    this.applyToHead();
  }

  /**
   * Apply glance rotation directly to head bone
   */
  private applyToHead(): void {
    if (!this.headBone) return;

    const euler = this._tempEuler;
    euler.set(
      this.currentPitch * (Math.PI / 180),
      this.currentYaw * (Math.PI / 180),
      0,
      'YXZ'
    );

    const rotationQuat = this._tempQuat;
    rotationQuat.setFromEuler(euler);

    // Apply on top of rest pose
    this.headBone.quaternion.copy(this.headRestQuaternion);
    this.headBone.quaternion.multiply(rotationQuat);
  }

  /**
   * Reset head to rest pose
   */
  reset(): void {
    if (this.headBone) {
      this.headBone.quaternion.copy(this.headRestQuaternion);
    }
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.state = 'idle';
    this.scheduleNextGlance();
  }

  getState() {
    return {
      enabled: this.config.enabled,
      paused: this.paused,
      state: this.state,
      currentYaw: this.currentYaw,
      currentPitch: this.currentPitch,
      lookAtActive: this.lookAtActive,
    };
  }

  dispose(): void {
    this.headBone = null;
  }
}

export default HeadGlanceSystem;
