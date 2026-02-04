/**
 * VoiceService - Main orchestrator for hands-free voice control
 * 
 * State Machine:
 *   PASSIVE → ACTIVE → PROCESSING → SPEAKING → ACTIVE
 *      ↑_________|_________|___________|
 */

import { VoiceActivityDetector } from './VoiceActivityDetector';
import { WakeWordDetector, WakeWord } from './WakeWordDetector';
import { fetchWithAuth } from '../utils/api';

export type VoiceState = 'PASSIVE' | 'ACTIVE' | 'PROCESSING' | 'SPEAKING';

export type VoiceDebugEvent =
  | { type: 'state'; from: VoiceState; to: VoiceState }
  | { type: 'wakeword'; keyword: WakeWord }
  | { type: 'vad_speech_start' }
  | { type: 'vad_speech_end'; samples: number; ms: number }
  | { type: 'vad_misfire' }
  | { type: 'vad_paused' }
  | { type: 'vad_resumed' }
  | { type: 'stt_sending'; bytes: number }
  | { type: 'stt_result'; text: string }
  | { type: 'stt_empty' }
  | { type: 'stt_error'; message: string };

export interface VoiceServiceConfig {
  onTranscript: (text: string) => void;
  onStateChange: (state: VoiceState) => void;
  onError?: (error: Error) => void;
  onInterimTranscript?: (text: string) => void;
  onDebug?: (event: VoiceDebugEvent) => void;
  autoResumeAfterTranscript?: boolean;
  silenceTimeout?: number;      // ms before returning to passive (default 10000)
  returnToPassiveAfterSpeaking?: boolean; // default false (stay active)
}

export class VoiceService {
  private state: VoiceState = 'PASSIVE';
  private config: VoiceServiceConfig | null = null;
  
  private vad: VoiceActivityDetector;
  private wakeWord: WakeWordDetector;
  
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private _isInitialized = false;

  constructor() {
    this.vad = new VoiceActivityDetector();
    this.wakeWord = new WakeWordDetector();
  }

