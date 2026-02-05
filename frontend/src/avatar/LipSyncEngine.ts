/**
 * Emilia Lip Sync Engine
 * Syncs VRM mouth movements to TTS audio using character timestamps
 */

import type { VRM, VRMExpressionManager } from '@pixiv/three-vrm';
import type { AlignmentData, TimingEntry } from './types';

/**
 * Map character to VRM mouth shape
 * Uses VRM standard names: aa, ih, ou, ee, oh
 */
function charToMouthShape(char: string): string {
  const c = char.toLowerCase();
  
  // Vowels - map to VRM standard mouth shapes
  if (c === 'a') return 'aa';
  if (c === 'e') return 'ee';
  if (c === 'i') return 'ih';
  if (c === 'o') return 'oh';
  if (c === 'u') return 'ou';
  
  // Consonants that open the mouth
  if ('pbm'.includes(c)) return 'aa';  // bilabial - closed then open
  if ('fv'.includes(c)) return 'ih';   // labiodental
  if ('td'.includes(c)) return 'ih';   // alveolar
  if ('kg'.includes(c)) return 'oh';   // velar
  if ('sz'.includes(c)) return 'ih';   // sibilant
  if (c === 'r') return 'oh';
  if (c === 'n' || c === 'l') return 'ih';
  if ('wyw'.includes(c)) return 'ou';
  
  // Space or punctuation = silence
  if (' .,!?;:\'"'.includes(c)) return 'sil';
  
  // Default for other consonants - slight mouth opening
  return 'ih';
}

// VRM standard mouth expressions (not Oculus visemes)
const VRM_MOUTH_SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
type MouthShape = typeof VRM_MOUTH_SHAPES[number] | 'sil';

/**
 * Tunable lip sync parameters
 */
export interface LipSyncConfig {
  /** Max mouth shape weight (0-1). Default: 0.8 */
  maxWeight: number;
  /** Blend speed for transitions (0-1). Higher = snappier. Default: 0.2 */
  blendSpeed: number;
  /** Weight threshold for silence. Default: 0.01 */
  silenceThreshold: number;
  /** Minimum hold time per shape in ms. Prevents flickering. Default: 50 */
  minHoldMs: number;
}

const DEFAULT_CONFIG: LipSyncConfig = {
  maxWeight: 0.8,
  blendSpeed: 0.2,
  silenceThreshold: 0.01,
  minHoldMs: 50,
};

export class LipSyncEngine {
  private vrm: VRM;
  private alignment: AlignmentData | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private isActive: boolean = false;
  
  // Tunable config
  private config: LipSyncConfig = { ...DEFAULT_CONFIG };
  
  private currentShape: MouthShape = 'sil';
  private currentWeight: number = 0;
  private targetWeight: number = 0;
  private lastShapeChangeMs: number = 0;
  
