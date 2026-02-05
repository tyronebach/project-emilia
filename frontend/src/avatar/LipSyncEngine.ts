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

export class LipSyncEngine {
  private vrm: VRM;
  private alignment: AlignmentData | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private isActive: boolean = false;
  
  private blendSpeed: number = 0.2;  // Faster blending for more responsive lip sync
  private currentShape: MouthShape = 'sil';
  private currentWeight: number = 0;
  private targetWeight: number = 0;
  
  private timingData: TimingEntry[] = [];
  private availableMouthShapes: Set<string> = new Set();
  
  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.detectAvailableMouthShapes();
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
   */
  setAlignment(alignment: AlignmentData): void {
    this.alignment = alignment;
    this.timingData = [];
    
    if (!alignment) return;
    
    const { chars, charStartTimesMs, charDurationsMs } = alignment;
    
    if (!chars || !charStartTimesMs || !charDurationsMs) {
      console.warn('[LipSync] Incomplete alignment data');
      return;
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
    console.log('[LipSync] Started');
  }
  
  /**
   * Update each frame
   */
  update(_deltaTime: number): void {
    if (!this.vrm?.expressionManager) return;
    
    const em = this.vrm.expressionManager;
    
    if (!this.isActive || !this.audioElement) {
      // Decay to neutral - reset all mouth shapes
      if (this.currentWeight > 0.01) {
        this.currentWeight = Math.max(0, this.currentWeight - this.blendSpeed);
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
    
    // On shape change, reset previous and start new
    if (targetShape !== this.currentShape) {
      console.log(`[LipSync] Shape: ${this.currentShape} → ${targetShape}`, matchedEntry ? `(char: '${matchedEntry.char}')` : '');
      this.applyMouthShape(em, this.currentShape, 0);  // Reset old shape
      this.currentShape = targetShape;
      this.currentWeight = 0;
    }
    
    // Blend towards target weight
    this.targetWeight = targetShape !== 'sil' ? 0.8 : 0;  // Stronger weight for visibility
    this.currentWeight += (this.targetWeight - this.currentWeight) * this.blendSpeed;
    
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
