/**
 * Blink Controller
 * Procedural eye blinking with random intervals and pause/resume support.
 * Integrates with ExpressionMixer via the 'blink' channel.
 */

import type { ExpressionMixer } from '../expression/ExpressionMixer';

const DEFAULT_INTERVAL_MIN = 2.0;  // seconds
const DEFAULT_INTERVAL_MAX = 6.0;  // seconds
const DEFAULT_BLINK_DURATION = 120; // ms - how long eyes stay closed

type BlinkPhase = 'open' | 'closing' | 'closed' | 'opening';

export class BlinkController {
  private mixer: ExpressionMixer;
  private channelName = 'blink';

  private enabled: boolean = true;
  private phase: BlinkPhase = 'open';
  private timer: number = 0;
  private blinkValue: number = 0;

  // Config
  private intervalMin: number = DEFAULT_INTERVAL_MIN;
  private intervalMax: number = DEFAULT_INTERVAL_MAX;
  private blinkDuration: number = DEFAULT_BLINK_DURATION;
  private closeSpeed: number = 0.15;  // How fast eyes close (per frame blend)
  private openSpeed: number = 0.12;   // How fast eyes open

  // For pause/resume with promise
  private pauseResolve: (() => void) | null = null;
  private nextBlinkTime: number = 0;

  constructor(mixer: ExpressionMixer) {
    this.mixer = mixer;
    this.mixer.createChannel(this.channelName, 60);
    this.scheduleNextBlink();
  }

  /**
   * Set blink interval range in seconds
   */
  setInterval(min: number, max: number): void {
    this.intervalMin = Math.max(0.5, min);
    this.intervalMax = Math.max(this.intervalMin, max);
  }

  /**
   * Set blink closed duration in ms
   */
  setDuration(ms: number): void {
    this.blinkDuration = Math.max(50, ms);
  }

  /**
   * Enable blinking
   */
  setEnabled(enabled: boolean): Promise<void> {
    if (this.enabled === enabled) {
      return Promise.resolve();
    }

    this.enabled = enabled;

    if (!enabled) {
      // Pausing - return promise that resolves when eyes are open
      if (this.phase === 'open') {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        this.pauseResolve = resolve;
      });
    } else {
      // Resuming
      this.scheduleNextBlink();
      return Promise.resolve();
    }
  }

  /**
   * Force an immediate blink
   */
  triggerBlink(): void {
    if (!this.enabled) return;
    if (this.phase !== 'open') return;

    this.phase = 'closing';
    this.timer = 0;
  }

  /**
   * Schedule next blink
   */
  private scheduleNextBlink(): void {
    const interval = this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    this.nextBlinkTime = interval;
  }

  /**
   * Update each frame
   */
  update(deltaTime: number): void {
    const deltaMs = deltaTime * 1000;

    switch (this.phase) {
      case 'open':
        // Eyes open - count down to next blink
        if (this.enabled) {
          this.timer += deltaTime;
          if (this.timer >= this.nextBlinkTime) {
            this.phase = 'closing';
            this.timer = 0;
          }
        }
        // Ensure eyes are open
        if (this.blinkValue > 0) {
          this.blinkValue = Math.max(0, this.blinkValue - this.openSpeed);
        }
        break;

      case 'closing':
        // Eyes closing
        this.blinkValue = Math.min(1, this.blinkValue + this.closeSpeed);
        if (this.blinkValue >= 0.95) {
          this.blinkValue = 1;
          this.phase = 'closed';
          this.timer = 0;
        }
        break;

      case 'closed':
        // Eyes closed - hold briefly
        this.timer += deltaMs;
        if (this.timer >= this.blinkDuration) {
          this.phase = 'opening';
        }
        break;

      case 'opening':
        // Eyes opening
        this.blinkValue = Math.max(0, this.blinkValue - this.openSpeed);
        if (this.blinkValue <= 0.05) {
          this.blinkValue = 0;
          this.phase = 'open';
          this.timer = 0;

          // Resolve pause promise if waiting
          if (this.pauseResolve) {
            this.pauseResolve();
            this.pauseResolve = null;
          }

          // Schedule next blink
          this.scheduleNextBlink();
        }
        break;
    }

    // Apply to mixer
    this.mixer.setExpression(this.channelName, 'blink', this.blinkValue);
  }

  /**
   * Check if currently blinking
   */
  isBlinking(): boolean {
    return this.phase !== 'open';
  }

  /**
   * Get current blink value (0-1)
   */
  getBlinkValue(): number {
    return this.blinkValue;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.mixer.clearChannel(this.channelName);
  }
}

export default BlinkController;