  private timingData: TimingEntry[] = [];
  private availableMouthShapes: Set<string> = new Set();
  
  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.detectAvailableMouthShapes();
  }
  
  /**
   * Get current config
   */
  getConfig(): LipSyncConfig {
    return { ...this.config };
  }
  
  /**
   * Update config (partial updates allowed)
   */
  setConfig(updates: Partial<LipSyncConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[LipSync] Config updated:', this.config);
  }
  
  /**
   * Detect which VRM mouth expressions are available
   */
  private detectAvailableMouthShapes(): void {
    const em = this.vrm?.expressionManager;
    if (!em) {
      console.warn('[LipSync] No expression manager');
      return;
    }
    
    // Log all expressions in the VRM
    const emAny = em as VRMExpressionManager & { 
      expressionMap?: Map<string, unknown> | Record<string, unknown>;
      _expressionMap?: Map<string, unknown>;
    };
    
    const allExpressions: string[] = [];
    if (emAny.expressionMap instanceof Map) {
      for (const [name] of emAny.expressionMap) allExpressions.push(name);
    } else if (emAny._expressionMap instanceof Map) {
      for (const [name] of emAny._expressionMap) allExpressions.push(name);
    } else if (emAny.expressionMap && typeof emAny.expressionMap === 'object') {
      allExpressions.push(...Object.keys(emAny.expressionMap));
    }
    console.log('[LipSync] ALL VRM expressions:', allExpressions);
    
    // Check for VRM standard mouth shapes
    for (const shape of VRM_MOUTH_SHAPES) {
      try {
        const expr = em.getExpression(shape);
        if (expr) {
          this.availableMouthShapes.add(shape);
        }
      } catch (_e) { /* ignore */ }
    }
    
    // Also check uppercase variants (some VRM models use 'A', 'I', 'U', 'E', 'O')
    const upperMap: Record<string, string> = { 'A': 'aa', 'I': 'ih', 'U': 'ou', 'E': 'ee', 'O': 'oh' };
    for (const [upper, lower] of Object.entries(upperMap)) {
      try {
        const expr = em.getExpression(upper);
        if (expr && !this.availableMouthShapes.has(lower)) {
          this.availableMouthShapes.add(upper);
        }
      } catch (_e) { /* ignore */ }
    }
    
    console.log('[LipSync] Available mouth shapes:', Array.from(this.availableMouthShapes));
    
    if (this.availableMouthShapes.size === 0) {
      console.warn('[LipSync] ⚠️ No mouth shape expressions found on this VRM model!');
    }
  }
  
  /**
   * Set alignment data from TTS response
   * @param alignment - Character timing data from ElevenLabs
   * @param audioDurationMs - Actual audio duration in ms (for scaling timestamps)
   */
  setAlignment(alignment: AlignmentData, audioDurationMs?: number): void {
    this.alignment = alignment;
    this.timingData = [];
    
    if (!alignment) return;
    
    let { chars, charStartTimesMs, charDurationsMs } = alignment;
    
    if (!chars || !charStartTimesMs || !charDurationsMs) {
      console.warn('[LipSync] Incomplete alignment data');
      return;
    }
    
    // Scale timestamps to actual audio duration if provided
    if (audioDurationMs && audioDurationMs > 0 && charStartTimesMs.length > 0) {
      const lastIdx = charStartTimesMs.length - 1;
      const predictedMs = charStartTimesMs[lastIdx] + (charDurationsMs[lastIdx] || 0);
      
      if (predictedMs > 0) {
        const scale = audioDurationMs / predictedMs;
        console.log(`[LipSync] Scaling: predicted=${predictedMs}ms, actual=${audioDurationMs}ms, scale=${scale.toFixed(3)}`);
        
        charStartTimesMs = charStartTimesMs.map(t => Math.round(t * scale));
        charDurationsMs = charDurationsMs.map(d => Math.round(d * scale));
      }
    }
    
    for (let i = 0; i < chars.length; i++) {
      const mouthShape = charToMouthShape(chars[i]);
      this.timingData.push({
        char: chars[i],
        startMs: charStartTimesMs[i],
        endMs: charStartTimesMs[i] + charDurationsMs[i],
        viseme: mouthShape  // Now using VRM mouth shapes
      });
    }
    
    console.log(`[LipSync] Prepared ${this.timingData.length} timing entries`);
    console.log(`[LipSync] Sample entries:`, this.timingData.slice(0, 5).map(e => `'${e.char}'→${e.viseme}`).join(', '));
  }
  
  /**
   * Start sync with audio element
   */
  startSync(audioElement: HTMLAudioElement): void {
    if (!this.alignment || this.timingData.length === 0) {
      console.log('[LipSync] No alignment data');
      return;
    }
    
    this.audioElement = audioElement;
    this.isActive = true;
    
    // Reset state for fresh start
    this.currentShape = 'sil';
    this.currentWeight = 0;
    this.targetWeight = 0;
    this.lastShapeChangeMs = -1000; // Allow immediate first shape change
    
    console.log('[LipSync] Started, config:', this.config);
  }
  
  /**
   * Update each frame
   */
  update(_deltaTime: number): void {
    if (!this.vrm?.expressionManager) return;
    
    const em = this.vrm.expressionManager;
    const { maxWeight, blendSpeed, silenceThreshold, minHoldMs } = this.config;
    
    if (!this.isActive || !this.audioElement) {
      // Decay to neutral - reset all mouth shapes
      if (this.currentWeight > silenceThreshold) {
        this.currentWeight = Math.max(0, this.currentWeight - blendSpeed);
        this.applyMouthShape(em, this.currentShape, this.currentWeight);
      }
      return;
    }
    
    const currentTimeMs = this.audioElement.currentTime * 1000;
    const audioDuration = this.audioElement.duration * 1000;
    
    // Debug: log timing periodically (every 500ms)
    if (Math.floor(currentTimeMs / 500) !== Math.floor((currentTimeMs - 16) / 500)) {
      const lastEntry = this.timingData[this.timingData.length - 1];
      console.log(`[LipSync] Audio: ${currentTimeMs.toFixed(0)}ms / ${audioDuration.toFixed(0)}ms, Data ends: ${lastEntry?.endMs}ms, Shape: ${this.currentShape} @ ${this.currentWeight.toFixed(2)}`);
    }
    
    // Find current mouth shape from timing data
    let targetShape: MouthShape = 'sil';
    let matchedEntry: TimingEntry | null = null;
    for (const entry of this.timingData) {
      if (currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs) {
        targetShape = entry.viseme as MouthShape;
        matchedEntry = entry;
        break;
      }
    }
    
    // On shape change, reset previous and start new (with min hold time to prevent flicker)
    const timeSinceLastChange = currentTimeMs - this.lastShapeChangeMs;
    if (targetShape !== this.currentShape && timeSinceLastChange >= minHoldMs) {
      console.log(`[LipSync] Shape: ${this.currentShape} → ${targetShape}`, matchedEntry ? `(char: '${matchedEntry.char}')` : '');
      this.applyMouthShape(em, this.currentShape, 0);  // Reset old shape
      this.currentShape = targetShape;
      this.currentWeight = 0;
      this.lastShapeChangeMs = currentTimeMs;
    }
    
    // Blend towards target weight
    this.targetWeight = targetShape !== 'sil' ? maxWeight : 0;
    this.currentWeight += (this.targetWeight - this.currentWeight) * blendSpeed;
    
    this.applyMouthShape(em, this.currentShape, this.currentWeight);
  }
  
  /**
   * Map mouth shape to available expression name
   */
  private mapToAvailable(shape: string): string | null {
    // Direct match
    if (this.availableMouthShapes.has(shape)) return shape;
    
    // Try uppercase variant (some VRM models use 'A', 'I', 'U', 'E', 'O')
    const upperMap: Record<string, string> = { 'aa': 'A', 'ih': 'I', 'ou': 'U', 'ee': 'E', 'oh': 'O' };
    const upper = upperMap[shape];
    if (upper && this.availableMouthShapes.has(upper)) return upper;
    
    // Fallback to 'aa' or 'A' for any mouth movement
    if (shape !== 'sil') {
      if (this.availableMouthShapes.has('aa')) return 'aa';
      if (this.availableMouthShapes.has('A')) return 'A';
    }
    
    return null;
  }
  
  /**
   * Apply mouth shape to VRM expression manager
   */
  private applyMouthShape(em: VRMExpressionManager, shape: MouthShape, weight: number): void {
    const clampedWeight = Math.min(1, Math.max(0, weight));
    
    // Reset all mouth shapes first
    for (const s of this.availableMouthShapes) {
      try { em.setValue(s, 0); } catch (_e) { /* ignore */ }
    }
    
    // Apply target shape if not silence
    if (shape !== 'sil' && clampedWeight > 0.01) {
      const exprName = this.mapToAvailable(shape);
      if (exprName) {
        try { 
          em.setValue(exprName, clampedWeight);
          
          // Throttled logging
          const now = Date.now();
          if (!this._lastApplyLog || now - this._lastApplyLog > 200) {
            console.log(`[LipSync] Apply: ${exprName} = ${clampedWeight.toFixed(2)}`);
            this._lastApplyLog = now;
          }
        } catch (e) { 
          console.warn(`[LipSync] Failed to set ${exprName}:`, e);
        }
      }
    }
  }
  
  private _lastApplyLog?: number;
  
  /**
   * Stop and reset
   */
  stop(): void {
    this.isActive = false;
    this.audioElement = null;
    this.alignment = null;
    this.timingData = [];
    
    // Reset all mouth shapes
    if (this.vrm?.expressionManager) {
      for (const shape of this.availableMouthShapes) {
        try {
          this.vrm.expressionManager.setValue(shape, 0);
        } catch (_e) { /* ignore */ }
      }
    }
    
    this.currentShape = 'sil';
    this.currentWeight = 0;
    
    console.log('[LipSync] Stopped');
  }
  
  get active(): boolean {
    return this.isActive;
  }
}

export default LipSyncEngine;
