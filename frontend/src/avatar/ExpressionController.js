/**
 * Emilia Expression Controller
 * Controls VRM facial expressions based on mood commands
 */

const MOOD_TO_EXPRESSION = {
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
  constructor(vrm) {
    this.vrm = vrm;
    this.expressionManager = vrm?.expressionManager;
    
    this.currentMood = 'neutral';
    this.currentIntensity = 0;
    this.targetMood = 'neutral';
    this.targetIntensity = 0;
    
    this.blendSpeed = 0.08;
    this.activeExpressions = new Map();
    this.availableExpressions = new Set();
    
    this._detectExpressions();
    
    console.log('[ExpressionController] Available:', Array.from(this.availableExpressions));
  }
  
  _detectExpressions() {
    if (!this.expressionManager) return;
    
    for (const expr of VRM_EXPRESSIONS) {
      try {
        const value = this.expressionManager.getValue(expr);
        if (value !== undefined) {
          this.availableExpressions.add(expr);
        }
      } catch (e) {}
    }
    
    // Check expressionMap for VRM 1.0
    if (this.expressionManager.expressionMap) {
      const map = this.expressionManager.expressionMap;
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
  
  _getVrmExpression(mood) {
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
  setMood(mood, intensity = 1) {
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
  triggerAnimation(name) {
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
  
  _playBlinkSequence(count, intervalMs) {
    if (!this.expressionManager) return;
    
    let i = 0;
    const doBlink = () => {
      if (i >= count) return;
      
      this.expressionManager.setValue('blink', 1);
      setTimeout(() => {
        this.expressionManager.setValue('blink', 0);
        i++;
        if (i < count) setTimeout(doBlink, intervalMs);
      }, 80);
    };
    doBlink();
  }
  
  /**
   * Update - call each frame
   */
  update(deltaTime) {
    if (!this.expressionManager) return;
    
    const blendAmount = Math.min(1, this.blendSpeed * (deltaTime * 60));
    
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
  
  _setExpression(name, value) {
    if (!this.expressionManager) return;
    try {
      this.expressionManager.setValue(name, value);
    } catch (e) {}
  }
  
  reset() {
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
