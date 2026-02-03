/**
 * Emilia Lip Sync Engine
 * Syncs VRM mouth movements to TTS audio using character timestamps
 */

import type { VRM, VRMExpressionManager } from '@pixiv/three-vrm';
import type { AlignmentData, TimingEntry } from './types';

/**
 * Map character to VRM viseme
 */
function charToViseme(char: string): string {
  const c = char.toLowerCase();
  
  // Vowels
  if (c === 'a') return 'aa';
  if (c === 'e') return 'E';
  if (c === 'i') return 'I';
  if (c === 'o') return 'O';
  if (c === 'u') return 'U';
  
  // Consonants
  if ('pbm'.includes(c)) return 'PP';
  if ('fv'.includes(c)) return 'FF';
  if ('td'.includes(c)) return 'DD';
  if ('kg'.includes(c)) return 'kk';
  if ('sz'.includes(c)) return 'SS';
  if (c === 'r') return 'RR';
  if (c === 'n' || c === 'l') return 'nn';
  if (c === 'h') return 'TH';
  
  return 'sil';
}

const VISEME_EXPRESSIONS: Record<string, string> = {
  'sil': 'viseme_sil',
  'PP': 'viseme_PP',
  'FF': 'viseme_FF',
  'TH': 'viseme_TH',
  'DD': 'viseme_DD',
  'kk': 'viseme_kk',
  'CH': 'viseme_CH',
  'SS': 'viseme_SS',
  'nn': 'viseme_nn',
  'RR': 'viseme_RR',
  'aa': 'viseme_aa',
  'E': 'viseme_E',
  'I': 'viseme_I',
  'O': 'viseme_O',
  'U': 'viseme_U'
};

export class LipSyncEngine {
  private vrm: VRM;
  private alignment: AlignmentData | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private isActive: boolean = false;
  
  private blendSpeed: number = 0.15;
  private currentViseme: string = 'sil';
  private currentWeight: number = 0;
  private targetWeight: number = 0;
  
