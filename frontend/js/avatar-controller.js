/**
 * Emilia Web App - Avatar Expression Controller
 * Controls VRM facial expressions and animations based on mood/emotion commands
 */

// Map incoming mood names to VRM expression names
const MOOD_TO_VRM_EXPRESSION = {
    // Direct mappings
    'happy': 'happy',
    'joy': 'happy',
    'sad': 'sad',
    'sorrow': 'sad',
    'angry': 'angry',
    'surprised': 'surprised',
    'neutral': 'neutral',
    
    // Extended mappings
    'thinking': 'neutral',      // No direct VRM expression, use neutral
    'curious': 'surprised',     // Slight surprise for curiosity
    'excited': 'happy',
    'worried': 'sad',
    'confused': 'surprised',
    'relaxed': 'relaxed',
    'bored': 'neutral',
    'shy': 'neutral',           // Could add slight blush if available
    'love': 'happy',
    'playful': 'happy',
    'confident': 'neutral',
    'embarrassed': 'neutral',
    'sleepy': 'relaxed'
};

// VRM expression names that are typically available
const VRM_EXPRESSIONS = [
    'happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral',
    'joy', 'sorrow',  // Alternative names some VRMs use
    'blink', 'blinkLeft', 'blinkRight',  // Blink expressions
    'aa', 'ih', 'ou', 'ee', 'oh'  // Viseme expressions for lip sync
];

/**
 * Avatar Expression Controller
 * Manages smooth transitions between facial expressions
 */
export class AvatarExpressionController {
    constructor(vrm) {
        this.vrm = vrm;
        this.expressionManager = vrm?.expressionManager;
        
        // Current expression state
        this.currentMood = 'neutral';
        this.currentIntensity = 0;
        this.targetMood = 'neutral';
        this.targetIntensity = 0;
        
        // Blend speed (0-1, higher = faster transitions)
        this.blendSpeed = 0.08;
        
        // Track active expressions for smooth blending
        this.activeExpressions = new Map(); // expressionName -> currentValue
        
        // Animation state
        this.currentAnimation = null;
        this.animationProgress = 0;
        
        // Available expressions (detected from VRM)
        this.availableExpressions = new Set();
        this._detectAvailableExpressions();
        
        console.log('[AvatarController] Initialized with expressions:', 
            Array.from(this.availableExpressions));
    }
    
    /**
     * Detect which expressions are available in the loaded VRM
     */
    _detectAvailableExpressions() {
        if (!this.expressionManager) {
            console.warn('[AvatarController] No expression manager available');
            return;
        }
        
        // Check each possible expression
        for (const expr of VRM_EXPRESSIONS) {
            try {
                // Try to get the expression - if it exists, it's available
                const value = this.expressionManager.getValue(expr);
                if (value !== undefined) {
                    this.availableExpressions.add(expr);
                }
            } catch (e) {
                // Expression not available
            }
        }
        
        // Also check expressionMap if available (VRM 1.0)
        if (this.expressionManager.expressionMap) {
            for (const [name] of this.expressionManager.expressionMap) {
                this.availableExpressions.add(name);
            }
        }
    }
    
    /**
     * Get the VRM expression name for a mood
     */
    _getVrmExpression(mood) {
        const normalizedMood = mood.toLowerCase();
        
        // Check direct mapping first
        if (MOOD_TO_VRM_EXPRESSION[normalizedMood]) {
            const mapped = MOOD_TO_VRM_EXPRESSION[normalizedMood];
            // Verify it's available
            if (this.availableExpressions.has(mapped)) {
                return mapped;
            }
            // Try alternative names
            if (mapped === 'happy' && this.availableExpressions.has('joy')) {
                return 'joy';
            }
            if (mapped === 'sad' && this.availableExpressions.has('sorrow')) {
                return 'sorrow';
            }
        }
        
        // Check if mood name directly matches an available expression
        if (this.availableExpressions.has(normalizedMood)) {
            return normalizedMood;
        }
        
        // Fallback to neutral
        return this.availableExpressions.has('neutral') ? 'neutral' : null;
    }
    
    /**
     * Set the target mood - will smoothly blend to this expression
     * @param {string} mood - Mood name (e.g., 'happy', 'sad', 'thinking')
     * @param {number} intensity - Expression intensity 0-1 (default: 1)
     */
    setMood(mood, intensity = 1) {
        if (!this.expressionManager) {
            console.warn('[AvatarController] Cannot set mood: no expression manager');
            return;
        }
        
        const vrmExpression = this._getVrmExpression(mood);
        if (!vrmExpression) {
            console.warn(`[AvatarController] No VRM expression for mood: ${mood}`);
            return;
        }
        
        // Clamp intensity
        intensity = Math.max(0, Math.min(1, intensity));
        
        console.log(`[AvatarController] Setting mood: ${mood} -> ${vrmExpression} @ ${intensity}`);
        
        this.targetMood = vrmExpression;
        this.targetIntensity = intensity;
    }
    
