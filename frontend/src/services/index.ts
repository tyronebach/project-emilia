/**
 * Services barrel export
 */

export { VoiceService, voiceService } from './VoiceService';
export type { VoiceState, VoiceServiceConfig, VoiceDebugEvent, WakeWord } from './VoiceService';

export { VoiceActivityDetector, voiceActivityDetector } from './VoiceActivityDetector';
export type { VADConfig } from './VoiceActivityDetector';

// Note: VAD uses browser bundle loaded via script tag, not npm import
