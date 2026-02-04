/**
 * WakeWordDetector - Mock implementation
 * Real Porcupine integration deferred (free tier limits)
 * 
 * For now, exposes methods that can be triggered manually via UI
 */

export type WakeWord = 'start-listening' | 'stop-listening' | 'cancel';

export interface WakeWordDetectorConfig {
  onDetected: (keyword: WakeWord) => void;
  onError?: (error: Error) => void;
}

export class WakeWordDetector {
  private config: WakeWordDetectorConfig | null = null;
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(config: WakeWordDetectorConfig): Promise<void> {
    this.config = config;
    console.log('[WakeWord] Initialized (mock mode)');
  }

  async start(): Promise<void> {
    this._isRunning = true;
    console.log('[WakeWord] Started (mock mode - use simulateWakeWord)');
  }

  async stop(): Promise<void> {
    this._isRunning = false;
    console.log('[WakeWord] Stopped');
  }

  release(): void {
    this._isRunning = false;
    this.config = null;
    console.log('[WakeWord] Released');
  }

  /**
   * Simulate wake word detection (for testing/UI buttons)
   */
  simulateWakeWord(keyword: WakeWord): void {
    if (this.config?.onDetected) {
      console.log(`[WakeWord] Simulated: "${keyword}"`);
      this.config.onDetected(keyword);
    }
  }
}

export const wakeWordDetector = new WakeWordDetector();
