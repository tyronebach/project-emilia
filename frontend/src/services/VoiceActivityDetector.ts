/**
 * VoiceActivityDetector - Silero VAD wrapper
 * Uses the browser bundle as recommended in docs
 */

export interface VADConfig {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
  positiveSpeechThreshold?: number;
  minSpeechFrames?: number;
  redemptionFrames?: number;
}

interface MicVADInstance {
  start: () => void;
  pause: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    vad?: {
      MicVAD: {
        new: (config: any) => Promise<MicVADInstance>;
      };
    };
  }
}

export class VoiceActivityDetector {
  private vad: MicVADInstance | null = null;
  private config: VADConfig = {};
  private _isRunning = false;
  private static scriptLoaded = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  private async loadScript(): Promise<void> {
    if (VoiceActivityDetector.scriptLoaded && window.vad) {
      return;
    }

    return new Promise((resolve, reject) => {
      const load = (src: string, label: string) =>
        new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => res();
          script.onerror = () => rej(new Error(`Failed to load ${label}`));
          document.head.appendChild(script);
        });

      (async () => {
        try {
          // onnxruntime-web must be loaded globally as `ort` before VAD bundle
          if (!(window as any).ort) {
            await load('/ort.min.js', 'onnxruntime');
          }
          await load('/bundle.min.js', 'VAD bundle');

          VoiceActivityDetector.scriptLoaded = true;
          console.log('[VAD] Scripts loaded');
          resolve();
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  async init(config: VADConfig = {}): Promise<void> {
    this.config = config;
    
    try {
      await this.loadScript();
      
      if (!window.vad) {
        throw new Error('VAD library not available after loading');
      }

      this.vad = await window.vad.MicVAD.new({
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        model: 'legacy',
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
