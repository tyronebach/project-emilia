/**
 * Blink Controller
 * Procedural eye blinking with random intervals and pause/resume support.
 * Integrates with ExpressionMixer via the 'blink' channel.
 * 
 * ADDITIVE BLINK: Respects current eye state from emotions.
 * If emotion has eyes 50% closed (angry), blink goes 50% → 100%, not 0% → 100%.
 */

import type { ExpressionMixer } from '../expression/ExpressionMixer';

const DEFAULT_INTERVAL_MIN = 2.0;  // seconds
const DEFAULT_INTERVAL_MAX = 6.0;  // seconds
const DEFAULT_BLINK_DURATION = 120; // ms - how long eyes stay closed

type BlinkPhase = 'open' | 'closing' | 'closed' | 'opening';

// Emotions that partially close the eyes (0-1 scale, how much base eye closure)
const EMOTION_EYE_CLOSURE: Record<string, number> = {
  angry: 0.3,
  relaxed: 0.2,
  happy: 0.15,    // Smile squints eyes slightly
  sleepy: 0.4,
  // Add more as needed
};

export interface BlinkControllerOptions {
  expressions?: string[];
  channelName?: string;
}

export class BlinkController {
  private mixer: ExpressionMixer;
  private channelName = 'blink';
  private expressions: string[] = ['blink'];

  private enabled: boolean = true;
  private phase: BlinkPhase = 'open';
  private timer: number = 0;
  private blinkProgress: number = 0;  // 0 = not blinking, 1 = fully blinked

  // Base eye closure from emotion (0 = fully open, 1 = fully closed)
  private baseEyeClosed: number = 0;

  // Config
  private intervalMin: number = DEFAULT_INTERVAL_MIN;
  private intervalMax: number = DEFAULT_INTERVAL_MAX;
  private blinkDuration: number = DEFAULT_BLINK_DURATION;
  private closeSpeed: number = 0.15;  // How fast blink progresses (per frame blend)
  private openSpeed: number = 0.12;   // How fast blink retracts

  // For pause/resume with promise
  private pauseResolve: (() => void) | null = null;
  private nextBlinkTime: number = 0;

  constructor(mixer: ExpressionMixer, options: BlinkControllerOptions = {}) {
    this.mixer = mixer;
    this.channelName = options.channelName ?? this.channelName;
    this.expressions = options.expressions?.length ? options.expressions : this.expressions;
    this.mixer.createChannel(this.channelName, 60);
    this.scheduleNextBlink();
  }

  /**
   * Set base eye closure from current emotion.
   * Call this when emotion changes.
   * @param emotion - emotion name (e.g., 'angry', 'happy')
   * @param intensity - emotion intensity (0-1)
   */
  setBaseFromEmotion(emotion: string, intensity: number): void {
    const emotionClosure = EMOTION_EYE_CLOSURE[emotion] ?? 0;
    this.baseEyeClosed = emotionClosure * intensity;
  }

  /**
   * Directly set base eye closure (0-1)
   */
  setBaseEyeClosed(value: number): void {
    this.baseEyeClosed = Math.max(0, Math.min(1, value));
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
      // Resolve any previously orphaned pause promise
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }

      // Pausing - return promise that resolves when eyes are at base state
      if (this.phase === 'open') {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        this.pauseResolve = resolve;
      });
    } else {
      // Resuming — resolve any lingering promise
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
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
   * Calculate final eye closed value (additive: base + blink, clamped to 1)
   */
  private getFinalEyeClosed(): number {
    // Blink adds remaining range on top of base
    // e.g., base=0.3, blinkProgress=1 → 0.3 + 0.7*1 = 1.0
    const blinkContribution = this.blinkProgress * (1 - this.baseEyeClosed);
    return Math.min(1, this.baseEyeClosed + blinkContribution);
  }

  /**
   * Update each frame
   */
  update(deltaTime: number): void {
    const deltaMs = deltaTime * 1000;

    switch (this.phase) {
      case 'open':
        // Eyes at base state - count down to next blink
        if (this.enabled) {
          this.timer += deltaTime;
          if (this.timer >= this.nextBlinkTime) {
            this.phase = 'closing';
            this.timer = 0;
          }
        }
        // Ensure blink progress is at 0 (base state)
        if (this.blinkProgress > 0) {
          this.blinkProgress = Math.max(0, this.blinkProgress - this.openSpeed);
        }
        break;

      case 'closing':
        // Eyes closing toward fully shut
        this.blinkProgress = Math.min(1, this.blinkProgress + this.closeSpeed);
        if (this.blinkProgress >= 0.95) {
          this.blinkProgress = 1;
          this.phase = 'closed';
          this.timer = 0;
        }
        break;

      case 'closed':
        // Eyes fully closed - hold briefly
        this.timer += deltaMs;
        if (this.timer >= this.blinkDuration) {
          this.phase = 'opening';
        }
        break;

      case 'opening':
        // Eyes opening back to base state
        this.blinkProgress = Math.max(0, this.blinkProgress - this.openSpeed);
        if (this.blinkProgress <= 0.05) {
          this.blinkProgress = 0;
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

    // Apply final value to mixer (additive: base + blink contribution)
    const finalValue = this.getFinalEyeClosed();
    for (const expr of this.expressions) {
      this.mixer.setExpression(this.channelName, expr, finalValue);
    }
  }

  /**
   * Check if currently blinking
   */
  isBlinking(): boolean {
    return this.phase !== 'open';
  }

  /**
   * Get current blink progress (0-1, independent of base)
   */
  getBlinkProgress(): number {
    return this.blinkProgress;
  }

  /**
   * Get current base eye closed value
   */
  getBaseEyeClosed(): number {
    return this.baseEyeClosed;
  }

  /**
   * Get final eye closed value (for debugging)
   */
  getFinalValue(): number {
    return this.getFinalEyeClosed();
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.mixer.clearChannel(this.channelName);
  }
}

export default BlinkController;
