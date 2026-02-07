/**
 * Quality Presets for VRM Avatar Rendering
 * Defines low/medium/high quality tiers with configurable settings
 */

export type QualityPreset = 'low' | 'medium' | 'high' | 'custom';

export interface QualitySettings {
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
  postProcessing: boolean;
  bloom: boolean;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  smaa: boolean;
  alphaToCoverage: boolean;
}

// Helper to get device pixel ratio safely (works in SSR)
const getDevicePixelRatio = () => typeof window !== 'undefined' ? window.devicePixelRatio : 1;

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    pixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    shadowBias: -0.0005,
    shadowNormalBias: 0.02,
    postProcessing: false,
    bloom: false,
    bloomStrength: 0,
    bloomThreshold: 0.5,
    bloomRadius: 0.5,
    smaa: false,
    alphaToCoverage: false,
  },
  medium: {
    pixelRatio: Math.min(getDevicePixelRatio(), 1.5),
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowBias: -0.0005,
    shadowNormalBias: 0.04,
    postProcessing: false,
    bloom: false,
    bloomStrength: 0,
    bloomThreshold: 0.5,
    bloomRadius: 0.5,
    smaa: false,
    alphaToCoverage: true,
  },
  high: {
    pixelRatio: Math.min(getDevicePixelRatio(), 2),
    antialias: false, // SMAA handles anti-aliasing via post-processing
    shadows: true,
    shadowMapSize: 2048,
    shadowBias: -0.0003,
    shadowNormalBias: 0.05,
    postProcessing: true,
    bloom: true,
    bloomStrength: 0.10,
    bloomThreshold: 0.50,
    bloomRadius: 0.85,
    smaa: true,
    alphaToCoverage: true,
  },
};

/**
 * Get a copy of preset settings (safe to modify)
 */
export function getPreset(name: QualityPreset): QualitySettings {
  return { ...(QUALITY_PRESETS[name as keyof typeof QUALITY_PRESETS] ?? QUALITY_PRESETS.medium) };
}

/**
 * Get default quality settings (medium)
 */
export function getDefaultQuality(): QualitySettings {
  return getPreset('medium');
}
