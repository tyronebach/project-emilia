/**
 * Services barrel export
 */

export { VoiceService, voiceService } from './VoiceService';
export type { VoiceState, VoiceServiceConfig } from './VoiceService';

export { VoiceActivityDetector, voiceActivityDetector } from './VoiceActivityDetector';
export type { VADConfig } from './VoiceActivityDetector';

export { SpeechRecognizer, speechRecognizer } from './SpeechRecognizer';

export { WakeWordDetector, wakeWordDetector } from './WakeWordDetector';
export type { WakeWord, WakeWordDetectorConfig } from './WakeWordDetector';
