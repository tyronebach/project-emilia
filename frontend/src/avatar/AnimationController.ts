/**
 * Animation Controller
 * Central orchestrator for all avatar animation subsystems.
 * Coordinates expressions, lip sync, look-at, blinks, body animations,
 * and the behavior planning system.
 */

import type { VRM, VRMExpressionManager } from '@pixiv/three-vrm';
import { ExpressionMixer, CHANNEL_PRIORITY } from './expression/ExpressionMixer';
import { BlinkController } from './layers/BlinkController';
import { LookAtSystem } from './layers/LookAtSystem';
import { HeadGlanceSystem } from './layers/HeadGlanceSystem';
import { LipSyncEngine } from './LipSyncEngine';
import { AnimationGraph } from './AnimationGraph';
import type { AlignmentData } from './types';
import { IdleAnimations } from './IdleAnimations';
import { AnimationPlayer } from './AnimationPlayer';
import { BehaviorPlanner } from './behavior/BehaviorPlanner';
import { MicroBehaviorController } from './behavior/MicroBehaviorController';
import { AmbientBehavior } from './behavior/AmbientBehavior';
import type { BehaviorInput, BehaviorOutput, MicroBehavior } from './types/behavior';
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
  thinking: 'neutral',
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
  private headGlanceSystem: HeadGlanceSystem | null = null;
  private lipSyncEngine: LipSyncEngine | null = null;
  private animationGraph: AnimationGraph | null = null;
  private idleAnimations: IdleAnimations | null = null;
  private animationPlayer: AnimationPlayer | null = null;

  // Behavior system
  private behaviorPlanner: BehaviorPlanner;
  private microBehaviorController: MicroBehaviorController;
  private ambientBehavior: AmbientBehavior;

  // State
  private currentEmotion: Emotion = 'neutral';
  private emotionIntensity: number = 0;
  private isSpeaking: boolean = false;
  private isListening: boolean = false;
  private turnCount: number = 0;
  private lastUserMessageTime: number = 0;
  private lastBehaviorTime: number = 0;
  private sessionStartTime: number = Date.now();
  private lastPlannedBehavior: {
    intent: string;
    mood: string;
    energy: string;
    emotion: string;
    intensity: number;
    gesture: string | null;
  } | null = null;

  // Emotion transition
  private targetEmotion: Emotion = 'neutral';
  private targetIntensity: number = 0;
  private emotionBlendSpeed: number = 0.08;

  constructor() {
    this.expressionMixer = new ExpressionMixer();
    this.behaviorPlanner = new BehaviorPlanner();
    this.microBehaviorController = new MicroBehaviorController();
    this.ambientBehavior = new AmbientBehavior();

    // Pre-create channels (blink channel created by BlinkController)
    this.expressionMixer.createChannel('lipsync', CHANNEL_PRIORITY.lipsync);
    this.expressionMixer.createChannel('emotion', CHANNEL_PRIORITY.emotion);
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

    // Create unified AnimationGraph
    this.animationGraph = new AnimationGraph(vrm);

    // Initialize subsystems
    const blinkExpressions = this.detectBlinkExpressions(vrm.expressionManager ?? null);
    this.blinkController = new BlinkController(this.expressionMixer, { expressions: blinkExpressions });
    this.lookAtSystem = new LookAtSystem(vrm);
    this.headGlanceSystem = new HeadGlanceSystem(vrm);
    this.lipSyncEngine = new LipSyncEngine(this.expressionMixer, vrm);
    this.idleAnimations = new IdleAnimations(vrm, this.animationGraph);
    this.animationPlayer = new AnimationPlayer(vrm, this.animationGraph);

    // Set camera for look-at
    if (camera) {
      this.lookAtSystem.setCamera(camera);
    }

    this.initialized = true;
    console.log('[AnimationController] Initialized with AnimationGraph');
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
    this.animationGraph?.update(deltaTime);
    
    // Update head glance system and wire to LookAt
    if (this.headGlanceSystem) {
      // Pause glances during gestures
      const isGesturePlaying = this.animationGraph?.isGesturePlaying() ?? false;
      if (isGesturePlaying) {
        this.headGlanceSystem.pause();
      } else {
        this.headGlanceSystem.resume();
      }
      
      // Tell glance system whether LookAt is handling head
      const lookAtState = this.lookAtSystem?.getState();
      const lookAtHandlingHead = lookAtState?.enabled && lookAtState?.headTrackingEnabled;
      this.headGlanceSystem.setLookAtActive(lookAtHandlingHead ?? false);
      
      // Update glance system
      this.headGlanceSystem.update(deltaTime);
      
      // Pass glance offsets to LookAt (if LookAt is active)
      if (lookAtHandlingHead && this.lookAtSystem) {
        const glance = this.headGlanceSystem.getGlanceOffset();
        this.lookAtSystem.setGlanceOffset(glance.yaw, glance.pitch);
      }
    }
    
    this.lookAtSystem?.update(deltaTime);

    // Update ambient behavior and micro-behaviors
    const ambientMicros = this.ambientBehavior.update(deltaTime, {
      isSpeaking: this.isSpeaking,
      isListening: this.isListening,
      isGesturePlaying: this.animationGraph?.isGesturePlaying() ?? false,
    });
    for (const micro of ambientMicros) {
      this.microBehaviorController.schedule(micro);
    }

    const readyMicros = this.microBehaviorController.update(deltaTime);
    for (const micro of readyMicros) {
      this.executeMicroBehavior(micro);
    }

    // Apply final expression values
    this.expressionMixer.apply();
  }

  /**
   * Handle an intent from the BehaviorPlanner (new primary API)
   */
  handleIntent(input: Partial<BehaviorInput>): void {
    const now = Date.now();

    // Enrich with conversation state
    const fullInput: BehaviorInput = {
      intent: input.intent ?? 'neutral',
      mood: input.mood ?? 'neutral',
      energy: input.energy ?? 'medium',
      isSpeaking: this.isSpeaking,
      isListening: this.isListening,
      turnCount: this.turnCount,
      timeSinceUserMessage: now - this.lastUserMessageTime,
      timeSinceLastBehavior: now - this.lastBehaviorTime,
      sessionDuration: now - this.sessionStartTime,
    };

    const output = this.behaviorPlanner.plan(fullInput);
    this.lastPlannedBehavior = {
      intent: String(fullInput.intent ?? 'neutral'),
      mood: String(fullInput.mood ?? 'neutral'),
      energy: String(fullInput.energy ?? 'medium'),
      emotion: output.facialEmotion.expression,
      intensity: output.facialEmotion.intensity,
      gesture: output.bodyAction?.gesture ?? null,
    };
    this.executeBehavior(output);
    this.lastBehaviorTime = now;
    this.turnCount++;

    console.log('[AnimationController] handleIntent:', input.intent, '→', {
      emotion: output.facialEmotion.expression,
      gesture: output.bodyAction?.gesture,
    });
  }

  getLastBehaviorDebug(): {
    intent: string;
    mood: string;
    energy: string;
    emotion: string;
    intensity: number;
    gesture: string | null;
  } | null {
    if (!this.lastPlannedBehavior) return null;
    return { ...this.lastPlannedBehavior };
  }

  /**
   * Execute a BehaviorOutput
   */
  private executeBehavior(output: BehaviorOutput): void {
    // Facial emotion
    if (output.facialEmotion) {
      this.setMood(output.facialEmotion.expression, output.facialEmotion.intensity);
    }

    // Body action (gesture)
    if (output.bodyAction?.gesture) {
      this.triggerGesture(output.bodyAction.gesture, {
        fadeIn: 0.25,
        fadeOut: 0.25,
      });
    }

    // Schedule micro-behaviors
    if (output.microBehaviors) {
      for (const micro of output.microBehaviors) {
        this.microBehaviorController.schedule(micro);
      }
    }
  }

  /**
   * Execute a single micro-behavior
   */
  private executeMicroBehavior(micro: MicroBehavior): void {
    switch (micro.type) {
      case 'glance_away':
      case 'glance_back':
        // Glances now handled by HeadGlanceSystem autonomously
        break;
      case 'nod_small':
        // Small nod via a brief head movement - could use a procedural animation
        // For now, trigger through gesture system if available
        this.triggerGesture('nod', { fadeIn: 0.15, fadeOut: 0.15 });
        break;
      case 'head_tilt':
        // Optional ambient gesture - skip if not in state machine
        if (this.stateMachine?.hasAction('head_tilt')) {
          this.triggerGesture('head_tilt', { fadeIn: 0.2, fadeOut: 0.2 });
        }
        break;
      case 'posture_shift':
        // Optional ambient gesture - idle animation has natural movement built-in
        // Only trigger if explicitly defined in state machine
        if (this.stateMachine?.hasAction('posture_shift')) {
          this.triggerGesture('posture_shift', { fadeIn: 0.3, fadeOut: 0.3 });
        }
        break;
    }
  }

  /**
   * Set mood/emotion
   */
  async setMood(emotion: Emotion | string, intensity: number = 1.0): Promise<void> {
    intensity = Math.max(0, Math.min(1, intensity));
    const normalizedEmotion = normalizeEmotion(emotion);

    // If emotion is changing, handle blink sync
    if (normalizedEmotion !== this.currentEmotion && this.blinkController) {
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
      const currentExpr = EMOTION_MAP[this.currentEmotion];
      const currentWeight = this.expressionMixer.getValue(currentExpr);

      if (currentWeight > 0.01) {
        this.expressionMixer.setExpression('emotion', currentExpr, currentWeight * (1 - blendAmount));
      } else {
        this.currentEmotion = this.targetEmotion;

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

    // Update blink base from emotion (additive blink respects eye state)
    if (this.blinkController) {
      this.blinkController.setBaseFromEmotion(this.currentEmotion, this.emotionIntensity);
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

    // Idle stays running via AnimationGraph - no pause needed
  }

  /**
   * Stop speaking
   */
  stopSpeaking(): void {
    this.isSpeaking = false;
    this.lipSyncEngine?.stop();
    // Idle stays running via AnimationGraph - no resume needed
  }

  /**
   * Set listening state (user is speaking)
   */
  setListening(listening: boolean): void {
    this.isListening = listening;
    if (listening) {
      this.lastUserMessageTime = Date.now();
    }
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
   * Get animation graph
   */
  get graph(): AnimationGraph | null {
    return this.animationGraph;
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    emotion: Emotion;
    intensity: number;
    isSpeaking: boolean;
    isListening: boolean;
    isBlinking: boolean;
  } {
    return {
      emotion: this.currentEmotion,
      intensity: this.emotionIntensity,
      isSpeaking: this.isSpeaking,
      isListening: this.isListening,
      isBlinking: this.blinkController?.isBlinking() ?? false,
    };
  }

  /**
   * Dispose all systems
   */
  dispose(): void {
    this.blinkController?.dispose();
    this.lookAtSystem?.dispose();
    this.headGlanceSystem?.dispose();
    this.lipSyncEngine?.stop();
    this.animationGraph?.dispose();
    this.expressionMixer.dispose();

    this.initialized = false;
    this.vrm = null;

    console.log('[AnimationController] Disposed');
  }
}

export default AnimationController;
