/**
 * VoiceService - Main orchestrator for hands-free voice control
 * 
 * State Machine:
 *   PASSIVE → ACTIVE → PROCESSING → SPEAKING → ACTIVE
 *      ↑_________|_________|___________|
 */

import { VoiceActivityDetector } from './VoiceActivityDetector';
import { SpeechRecognizer } from './SpeechRecognizer';
import { WakeWordDetector, WakeWord } from './WakeWordDetector';

export type VoiceState = 'PASSIVE' | 'ACTIVE' | 'PROCESSING' | 'SPEAKING';

export interface VoiceServiceConfig {
  onTranscript: (text: string) => void;
  onStateChange: (state: VoiceState) => void;
  onError?: (error: Error) => void;
  onInterimTranscript?: (text: string) => void;
  silenceTimeout?: number;      // ms before returning to passive (default 10000)
  returnToPassiveAfterSpeaking?: boolean; // default false (stay active)
}

export class VoiceService {
  private state: VoiceState = 'PASSIVE';
  private config: VoiceServiceConfig | null = null;
  
  private vad: VoiceActivityDetector;
  private stt: SpeechRecognizer;
  private wakeWord: WakeWordDetector;
  
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private _isInitialized = false;

  constructor() {
    this.vad = new VoiceActivityDetector();
    this.stt = new SpeechRecognizer();
    this.wakeWord = new WakeWordDetector();
  }

  get currentState(): VoiceState {
    return this.state;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isSttSupported(): boolean {
    return this.stt.supported;
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
      onVADMisfire: () => console.log('[Voice] VAD misfire'),
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
    this.stt.abort();
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
    this.setState('SPEAKING');
  }

  /**
   * Set state to PROCESSING (called when sending to backend)
   */
  setProcessing(): void {
    this.setState('PROCESSING');
  }

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  private setState(newState: VoiceState): void {
    if (this.state !== newState) {
      console.log(`[Voice] State: ${this.state} → ${newState}`);
      this.state = newState;
      this.config?.onStateChange?.(newState);
    }
  }

  private handleWakeWord(keyword: WakeWord): void {
    console.log(`[Voice] Wake word: ${keyword}`);
    
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
    this.stt.abort();
    this.setState('PASSIVE');
  }

  private handleCancel(): void {
    this.stt.abort();
    if (this.state === 'PROCESSING') {
      this.setState('ACTIVE');
      this.resetInactivityTimer();
    }
  }

  private handleSpeechStart(): void {
    this.clearInactivityTimer();
    console.log('[Voice] User speaking...');
  }

  private async handleSpeechEnd(_audio: Float32Array): Promise<void> {
    if (this.state !== 'ACTIVE') return;
    
    console.log('[Voice] Speech ended, starting STT...');
    
    // Pause VAD while we do STT
    this.vad.pause();
    
    try {
      const transcript = await this.stt.transcribe(
        (interim) => this.config?.onInterimTranscript?.(interim),
        (final) => console.log('[Voice] Final transcript:', final)
      );
      
      if (transcript.trim()) {
        console.log('[Voice] Got transcript:', transcript);
        this.setState('PROCESSING');
        this.config?.onTranscript?.(transcript);
      } else {
        console.log('[Voice] Empty transcript, resuming listening');
        this.vad.resume();
        this.resetInactivityTimer();
      }
    } catch (error) {
      console.error('[Voice] STT error:', error);
      this.config?.onError?.(error as Error);
      this.vad.resume();
      this.resetInactivityTimer();
    }
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