  private timingData: TimingEntry[] = [];
  private availableExpressions: Set<string> = new Set();
  private useSimpleLipSync: boolean = false;
  
  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.detectAvailableExpressions();
  }
  
  /**
   * Detect what expressions the VRM model supports
   */
  private detectAvailableExpressions(): void {
    const em = this.vrm?.expressionManager;
    if (!em) {
      console.warn('[LipSync] No expression manager');
      return;
    }
    
    // Check for viseme expressions
    const visemeNames = Object.values(VISEME_EXPRESSIONS);
    for (const name of visemeNames) {
      try {
        const expr = em.getExpression(name);
        if (expr) {
          this.availableExpressions.add(name);
        }
      } catch (_e) { /* ignore */ }
    }
    
    // Check for basic mouth expressions as fallback
    const basicMouth = ['aa', 'ih', 'ou', 'ee', 'oh', 'A', 'I', 'U', 'E', 'O'];
    for (const name of basicMouth) {
      try {
        const expr = em.getExpression(name);
        if (expr) {
          this.availableExpressions.add(name);
        }
      } catch (_e) { /* ignore */ }
    }
    
    console.log('[LipSync] Available expressions:', Array.from(this.availableExpressions));
    
    // If no visemes but has basic mouth, use simple mode
    const hasVisemes = visemeNames.some(v => this.availableExpressions.has(v));
    const hasBasicMouth = this.availableExpressions.has('aa') || this.availableExpressions.has('A');
    
    if (!hasVisemes && hasBasicMouth) {
      this.useSimpleLipSync = true;
      console.log('[LipSync] Using simple lip sync (aa only)');
    } else if (!hasVisemes && !hasBasicMouth) {
      console.warn('[LipSync] No lip sync expressions available on this model');
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
      this.timingData.push({
        char: chars[i],
        startMs: charStartTimesMs[i],
        endMs: charStartTimesMs[i] + charDurationsMs[i],
        viseme: charToViseme(chars[i])
      });
    }
    
    console.log(`[LipSync] Prepared ${this.timingData.length} timing entries`);
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
    
    // Scale timing if alignment data is shorter than audio
    const lastEntry = this.timingData[this.timingData.length - 1];
    const alignmentDuration = lastEntry?.endMs || 0;
    
    // Wait for audio metadata to get duration
    const checkAndScale = () => {
      const audioDuration = audioElement.duration * 1000;
      if (audioDuration && alignmentDuration > 0) {
        const ratio = audioDuration / alignmentDuration;
        // Only scale if audio is significantly longer (>20% difference)
        if (ratio > 1.2) {
          console.log(`[LipSync] Scaling timing by ${ratio.toFixed(2)}x (${alignmentDuration}ms → ${audioDuration}ms)`);
          for (const entry of this.timingData) {
            entry.startMs *= ratio;
            entry.endMs *= ratio;
          }
        }
      }
    };
    
    if (audioElement.duration) {
      checkAndScale();
    } else {
      audioElement.addEventListener('loadedmetadata', checkAndScale, { once: true });
    }
    
    console.log('[LipSync] Started');
  }
  
  /**
   * Update each frame
   */
  update(_deltaTime: number): void {
    if (!this.vrm?.expressionManager) return;
    
    const em = this.vrm.expressionManager;
    
    if (!this.isActive || !this.audioElement) {
      // Decay to neutral
      if (this.currentWeight > 0.01) {
        this.currentWeight = Math.max(0, this.currentWeight - this.blendSpeed);
        this.applyViseme(em, this.currentViseme, this.currentWeight);
      }
      return;
    }
    
    const currentTimeMs = this.audioElement.currentTime * 1000;
    const audioDuration = this.audioElement.duration * 1000;
    
    // Debug: log timing periodically
    if (Math.floor(currentTimeMs / 500) !== Math.floor((currentTimeMs - 16) / 500)) {
      const lastEntry = this.timingData[this.timingData.length - 1];
      console.log(`[LipSync] Audio: ${currentTimeMs.toFixed(0)}ms / ${audioDuration.toFixed(0)}ms, Data ends: ${lastEntry?.endMs}ms`);
    }
    
    // Find current viseme
    let targetViseme = 'sil';
    for (const entry of this.timingData) {
      if (currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs) {
        targetViseme = entry.viseme;
        break;
      }
    }
    
    // Transition
    if (targetViseme !== this.currentViseme) {
      this.applyViseme(em, this.currentViseme, 0);
      this.currentViseme = targetViseme;
      this.currentWeight = 0;
    }
    
    this.targetWeight = targetViseme !== 'sil' ? 0.7 : 0;
    this.currentWeight += (this.targetWeight - this.currentWeight) * this.blendSpeed;
    
    this.applyViseme(em, this.currentViseme, this.currentWeight);
  }
  
  /**
   * Map viseme to available expression
   */
  private mapToAvailable(viseme: string): string | null {
    // Direct mapping for basic vowel expressions
    const vowelMap: Record<string, string> = {
      'aa': 'aa', 'A': 'aa',
      'E': 'ee', 'ee': 'ee', 
      'I': 'ih', 'ih': 'ih',
      'O': 'oh', 'oh': 'oh',
      'U': 'ou', 'ou': 'ou',
    };
    
    // Check if we have a direct match
    if (this.availableExpressions.has(viseme)) return viseme;
    
    // Check mapped vowel
    const mapped = vowelMap[viseme];
    if (mapped && this.availableExpressions.has(mapped)) return mapped;
    
    // Fallback to 'aa' for any mouth movement
    if (viseme !== 'sil' && this.availableExpressions.has('aa')) return 'aa';
    
    return null;
  }
  
  /**
   * Apply viseme to expression manager
   */
  private applyViseme(em: VRMExpressionManager, viseme: string, weight: number): void {
    const clampedWeight = Math.min(1, Math.max(0, weight));
    
    // Simple lip sync mode - use available vowel expressions
    if (this.useSimpleLipSync) {
      // Reset all mouth expressions first
      for (const expr of ['aa', 'ih', 'ou', 'ee', 'oh']) {
        if (this.availableExpressions.has(expr)) {
          try { em.setValue(expr, 0); } catch (_e) { /* ignore */ }
        }
      }
      
      // Apply current expression
      const targetExpr = this.mapToAvailable(viseme);
      if (targetExpr) {
        try { em.setValue(targetExpr, clampedWeight); } catch (_e) { /* ignore */ }
      }
      return;
    }
    
    // Full viseme mode
    const expr = VISEME_EXPRESSIONS[viseme];
    if (!expr) return;
    
    try {
      // Reset other visemes
      for (const e of Object.values(VISEME_EXPRESSIONS)) {
        if (e !== expr && this.availableExpressions.has(e)) {
          em.setValue(e, 0);
        }
      }
      if (this.availableExpressions.has(expr)) {
        em.setValue(expr, clampedWeight);
      } else {
        // Fallback to 'aa' for vowels
        if ('aeiou'.includes(viseme.toLowerCase()) && this.availableExpressions.has('aa')) {
          em.setValue('aa', clampedWeight * 0.5);
        }
      }
    } catch (_e) {
      // Last resort fallback
      try {
        if (this.availableExpressions.has('aa')) {
          em.setValue('aa', clampedWeight * 0.3);
        }
      } catch (_e2) { /* ignore */ }
    }
  }
  
  /**
   * Stop and reset
   */
  stop(): void {
    this.isActive = false;
    this.audioElement = null;
    this.alignment = null;
    this.timingData = [];
    
    if (this.vrm?.expressionManager) {
      for (const expr of Object.values(VISEME_EXPRESSIONS)) {
        try {
          this.vrm.expressionManager.setValue(expr, 0);
        } catch (_e) { /* ignore */ }
      }
      try {
        this.vrm.expressionManager.setValue('aa', 0);
      } catch (_e) { /* ignore */ }
    }
    
    this.currentViseme = 'sil';
    this.currentWeight = 0;
    
    console.log('[LipSync] Stopped');
  }
  
  get active(): boolean {
    return this.isActive;
  }
}

export default LipSyncEngine;
