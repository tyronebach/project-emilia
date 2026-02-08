/**
 * Idle Micro Behaviors
 * Procedural micro-movements during idle that reflect emotional state.
 * 
 * Handles:
 * - Head glances (look away, return)
 * - Head micro-tilts
 * - Eye twitches (via blink channel)
 * 
 * State-driven: different profiles for different emotional states.
 * Runs after LookAt, applies additively.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ExpressionMixer } from '../expression/ExpressionMixer';

// ============================================================
// MICRO PROFILE DEFINITION
// ============================================================

export interface MicroProfile {
  name: string;
  
  // Head glances
  glanceEnabled: boolean;
  glanceIntervalMin: number;      // seconds between glances
  glanceIntervalMax: number;
  glanceYawRange: number;         // max degrees left/right
  glancePitchRange: number;       // max degrees up/down
  glanceHoldDuration: number;     // how long to hold glance
  glanceSmoothSpeed: number;      // transition speed
  
  // Head micro-tilts (subtle roll)
  tiltEnabled: boolean;
  tiltIntervalMin: number;
  tiltIntervalMax: number;
  tiltRange: number;              // max degrees
  tiltHoldDuration: number;
  
  // Eye twitches (quick partial blinks)
  twitchEnabled: boolean;
  twitchChance: number;           // chance per glance interval (0-1)
  twitchIntensity: number;        // how closed (0-1)
  twitchDuration: number;         // ms
}

// ============================================================
// DEFAULT PROFILES
// ============================================================

const PROFILES: Record<string, MicroProfile> = {
  neutral: {
    name: 'neutral',
    glanceEnabled: true,
    glanceIntervalMin: 4,
    glanceIntervalMax: 10,
    glanceYawRange: 20,
    glancePitchRange: 8,
    glanceHoldDuration: 1.0,
    glanceSmoothSpeed: 4,
    tiltEnabled: true,
    tiltIntervalMin: 8,
    tiltIntervalMax: 15,
    tiltRange: 5,
    tiltHoldDuration: 2.0,
    twitchEnabled: true,
    twitchChance: 0.05,
    twitchIntensity: 0.3,
    twitchDuration: 80,
  },
  
  relaxed: {
    name: 'relaxed',
    glanceEnabled: true,
    glanceIntervalMin: 8,
    glanceIntervalMax: 16,
    glanceYawRange: 12,
    glancePitchRange: 5,
    glanceHoldDuration: 1.5,
    glanceSmoothSpeed: 3,
    tiltEnabled: true,
    tiltIntervalMin: 12,
    tiltIntervalMax: 20,
    tiltRange: 3,
    tiltHoldDuration: 3.0,
    twitchEnabled: false,
    twitchChance: 0,
    twitchIntensity: 0,
    twitchDuration: 0,
  },
  
  anxious: {
    name: 'anxious',
    glanceEnabled: true,
    glanceIntervalMin: 1.5,
    glanceIntervalMax: 4,
    glanceYawRange: 35,
    glancePitchRange: 12,
    glanceHoldDuration: 0.5,
    glanceSmoothSpeed: 8,
    tiltEnabled: true,
    tiltIntervalMin: 3,
    tiltIntervalMax: 7,
    tiltRange: 8,
    tiltHoldDuration: 0.8,
    twitchEnabled: true,
    twitchChance: 0.25,
    twitchIntensity: 0.5,
    twitchDuration: 60,
  },
  
  excited: {
    name: 'excited',
    glanceEnabled: true,
    glanceIntervalMin: 2,
    glanceIntervalMax: 5,
    glanceYawRange: 28,
    glancePitchRange: 10,
    glanceHoldDuration: 0.7,
    glanceSmoothSpeed: 6,
    tiltEnabled: true,
    tiltIntervalMin: 4,
    tiltIntervalMax: 8,
    tiltRange: 6,
    tiltHoldDuration: 1.0,
    twitchEnabled: true,
    twitchChance: 0.1,
    twitchIntensity: 0.4,
    twitchDuration: 70,
  },
  
  sad: {
    name: 'sad',
    glanceEnabled: true,
    glanceIntervalMin: 6,
    glanceIntervalMax: 12,
    glanceYawRange: 15,
    glancePitchRange: 10,  // looks down more
    glanceHoldDuration: 2.0,
    glanceSmoothSpeed: 2,
    tiltEnabled: true,
    tiltIntervalMin: 10,
    tiltIntervalMax: 18,
    tiltRange: 4,
    tiltHoldDuration: 2.5,
    twitchEnabled: false,
    twitchChance: 0,
    twitchIntensity: 0,
    twitchDuration: 0,
  },
  
  thinking: {
    name: 'thinking',
    glanceEnabled: true,
    glanceIntervalMin: 3,
    glanceIntervalMax: 7,
    glanceYawRange: 25,
    glancePitchRange: 15,  // looks up when thinking
    glanceHoldDuration: 1.2,
    glanceSmoothSpeed: 3,
    tiltEnabled: true,
    tiltIntervalMin: 5,
    tiltIntervalMax: 10,
    tiltRange: 7,
    tiltHoldDuration: 1.5,
    twitchEnabled: false,
    twitchChance: 0,
    twitchIntensity: 0,
    twitchDuration: 0,
  },
};

// ============================================================
// IDLE MICRO BEHAVIORS CLASS
// ============================================================

type GlanceState = 'waiting' | 'glancing' | 'returning';
type TiltState = 'waiting' | 'tilting' | 'returning';

export class IdleMicroBehaviors {
  private vrm: VRM;
  private expressionMixer: ExpressionMixer | null = null;
  private enabled: boolean = true;
  private paused: boolean = false;
  
  // Current profile
  private profile: MicroProfile = PROFILES.neutral;
  
  // Head bone
  private headBone: THREE.Object3D | null = null;
  
  // Glance state
  private glanceState: GlanceState = 'waiting';
  private glanceTimer: number = 0;
  private glanceNextTime: number = 0;
  private glanceTargetYaw: number = 0;
  private glanceTargetPitch: number = 0;
  private glanceCurrentYaw: number = 0;
  private glanceCurrentPitch: number = 0;
  
  // Tilt state
  private tiltState: TiltState = 'waiting';
  private tiltTimer: number = 0;
  private tiltNextTime: number = 0;
  private tiltTarget: number = 0;
  private tiltCurrent: number = 0;
  
  // Twitch state
  private twitchActive: boolean = false;
  private twitchTimer: number = 0;
  
  // Temp objects
  private _tempEuler = new THREE.Euler();
  private _tempQuat = new THREE.Quaternion();

  constructor(vrm: VRM, expressionMixer?: ExpressionMixer) {
    this.vrm = vrm;
    this.expressionMixer = expressionMixer ?? null;
    this.headBone = vrm.humanoid?.getNormalizedBoneNode('head') || null;
    
    this.scheduleNextGlance();
    this.scheduleNextTilt();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Set emotional state - loads corresponding profile
   */
  setState(state: string): void {
    const profile = PROFILES[state.toLowerCase()];
    if (profile) {
      this.profile = profile;
      console.log(`[IdleMicroBehaviors] State: ${state}`);
    } else {
      console.warn(`[IdleMicroBehaviors] Unknown state: ${state}, using neutral`);
      this.profile = PROFILES.neutral;
    }
  }

  /**
   * Set custom profile directly
   */
  setProfile(profile: Partial<MicroProfile>): void {
    this.profile = { ...PROFILES.neutral, ...profile };
  }

  /**
   * Get current profile name
   */
  getState(): string {
    return this.profile.name;
  }

  /**
   * Get available states
   */
  static getAvailableStates(): string[] {
    return Object.keys(PROFILES);
  }

  /**
   * Enable/disable all micro behaviors
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Pause during gestures
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.returnToNeutral();
  }

  /**
   * Resume after gestures
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleNextGlance();
    this.scheduleNextTilt();
  }

  /**
   * Update each frame - call AFTER LookAt
   */
  update(deltaTime: number): void {
    if (!this.enabled || this.paused || !this.headBone) return;

    this.updateGlance(deltaTime);
    this.updateTilt(deltaTime);
    this.updateTwitch(deltaTime);
    this.applyToHead();
  }

  /**
   * Get debug state
   */
  getDebugState() {
    return {
      enabled: this.enabled,
      paused: this.paused,
      profile: this.profile.name,
      glanceState: this.glanceState,
      glanceYaw: this.glanceCurrentYaw.toFixed(1),
      glancePitch: this.glanceCurrentPitch.toFixed(1),
      tiltState: this.tiltState,
      tiltAngle: this.tiltCurrent.toFixed(1),
      twitchActive: this.twitchActive,
    };
  }

  dispose(): void {
    this.headBone = null;
    this.expressionMixer = null;
  }

  // ============================================================
  // GLANCE BEHAVIOR
  // ============================================================

  private scheduleNextGlance(): void {
    const { glanceIntervalMin, glanceIntervalMax } = this.profile;
    this.glanceNextTime = glanceIntervalMin + Math.random() * (glanceIntervalMax - glanceIntervalMin);
    this.glanceTimer = 0;
    this.glanceState = 'waiting';
  }

  private updateGlance(deltaTime: number): void {
    if (!this.profile.glanceEnabled) return;

    const { glanceYawRange, glancePitchRange, glanceHoldDuration, glanceSmoothSpeed } = this.profile;

    switch (this.glanceState) {
      case 'waiting':
        this.glanceTimer += deltaTime;
        if (this.glanceTimer >= this.glanceNextTime) {
          // Start glance
          this.glanceTargetYaw = (Math.random() - 0.5) * 2 * glanceYawRange;
          this.glanceTargetPitch = (Math.random() - 0.5) * 2 * glancePitchRange;
          this.glanceState = 'glancing';
          this.glanceTimer = 0;
          
          // Maybe trigger twitch
          this.maybeStartTwitch();
        }
        break;

      case 'glancing':
        this.glanceTimer += deltaTime;
        if (this.glanceTimer >= glanceHoldDuration) {
          this.glanceState = 'returning';
          this.glanceTimer = 0;
        }
        break;

      case 'returning':
        // Check if returned to neutral
        if (Math.abs(this.glanceCurrentYaw) < 0.5 && Math.abs(this.glanceCurrentPitch) < 0.5) {
          this.scheduleNextGlance();
        }
        break;
    }

    // Smooth interpolation
    const target = this.glanceState === 'returning' 
      ? { yaw: 0, pitch: 0 } 
      : { yaw: this.glanceTargetYaw, pitch: this.glanceTargetPitch };
    
    const t = 1 - Math.exp(-glanceSmoothSpeed * deltaTime);
    this.glanceCurrentYaw += (target.yaw - this.glanceCurrentYaw) * t;
    this.glanceCurrentPitch += (target.pitch - this.glanceCurrentPitch) * t;
  }

  // ============================================================
  // TILT BEHAVIOR
  // ============================================================

  private scheduleNextTilt(): void {
    const { tiltIntervalMin, tiltIntervalMax } = this.profile;
    this.tiltNextTime = tiltIntervalMin + Math.random() * (tiltIntervalMax - tiltIntervalMin);
    this.tiltTimer = 0;
    this.tiltState = 'waiting';
  }

  private updateTilt(deltaTime: number): void {
    if (!this.profile.tiltEnabled) return;

    const { tiltRange, tiltHoldDuration } = this.profile;

    switch (this.tiltState) {
      case 'waiting':
        this.tiltTimer += deltaTime;
        if (this.tiltTimer >= this.tiltNextTime) {
          // Start tilt
          this.tiltTarget = (Math.random() - 0.5) * 2 * tiltRange;
          this.tiltState = 'tilting';
          this.tiltTimer = 0;
        }
        break;

      case 'tilting':
        this.tiltTimer += deltaTime;
        if (this.tiltTimer >= tiltHoldDuration) {
          this.tiltState = 'returning';
          this.tiltTimer = 0;
        }
        break;

      case 'returning':
        if (Math.abs(this.tiltCurrent) < 0.3) {
          this.scheduleNextTilt();
        }
        break;
    }

    // Smooth interpolation (slower than glance)
    const target = this.tiltState === 'returning' ? 0 : this.tiltTarget;
    const t = 1 - Math.exp(-2 * deltaTime);
    this.tiltCurrent += (target - this.tiltCurrent) * t;
  }

  // ============================================================
  // TWITCH BEHAVIOR
  // ============================================================

  private maybeStartTwitch(): void {
    if (!this.profile.twitchEnabled) return;
    if (this.twitchActive) return;
    
    if (Math.random() < this.profile.twitchChance) {
      this.twitchActive = true;
      this.twitchTimer = 0;
    }
  }

  private updateTwitch(deltaTime: number): void {
    if (!this.twitchActive || !this.expressionMixer) return;

    this.twitchTimer += deltaTime * 1000; // convert to ms

    const { twitchDuration, twitchIntensity } = this.profile;
    
    if (this.twitchTimer >= twitchDuration) {
      // End twitch
      this.twitchActive = false;
      this.expressionMixer.setExpression('twitch', 'blink', 0);
    } else {
      // Quick close-open pattern
      const progress = this.twitchTimer / twitchDuration;
      const intensity = Math.sin(progress * Math.PI) * twitchIntensity;
      this.expressionMixer.setExpression('twitch', 'blink', intensity);
    }
  }

  // ============================================================
  // APPLY TO HEAD
  // ============================================================

  private applyToHead(): void {
    if (!this.headBone) return;
    
    // Skip if no movement
    const hasGlance = Math.abs(this.glanceCurrentYaw) > 0.1 || Math.abs(this.glanceCurrentPitch) > 0.1;
    const hasTilt = Math.abs(this.tiltCurrent) > 0.1;
    if (!hasGlance && !hasTilt) return;

    // Build rotation: YXZ order (yaw, pitch, roll)
    const euler = this._tempEuler;
    euler.set(
      this.glanceCurrentPitch * (Math.PI / 180),  // pitch (X)
      this.glanceCurrentYaw * (Math.PI / 180),    // yaw (Y)
      this.tiltCurrent * (Math.PI / 180),         // roll (Z) - tilt
      'YXZ'
    );

    const rotationQuat = this._tempQuat;
    rotationQuat.setFromEuler(euler);

    // Multiply on top of current rotation (additive)
    this.headBone.quaternion.multiply(rotationQuat);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private returnToNeutral(): void {
    this.glanceTargetYaw = 0;
    this.glanceTargetPitch = 0;
    this.glanceState = 'returning';
    this.tiltTarget = 0;
    this.tiltState = 'returning';
  }
}

export default IdleMicroBehaviors;
