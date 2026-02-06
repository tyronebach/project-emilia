/**
 * LookAt System - Using VRM's built-in lookAt
 * 
 * Based on official three-vrm example:
 * - Create an Object3D as target
 * - Add it as child of camera  
 * - Set vrm.lookAt.target to the Object3D
 * - Let vrm.update() handle the rest
 * 
 * VRM has its own angle limits built-in, so we just let it track continuously.
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export interface LookAtConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: LookAtConfig = {
  enabled: true,
};

export class LookAtSystem {
  private vrm: VRM;
  private camera: THREE.Camera | null = null;
  private config: LookAtConfig;
  
  // The target Object3D that VRM looks at
  private lookAtTarget: THREE.Object3D;
  
  // Debug info
  private _lastAngle: number = 0;
  private _hasLookAt: boolean = false;
  private _lookAtType: string = 'none';
  private _isVRM0: boolean = false;

  constructor(vrm: VRM, config: Partial<LookAtConfig> = {}) {
    this.vrm = vrm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._hasLookAt = !!vrm.lookAt;
    // Type can be 'bone' or 'expression', or check the applier type
    if (vrm.lookAt) {
      // Try different ways to get the type
      const rawType = (vrm.lookAt as any).type;
      const applierType = (vrm.lookAt as any).applier?.type;
      this._lookAtType = rawType || applierType || 'unknown';
      console.log('[LookAtSystem] lookAt object:', {
        type: rawType,
        applierType: applierType,
        autoUpdate: vrm.lookAt.autoUpdate,
        target: vrm.lookAt.target,
      });
    } else {
      this._lookAtType = 'none';
    }

    // Create the lookAt target Object3D
    this.lookAtTarget = new THREE.Object3D();
    this.lookAtTarget.name = 'LookAtTarget';

    // Detect VRM version (0.x vs 1.0)
    // VRM 1.0 has meta.metaVersion, VRM 0.x doesn't
    const meta = vrm.meta as any;
    this._isVRM0 = !meta?.metaVersion;
    
    console.log('[LookAtSystem] Init:', {
      hasVrmLookAt: this._hasLookAt,
      lookAtType: this._lookAtType,
      isVRM0: this._isVRM0,
      metaVersion: meta?.metaVersion,
    });

    // Set up VRM lookAt - let it always track
    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookAtTarget;
      console.log('[LookAtSystem] Target set');
    }
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    
    // Add lookAtTarget as child of camera
    camera.add(this.lookAtTarget);
    
    // Position target at camera position (0,0,0 in camera local space)
    // This makes avatar look directly at where camera is
    this.lookAtTarget.position.set(0, 0, 0);
    
    console.log('[LookAtSystem] Camera set, target at camera position');
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
  }

  /**
   * Update - calculate angle for debug display
   * Eyes are handled by VRM lookAt automatically via vrm.update()
   * Head tracking disabled pending further research
   */
  update(deltaTime: number): void {
    if (!this.config.enabled) return;
    if (!this.camera) return;

    // Calculate angle for debug display only
    const headBone = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!headBone) return;
    
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);

    const camPos = this.camera.position.clone();

    const toCamera = new THREE.Vector3().subVectors(camPos, headPos);
    toCamera.y = 0;
    if (toCamera.length() < 0.01) return;
    toCamera.normalize();

    const worldQuat = new THREE.Quaternion();
    this.vrm.scene.getWorldQuaternion(worldQuat);
    const avatarForward = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
    avatarForward.y = 0;
    if (avatarForward.length() > 0.01) avatarForward.normalize();

    const dot = avatarForward.dot(toCamera);
    this._lastAngle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    
    // Head tracking disabled - eyes only via VRM lookAt
  }

  getState() {
    return {
      blend: this.config.enabled ? 1 : 0,
      enabled: this.config.enabled,
      angleToCamera: this._lastAngle,
      hasCamera: !!this.camera,
      hasHead: !!this.vrm.humanoid?.getNormalizedBoneNode('head'),
      hasNeck: !!this.vrm.humanoid?.getNormalizedBoneNode('neck'),
      hasVrmLookAt: this._hasLookAt,
      lookAtType: this._lookAtType, // "bone" or "expression"
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
  }
}

export default LookAtSystem;
