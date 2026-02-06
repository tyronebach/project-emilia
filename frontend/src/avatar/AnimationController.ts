/**
 * Animation Controller
 * Central orchestrator for all avatar animation subsystems.
 * Coordinates expressions, lip sync, look-at, blinks, and body animations.
 */

import type { VRM, VRMExpressionManager } from '@pixiv/three-vrm';
import { ExpressionMixer, CHANNEL_PRIORITY } from './expression/ExpressionMixer';
import { BlinkController } from './layers/BlinkController';
import { LookAtSystem } from './layers/LookAtSystem';
import { LipSyncEngine } from './LipSyncEngine';
import type { AlignmentData } from './types';
import { IdleAnimations } from './IdleAnimations';
import { AnimationPlayer } from './AnimationPlayer';
import type * as THREE from 'three';

// Supported emotion names
export type Emotion = 
  | 'neutral' | 'happy' | 'sad' | 'angry' 
  | 'surprised' | 'thinking' | 'relaxed'
  | 'excited' | 'worried' | 'confused';

// Map UI emotions to VRM expression names
const EMOTION_MAP: Record<Emotion, string> = {
  neutral: 'neutral',
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  thinking: 'neutral',  // With slight raised eyebrow if available
  relaxed: 'relaxed',
  excited: 'happy',
  worried: 'sad',
  confused: 'surprised',
};

const MOOD_ALIASES: Record<string, Emotion> = {
  neutral: 'neutral',
  happy: 'happy',
  joy: 'happy',
  sad: 'sad',
  sorrow: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  surprise: 'surprised',
  thinking: 'thinking',
  curious: 'surprised',
  relaxed: 'relaxed',
  excited: 'excited',
  worried: 'worried',
  confused: 'confused',
  bored: 'neutral',
  love: 'happy',
  playful: 'happy',
  shy: 'neutral',
  embarrassed: 'neutral',
  sleepy: 'relaxed',
};

const normalizeEmotion = (emotion: Emotion | string): Emotion => {
  const key = String(emotion).toLowerCase();
  return MOOD_ALIASES[key] ?? 'neutral';
};

export interface GestureOptions {
  priority?: 'interrupt' | 'queue' | 'ignore';
  fadeIn?: number;
  fadeOut?: number;
}

export class AnimationController {
  private vrm: VRM | null = null;
  private initialized: boolean = false;

  // Core systems
  private expressionMixer: ExpressionMixer;
  private blinkController: BlinkController | null = null;
  private lookAtSystem: LookAtSystem | null = null;
  private lipSyncEngine: LipSyncEngine | null = null;
  private idleAnimations: IdleAnimations | null = null;
  private animationPlayer: AnimationPlayer | null = null;

  // State
  private currentEmotion: Emotion = 'neutral';
  private emotionIntensity: number = 0;
  private isSpeaking: boolean = false;

  // Emotion transition
  private targetEmotion: Emotion = 'neutral';
  private targetIntensity: number = 0;
  private emotionBlendSpeed: number = 0.08;

  constructor() {
    this.expressionMixer = new ExpressionMixer();
    
    // Pre-create channels
    this.expressionMixer.createChannel('lipsync', CHANNEL_PRIORITY.lipsync);
    this.expressionMixer.createChannel('emotion', CHANNEL_PRIORITY.emotion);
    this.expressionMixer.createChannel('blink', CHANNEL_PRIORITY.blink);
    this.expressionMixer.createChannel('gesture', CHANNEL_PRIORITY.gesture);
  }

  /**
   * Initialize with VRM model
   */
  init(vrm: VRM, camera?: THREE.Camera): void {
    this.vrm = vrm;
    
    // Set up expression mixer
    if (vrm.expressionManager) {
      this.expressionMixer.setExpressionManager(vrm.expressionManager);
    }

    // Initialize subsystems
    const blinkExpressions = this.detectBlinkExpressions(vrm.expressionManager ?? null);
    this.blinkController = new BlinkController(this.expressionMixer, { expressions: blinkExpressions });
    this.lookAtSystem = new LookAtSystem(vrm);
    this.lipSyncEngine = new LipSyncEngine(vrm);
    this.idleAnimations = new IdleAnimations(vrm);
    this.animationPlayer = new AnimationPlayer(vrm);

    // Connect animation player to idle system
    this.animationPlayer.setIdleAnimations(this.idleAnimations);

    // Set camera for look-at
    if (camera) {
      this.lookAtSystem.setCamera(camera);
    }

    this.initialized = true;
    console.log('[AnimationController] Initialized');
  }

  private detectBlinkExpressions(expressionManager: VRMExpressionManager | null): string[] {
    if (!expressionManager) return ['blink'];

    const hasBlink = this.hasExpression(expressionManager, 'blink');
    const hasBlinkLeft = this.hasExpression(expressionManager, 'blinkLeft');
    const hasBlinkRight = this.hasExpression(expressionManager, 'blinkRight');

    if (hasBlink) return ['blink'];

    const expressions: string[] = [];
    if (hasBlinkLeft) expressions.push('blinkLeft');
    if (hasBlinkRight) expressions.push('blinkRight');

    return expressions.length > 0 ? expressions : ['blink'];
  }

