/**
 * Services barrel export
 */

export { VoiceService, voiceService } from './VoiceService';
export type { VoiceState, VoiceServiceConfig, VoiceDebugEvent } from './VoiceService';

export { VoiceActivityDetector, voiceActivityDetector } from './VoiceActivityDetector';
export type { VADConfig } from './VoiceActivityDetector';

export { WakeWordDetector, wakeWordDetector } from './WakeWordDetector';
export type { WakeWord, WakeWordDetectorConfig } from './WakeWordDetector';

// Note: VAD uses browser bundle loaded via script tag, not npm import
