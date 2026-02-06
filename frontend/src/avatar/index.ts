// Core renderer
export { AvatarRenderer } from './AvatarRenderer';

// Animation controller (new orchestrator)
export { AnimationController } from './AnimationController';
export type { Emotion, GestureOptions } from './AnimationController';

// Expression system
export { ExpressionMixer, CHANNEL_PRIORITY } from './expression/ExpressionMixer';
export type { ExpressionChannel } from './expression/ExpressionMixer';

// Layer systems
export { BlinkController } from './layers/BlinkController';
export { LookAtSystem } from './layers/LookAtSystem';
export type { LookAtConfig } from './layers/LookAtSystem';

// Animation subsystems (used by AnimationController)
export { LipSyncEngine } from './LipSyncEngine';
export { IdleAnimations } from './IdleAnimations';
export { AnimationPlayer } from './AnimationPlayer';
export { AnimationLibrary, animationLibrary } from './AnimationLibrary';
export type { ManifestEntry, AnimationClipData } from './AnimationLibrary';

// VRM preloading
export { preloadVRM, isVRMCached, clearVRMCache } from './preloadVRM';

// Rendering quality
export { PostProcessingPipeline } from './PostProcessingPipeline';
export { QUALITY_PRESETS, getPreset, getDefaultQuality } from './QualityPresets';
export type { QualityPreset, QualitySettings } from './QualityPresets';

// Types
export type * from './types';