    /**
     * Trigger a named animation
     * @param {string} animationName - Animation name (e.g., 'wave', 'nod', 'thinking_pose')
     */
    triggerAnimation(animationName) {
        console.log(`[AvatarController] Triggering animation: ${animationName}`);
        
        // Use AnimationTriggerSystem for bone-based animations if available
        if (window.animationTrigger) {
            const boneAnimations = ['nod', 'head_shake', 'shake', 'thinking_pose', 'thinking', 'wave', 'surprised'];
            const normalizedName = animationName.toLowerCase();
            
            if (boneAnimations.includes(normalizedName)) {
                window.animationTrigger.trigger(normalizedName);
                this.currentAnimation = animationName;
                this.animationProgress = 0;
                return;
            }
        }
        
        // Fall back to expression-based animations
        switch (animationName.toLowerCase()) {
            case 'nod':
                // Quick blink + slight expression change to simulate acknowledgment
                this._playBlinkSequence(2, 150);
                break;
                
            case 'wave':
                // Friendly expression
                this.setMood('happy', 0.6);
                setTimeout(() => this.setMood('neutral', 0), 2000);
                break;
                
            case 'thinking':
            case 'thinking_pose':
                // Subtle expression for thinking
                this.setMood('neutral', 0.3);
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
                
            case 'blush':
            case 'embarrassed':
                // If we had a blush expression, we'd use it
                this.setMood('neutral', 0.5);
                break;
                
            default:
                console.log(`[AvatarController] Unknown animation: ${animationName}`);
        }
        
        this.currentAnimation = animationName;
        this.animationProgress = 0;
    }
    
    /**
     * Play a sequence of blinks
     */
    _playBlinkSequence(count, intervalMs) {
        if (!this.expressionManager) return;
        
        let i = 0;
        const doBlink = () => {
            if (i >= count) return;
            
            this.expressionManager.setValue('blink', 1);
            setTimeout(() => {
                this.expressionManager.setValue('blink', 0);
                i++;
                if (i < count) {
                    setTimeout(doBlink, intervalMs);
                }
            }, 80);
        };
        doBlink();
    }
    
    /**
     * Update method - call each frame to smoothly blend expressions
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (!this.expressionManager) return;
        
        // Calculate blend amount for this frame
        // Adjust blend speed based on deltaTime for frame-rate independence
        const blendAmount = Math.min(1, this.blendSpeed * (deltaTime * 60));
        
        // Blend current mood toward target
        if (this.currentMood !== this.targetMood || 
            Math.abs(this.currentIntensity - this.targetIntensity) > 0.01) {
            
            // If changing to a different expression
            if (this.currentMood !== this.targetMood) {
                // Fade out current expression
                const currentValue = this.activeExpressions.get(this.currentMood) || 0;
                const newCurrentValue = currentValue * (1 - blendAmount);
                
                if (newCurrentValue < 0.01) {
                    // Current expression has faded out
                    this._setExpression(this.currentMood, 0);
                    this.activeExpressions.delete(this.currentMood);
                    this.currentMood = this.targetMood;
                    this.currentIntensity = 0;
                } else {
                    this._setExpression(this.currentMood, newCurrentValue);
                    this.activeExpressions.set(this.currentMood, newCurrentValue);
                }
                
                // Fade in target expression
                const targetValue = this.activeExpressions.get(this.targetMood) || 0;
                const newTargetValue = targetValue + (this.targetIntensity - targetValue) * blendAmount;
                this._setExpression(this.targetMood, newTargetValue);
                this.activeExpressions.set(this.targetMood, newTargetValue);
            } else {
                // Same expression, just changing intensity
                this.currentIntensity += (this.targetIntensity - this.currentIntensity) * blendAmount;
                this._setExpression(this.currentMood, this.currentIntensity);
                this.activeExpressions.set(this.currentMood, this.currentIntensity);
            }
        }
    }
    
    /**
     * Directly set an expression value on the VRM
     */
    _setExpression(name, value) {
        if (!this.expressionManager) return;
        
        try {
            this.expressionManager.setValue(name, value);
        } catch (e) {
            // Silently fail for unavailable expressions
        }
    }
    
    /**
     * Reset to neutral expression
     */
    reset() {
        this.targetMood = 'neutral';
        this.targetIntensity = 0;
        
        // Clear all active expressions
        for (const [name] of this.activeExpressions) {
            this._setExpression(name, 0);
        }
        this.activeExpressions.clear();
        
        this.currentMood = 'neutral';
        this.currentIntensity = 0;
    }
    
    /**
     * Get current state (for debugging)
     */
    getState() {
        return {
            currentMood: this.currentMood,
            currentIntensity: this.currentIntensity,
            targetMood: this.targetMood,
            targetIntensity: this.targetIntensity,
            activeExpressions: Object.fromEntries(this.activeExpressions),
            availableExpressions: Array.from(this.availableExpressions)
        };
    }
}

// Default export
export default AvatarExpressionController;
