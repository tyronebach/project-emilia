/**
 * Avatar System Type Definitions
 */

import type { VRM } from '@pixiv/three-vrm';
import type * as THREE from 'three';

export interface AvatarRendererOptions {
  vrmUrl?: string;
  backgroundColor?: number;
  cameraDistance?: number;
  cameraHeight?: number;
  enableShadows?: boolean;
  enableOrbitControls?: boolean;
  onLoad?: (vrm: VRM) => void;
  onError?: (error: Error) => void;
  onProgress?: (percent: number) => void;
}

export interface Rotation3D {
  x: number;
  y: number;
  z: number;
}

export interface Position1D {
  y: number;
}

export interface AlignmentData {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
}

export interface TimingEntry {
  char: string;
  startMs: number;
  endMs: number;
  viseme: string;
}

export type AppStatus = 'ready' | 'recording' | 'thinking' | 'speaking' | 'error';

export type { VRM };
export type Bone = THREE.Object3D | null;