  get currentState(): VoiceState {
    return this.state;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isSttSupported(): boolean {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async init(config: VoiceServiceConfig): Promise<void> {
    this.config = config;

    // Init wake word detector (mock)
    await this.wakeWord.init({
      onDetected: (keyword) => this.handleWakeWord(keyword),
      onError: (error) => this.config?.onError?.(error),
    });

    // Init VAD
    await this.vad.init({
      onSpeechStart: () => this.handleSpeechStart(),
      onSpeechEnd: (audio) => this.handleSpeechEnd(audio),
      onVADMisfire: () => {
        console.log('[Voice] VAD misfire');
        this.config?.onDebug?.({ type: 'vad_misfire' });
      },
    });

    this._isInitialized = true;
    console.log('[Voice] Service initialized');
  }

  async start(): Promise<void> {
    if (!this._isInitialized) {
      throw new Error('VoiceService not initialized');
    }
    
    await this.wakeWord.start();
    this.setState('PASSIVE');
    console.log('[Voice] Started in PASSIVE mode');
  }

  async stop(): Promise<void> {
    this.clearInactivityTimer();
    await this.wakeWord.stop();
    await this.vad.stop();
    this.setState('PASSIVE');
    console.log('[Voice] Stopped');
  }

  async destroy(): Promise<void> {
    await this.stop();
    await this.vad.destroy();
    this.wakeWord.release();
    this._isInitialized = false;
    console.log('[Voice] Destroyed');
  }

  /**
   * Manually activate listening (simulates wake word)
   */
  activate(): void {
    this.wakeWord.simulateWakeWord('start-listening');
  }

  /**
   * Manually deactivate (simulates stop wake word)
   */
  deactivate(): void {
    this.wakeWord.simulateWakeWord('stop-listening');
  }

  /**
   * Cancel current operation
   */
  cancel(): void {
    this.wakeWord.simulateWakeWord('cancel');
  }

  /**
   * Notify that TTS has finished playing
   */
  notifySpeakingDone(): void {
    if (this.state === 'SPEAKING') {
      if (this.config?.returnToPassiveAfterSpeaking) {
        this.setState('PASSIVE');
      } else {
        this.activateListening();
      }
    }
  }

  /**
   * Set state to SPEAKING (called when TTS starts)
   */
  setSpeaking(): void {
    this.pauseForExternalState();
    this.setState('SPEAKING');
  }

  /**
   * Set state to PROCESSING (called when sending to backend)
   */
  setProcessing(): void {
    this.pauseForExternalState();
    this.setState('PROCESSING');
  }

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  private setState(newState: VoiceState): void {
    if (this.state !== newState) {
      console.log(`[Voice] State: ${this.state} → ${newState}`);
      const prevState = this.state;
      this.state = newState;
      this.config?.onStateChange?.(newState);
      this.config?.onDebug?.({ type: 'state', from: prevState, to: newState });
    }
  }

  private handleWakeWord(keyword: WakeWord): void {
    console.log(`[Voice] Wake word: ${keyword}`);
    this.config?.onDebug?.({ type: 'wakeword', keyword });
    
    switch (keyword) {
      case 'start-listening':
        this.activateListening();
        break;
      case 'stop-listening':
        this.deactivateListening();
        break;
      case 'cancel':
        this.handleCancel();
        break;
    }
  }

  private async activateListening(): Promise<void> {
    if (this.state === 'ACTIVE') return;
    
    try {
      await this.vad.start();
      this.setState('ACTIVE');
      this.resetInactivityTimer();
    } catch (error) {
      console.error('[Voice] Failed to activate:', error);
      this.config?.onError?.(error as Error);
    }
  }

  private async deactivateListening(): Promise<void> {
    this.clearInactivityTimer();
    await this.vad.stop();
    this.setState('PASSIVE');
  }

  private pauseForExternalState(): void {
    if (this.vad.isRunning) {
      this.vad.pause();
    }
    this.clearInactivityTimer();
  }

  private handleCancel(): void {
    if (this.state === 'PROCESSING') {
      this.setState('ACTIVE');
      this.resetInactivityTimer();
    }
  }

  private handleSpeechStart(): void {
    this.clearInactivityTimer();
    console.log('[Voice] User speaking...');
    this.config?.onDebug?.({ type: 'vad_speech_start' });
  }

  private async handleSpeechEnd(audio: Float32Array): Promise<void> {
    if (this.state !== 'ACTIVE') return;
    
    const audioMs = Math.round((audio.length / 16000) * 1000);
    this.config?.onDebug?.({ type: 'vad_speech_end', samples: audio.length, ms: audioMs });
    console.log('[Voice] Speech ended, starting STT...');
    
    // Pause VAD while we do STT
    this.vad.pause();
    this.config?.onDebug?.({ type: 'vad_paused' });
    
    try {
      const transcript = await this.transcribeWithBackend(audio);
      
      if (transcript.trim()) {
        console.log('[Voice] Got transcript:', transcript);
        this.config?.onDebug?.({ type: 'stt_result', text: transcript });
        this.setState('PROCESSING');
        this.config?.onTranscript?.(transcript);
        if (this.config?.autoResumeAfterTranscript) {
          this.vad.resume();
          this.config?.onDebug?.({ type: 'vad_resumed' });
          this.setState('ACTIVE');
          this.resetInactivityTimer();
        }
      } else {
        console.log('[Voice] Empty transcript, resuming listening');
        this.config?.onDebug?.({ type: 'stt_empty' });
        this.vad.resume();
        this.config?.onDebug?.({ type: 'vad_resumed' });
        this.resetInactivityTimer();
      }
    } catch (error) {
      console.error('[Voice] STT error:', error);
      this.config?.onDebug?.({
        type: 'stt_error',
        message: error instanceof Error ? error.message : String(error),
      });
      this.config?.onError?.(error as Error);
      this.vad.resume();
      this.config?.onDebug?.({ type: 'vad_resumed' });
      this.resetInactivityTimer();
    }
  }

  private encodeWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      let s = samples[i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  }

  private async transcribeWithBackend(audio: Float32Array): Promise<string> {
    const wavBuffer = this.encodeWav(audio, 16000);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    this.config?.onDebug?.({ type: 'stt_sending', bytes: wavBuffer.byteLength });

    const formData = new FormData();
    formData.append('audio', blob, 'recording.wav');

    const response = await fetchWithAuth('/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const result = await response.json();
    return result?.text ?? '';
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    
    const timeout = this.config?.silenceTimeout ?? 10000;
    this.inactivityTimer = setTimeout(() => {
      if (this.state === 'ACTIVE') {
        console.log('[Voice] Inactivity timeout, returning to PASSIVE');
        this.deactivateListening();
      }
    }, timeout);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }
}

// Singleton instance
export const voiceService = new VoiceService();
