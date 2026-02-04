/**
 * VoiceActivityDetector - Silero VAD wrapper
 * Detects when user starts/stops speaking
 */

import { MicVAD, RealTimeVADOptions } from '@ricky0123/vad-web';

export interface VADConfig {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
  redemptionFrames?: number;
}

export class VoiceActivityDetector {
  private vad: MicVAD | null = null;
  private config: VADConfig = {};
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(config: VADConfig = {}): Promise<void> {
    this.config = config;
    
    try {
      this.vad = await MicVAD.new({
        positiveSpeechThreshold: config.positiveSpeechThreshold ?? 0.8,
        minSpeechFrames: config.minSpeechFrames ?? 3,
        redemptionFrames: config.redemptionFrames ?? 8,
        preSpeechPadFrames: 1,
        onSpeechStart: () => {
          console.log('[VAD] Speech started');
          this.config.onSpeechStart?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log('[VAD] Speech ended, audio length:', audio.length);
          this.config.onSpeechEnd?.(audio);
        },
        onVADMisfire: () => {
          console.log('[VAD] Misfire (too short)');
          this.config.onVADMisfire?.();
        },
      });
      
      console.log('[VAD] Initialized');
    } catch (error) {
      console.error('[VAD] Init failed:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.vad) {
      throw new Error('VAD not initialized');
    }
    
    this.vad.start();
    this._isRunning = true;
    console.log('[VAD] Started listening');
  }

  pause(): void {
    if (this.vad && this._isRunning) {
      this.vad.pause();
      console.log('[VAD] Paused');
    }
  }

  resume(): void {
    if (this.vad && this._isRunning) {
      this.vad.start();
      console.log('[VAD] Resumed');
    }
  }

  async stop(): Promise<void> {
    if (this.vad) {
      this.vad.pause();
      this._isRunning = false;
      console.log('[VAD] Stopped');
    }
  }

  async destroy(): Promise<void> {
    if (this.vad) {
      this.vad.destroy();
      this.vad = null;
      this._isRunning = false;
      console.log('[VAD] Destroyed');
    }
  }
}

export const voiceActivityDetector = new VoiceActivityDetector();