  private hasExpression(expressionManager: VRMExpressionManager, name: string): boolean {
    try {
      if (typeof expressionManager.getValue === 'function') {
        const value = expressionManager.getValue(name as never);
        if (value !== undefined) return true;
      }
    } catch (_e) { /* ignore */ }

    try {
      const expr = (expressionManager as { getExpression?: (name: string) => unknown }).getExpression?.(name);
      if (expr) return true;
    } catch (_e) { /* ignore */ }

    const emAny = expressionManager as VRMExpressionManager & {
      expressionMap?: Map<string, unknown> | Record<string, unknown>;
      _expressionMap?: Map<string, unknown>;
    };
    const map = emAny.expressionMap || emAny._expressionMap;
    if (map instanceof Map) {
      return map.has(name);
    }
    if (map && typeof map === 'object') {
      return Object.prototype.hasOwnProperty.call(map, name);
    }

    return false;
  }

  /**
   * Update all systems each frame
   */
  update(deltaTime: number): void {
    if (!this.initialized) return;

    // Update emotion blend
    this.updateEmotionBlend(deltaTime);

    // Update subsystems
    this.blinkController?.update(deltaTime);
    this.lipSyncEngine?.update(deltaTime);
    this.idleAnimations?.update(deltaTime);
    this.animationPlayer?.update(deltaTime);
    this.lookAtSystem?.update(deltaTime);

    // Apply final expression values
    this.expressionMixer.apply();
  }

  /**
   * Set mood/emotion
   */
  async setMood(emotion: Emotion | string, intensity: number = 1.0): Promise<void> {
    intensity = Math.max(0, Math.min(1, intensity));
    const normalizedEmotion = normalizeEmotion(emotion);


    // If emotion is changing, handle blink sync
    if (normalizedEmotion !== this.currentEmotion && this.blinkController) {
      // Pause blink and wait for eyes to open
      await this.blinkController.setEnabled(false);
    }

    this.targetEmotion = normalizedEmotion;
    this.targetIntensity = intensity;
  }

  /**
   * Update emotion blend toward target
   */
  private updateEmotionBlend(deltaTime: number): void {
    const blendAmount = this.emotionBlendSpeed * deltaTime * 60;

    // Blend intensity
    if (Math.abs(this.emotionIntensity - this.targetIntensity) > 0.01) {
      this.emotionIntensity += (this.targetIntensity - this.emotionIntensity) * blendAmount;
    } else {
      this.emotionIntensity = this.targetIntensity;
    }

    // If switching emotions, fade out old first
    if (this.currentEmotion !== this.targetEmotion) {
      // Fade out current
      const currentExpr = EMOTION_MAP[this.currentEmotion];
      const currentWeight = this.expressionMixer.getValue(currentExpr);
      
      if (currentWeight > 0.01) {
        this.expressionMixer.setExpression('emotion', currentExpr, currentWeight * (1 - blendAmount));
      } else {
        // Current faded out, switch to target
        this.currentEmotion = this.targetEmotion;
        
        // Resume blink after emotion change
        if (this.blinkController) {
          this.blinkController.setEnabled(true);
        }
      }
    }

    // Apply current emotion
    const expr = EMOTION_MAP[this.currentEmotion];
    if (expr && this.emotionIntensity > 0.01) {
      this.expressionMixer.setExpression('emotion', expr, this.emotionIntensity);
    }
  }

  /**
   * Trigger a gesture animation
   */
  async triggerGesture(name: string, options: GestureOptions = {}): Promise<boolean> {
    if (!this.animationPlayer) return false;


    return this.animationPlayer.play(name, {
      loop: false,
      fadeIn: options.fadeIn ?? 0.25,
      fadeOut: options.fadeOut ?? 0.25,
    });
  }

  /**
   * Start speaking with lip sync
   */
  startSpeaking(alignment: AlignmentData, audioElement: HTMLAudioElement): void {
    if (!this.lipSyncEngine) return;

    
    this.isSpeaking = true;

    // Start lip sync
    const audioDurationMs = audioElement.duration * 1000;
    this.lipSyncEngine.setAlignment(alignment, audioDurationMs);
    this.lipSyncEngine.startSync(audioElement);

    // Pause idle animation variations (stay in current pose)
    this.idleAnimations?.pause();
  }

  /**
   * Stop speaking
   */
  stopSpeaking(): void {
    
    this.isSpeaking = false;

    // Stop lip sync
    this.lipSyncEngine?.stop();

    // Resume idle animations
    this.idleAnimations?.resume();

  }

  /**
   * Get lip sync engine (for external access, e.g., debug panel)
   */
  get lipSync(): LipSyncEngine | null {
    return this.lipSyncEngine;
  }

  /**
   * Get expression mixer (for external access)
   */
  get expressions(): ExpressionMixer {
    return this.expressionMixer;
  }

  /**
   * Get look-at system
   */
  get lookAt(): LookAtSystem | null {
    return this.lookAtSystem;
  }

  /**
   * Get animation player
   */
  get animations(): AnimationPlayer | null {
    return this.animationPlayer;
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    emotion: Emotion;
    intensity: number;
    isSpeaking: boolean;
    isBlinking: boolean;
  } {
    return {
      emotion: this.currentEmotion,
      intensity: this.emotionIntensity,
      isSpeaking: this.isSpeaking,
      isBlinking: this.blinkController?.isBlinking() ?? false,
    };
  }

  /**
   * Dispose all systems
   */
  dispose(): void {
    this.blinkController?.dispose();
    this.lookAtSystem?.dispose();
    this.lipSyncEngine?.stop();
    this.animationPlayer?.dispose();
    this.expressionMixer.dispose();
    
    this.initialized = false;
    this.vrm = null;

    console.log('[AnimationController] Disposed');
  }
}

export default AnimationController;
