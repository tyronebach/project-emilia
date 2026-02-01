/**
 * Emilia Expression Controller
 * Controls VRM facial expressions based on mood commands
 */

import type { VRM, VRMExpressionManager } from '@pixiv/three-vrm';

const MOOD_TO_EXPRESSION: Record<string, string> = {
  'happy': 'happy',
  'joy': 'happy',
  'sad': 'sad',
  'sorrow': 'sad',
  'angry': 'angry',
  'surprised': 'surprised',
  'neutral': 'neutral',
  'thinking': 'neutral',
  'curious': 'surprised',
  'excited': 'happy',
  'worried': 'sad',
  'confused': 'surprised',
  'relaxed': 'relaxed',
  'bored': 'neutral',
  'love': 'happy',
  'playful': 'happy',
  'shy': 'neutral',
  'embarrassed': 'neutral',
  'sleepy': 'relaxed'
};

const VRM_EXPRESSIONS = [
  'happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral',
  'joy', 'sorrow',
  'blink', 'blinkLeft', 'blinkRight',
  'aa', 'ih', 'ou', 'ee', 'oh'
];

export class ExpressionController {
  // VRM reference kept for potential future use
  public readonly vrm: VRM;
  private expressionManager: VRMExpressionManager | null;
  
  private currentMood: string = 'neutral';
  private currentIntensity: number = 0;
  private targetMood: string = 'neutral';
  private targetIntensity: number = 0;
  
  private blendSpeed: number = 0.08;
  private activeExpressions: Map<string, number> = new Map();
  private availableExpressions: Set<string> = new Set();
  
  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.expressionManager = vrm?.expressionManager ?? null;
    
    this._detectExpressions();
    
    console.log('[ExpressionController] Available:', Array.from(this.availableExpressions));
  }
  
  private _detectExpressions(): void {
    if (!this.expressionManager) return;
    
    for (const expr of VRM_EXPRESSIONS) {
      try {
        const value = this.expressionManager.getValue(expr);
        if (value !== undefined) {
          this.availableExpressions.add(expr);
        }
      } catch (_e) { /* ignore */ }
    }
    
    // Check expressionMap for VRM 1.0
    const em = this.expressionManager as VRMExpressionManager & { expressionMap?: Map<string, unknown> | Record<string, unknown> };
    if (em.expressionMap) {
      const map = em.expressionMap;
      if (map instanceof Map) {
        for (const [name] of map) {
          this.availableExpressions.add(name);
        }
      } else if (typeof map === 'object') {
        for (const name of Object.keys(map)) {
          this.availableExpressions.add(name);
        }
      }
    }
  }
  
  private _getVrmExpression(mood: string): string | null {
    const normalized = mood.toLowerCase();
    
    if (MOOD_TO_EXPRESSION[normalized]) {
      const mapped = MOOD_TO_EXPRESSION[normalized];
      if (this.availableExpressions.has(mapped)) return mapped;
      if (mapped === 'happy' && this.availableExpressions.has('joy')) return 'joy';
      if (mapped === 'sad' && this.availableExpressions.has('sorrow')) return 'sorrow';
    }
    
    if (this.availableExpressions.has(normalized)) return normalized;
    
    return this.availableExpressions.has('neutral') ? 'neutral' : null;
  }
  
  /**
   * Set target mood
   */
  setMood(mood: string, intensity: number = 1): void {
    if (!this.expressionManager) return;
    
    const vrmExpr = this._getVrmExpression(mood);
    if (!vrmExpr) {
      console.warn(`[ExpressionController] No expression for: ${mood}`);
      return;
    }
    
    intensity = Math.max(0, Math.min(1, intensity));
    
    console.log(`[ExpressionController] ${mood} -> ${vrmExpr} @ ${intensity}`);
    
    this.targetMood = vrmExpr;
    this.targetIntensity = intensity;
  }
  
  /**
   * Trigger animation via expression
   */
  triggerAnimation(name: string): void {
    console.log(`[ExpressionController] Animation: ${name}`);
    
    switch (name.toLowerCase()) {
      case 'nod':
        this._playBlinkSequence(2, 150);
        break;
      case 'wave':
        this.setMood('happy', 0.6);
        setTimeout(() => this.setMood('neutral', 0), 2000);
        break;
      case 'surprised':
      case 'surprise':
        this.setMood('surprised', 0.8);
        setTimeout(() => this.setMood('neutral', 0), 1500);
        break;
      case 'laugh':
      case 'giggle':
        this.setMood('happy', 1.0);
        this._playBlinkSequence(3, 100);
        setTimeout(() => this.setMood('neutral', 0), 2000);
        break;
    }
  }
  
  private _playBlinkSequence(count: number, intervalMs: number): void {
    if (!this.expressionManager) return;
    
    let i = 0;
    const em = this.expressionManager;
    
    const doBlink = (): void => {
      if (i >= count) return;
      
      em.setValue('blink', 1);
      setTimeout(() => {
        em.setValue('blink', 0);
        i++;
        if (i < count) setTimeout(doBlink, intervalMs);
      }, 80);
    };
    doBlink();
  }
  
  /**
   * Update - call each frame
   */
  update(_deltaTime: number): void {
    if (!this.expressionManager) return;
    
    const blendAmount = Math.min(1, this.blendSpeed * (_deltaTime * 60));
    
    if (this.currentMood !== this.targetMood || 
        Math.abs(this.currentIntensity - this.targetIntensity) > 0.01) {
      
      if (this.currentMood !== this.targetMood) {
        // Fade out current
        const currentValue = this.activeExpressions.get(this.currentMood) || 0;
        const newValue = currentValue * (1 - blendAmount);
        
        if (newValue < 0.01) {
          this._setExpression(this.currentMood, 0);
          this.activeExpressions.delete(this.currentMood);
          this.currentMood = this.targetMood;
          this.currentIntensity = 0;
        } else {
          this._setExpression(this.currentMood, newValue);
          this.activeExpressions.set(this.currentMood, newValue);
        }
        
        // Fade in target
        const targetValue = this.activeExpressions.get(this.targetMood) || 0;
        const newTargetValue = targetValue + (this.targetIntensity - targetValue) * blendAmount;
        this._setExpression(this.targetMood, newTargetValue);
        this.activeExpressions.set(this.targetMood, newTargetValue);
      } else {
        this.currentIntensity += (this.targetIntensity - this.currentIntensity) * blendAmount;
        this._setExpression(this.currentMood, this.currentIntensity);
        this.activeExpressions.set(this.currentMood, this.currentIntensity);
      }
    }
  }
  
  private _setExpression(name: string, value: number): void {
    if (!this.expressionManager) return;
    try {
      this.expressionManager.setValue(name, value);
    } catch (_e) { /* ignore */ }
  }
  
  reset(): void {
    this.targetMood = 'neutral';
    this.targetIntensity = 0;
    
    for (const [name] of this.activeExpressions) {
      this._setExpression(name, 0);
    }
    this.activeExpressions.clear();
    
    this.currentMood = 'neutral';
    this.currentIntensity = 0;
  }
}

export default ExpressionController;
