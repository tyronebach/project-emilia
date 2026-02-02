/**
 * IdleAnimationSystem - Natural idle behaviors for VRM avatar
 * Handles blinking, breathing, and subtle micro-movements
 */

class IdleAnimationSystem {
    constructor(vrm) {
        this.vrm = vrm;
        
        // Blink state
        this.blinkTimer = 0;
        this.blinkInterval = 3000 + Math.random() * 2000; // 3-5 sec
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkDuration = 150; // ms for full blink cycle
        
        // Breathing state
        this.breathTimer = 0;
        this.breathCycle = 4000; // 4 second breathing cycle
        
        // Micro-movement state
        this.microMovementTimer = 0;
        this.headSwayX = 0;
        this.headSwayY = 0;
        
        // Cache bone references
        this.headBone = this.getBone('head');
        this.spineBone = this.getBone('spine');
        this.chestBone = this.getBone('chest');
        
        // Store original rotations to avoid drift
        this.originalHeadRotation = this.headBone ? {
            x: this.headBone.rotation.x,
            y: this.headBone.rotation.y,
            z: this.headBone.rotation.z
        } : null;
        
        this.originalSpinePosition = this.spineBone ? {
            y: this.spineBone.position.y
        } : null;
        
        console.log('IdleAnimationSystem initialized', {
            hasHead: !!this.headBone,
            hasSpine: !!this.spineBone,
            hasChest: !!this.chestBone
        });
    }
    
    /**
     * Safely get a bone from the VRM humanoid
     */
    getBone(boneName) {
        try {
            if (this.vrm?.humanoid) {
                // VRM 1.0 API
                const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName) 
                          || this.vrm.humanoid.getRawBoneNode(boneName);
                return bone;
            }
        } catch (e) {
            console.warn(`Could not get bone '${boneName}':`, e.message);
        }
        return null;
    }
    
    /**
     * Main update loop - call every frame with deltaTime in seconds
     */
    update(deltaTime) {
        const deltaMs = deltaTime * 1000;
        
        this.updateBlink(deltaMs);
        this.updateBreathing(deltaMs);
        this.updateMicroMovements(deltaMs);
    }
    
    /**
     * Update blink animation
     */
    updateBlink(deltaMs) {
        if (this.isBlinking) {
            // Currently in a blink animation
            this.blinkProgress += deltaMs;
            
            const t = this.blinkProgress / this.blinkDuration;
            
            if (t < 0.5) {
                // Eyes closing (0 -> 1)
                this.setBlinkValue(t * 2);
            } else if (t < 1) {
                // Eyes opening (1 -> 0)
                this.setBlinkValue(1 - (t - 0.5) * 2);
            } else {
                // Blink complete
                this.setBlinkValue(0);
                this.isBlinking = false;
                this.blinkProgress = 0;
                // Set next blink interval
                this.blinkInterval = 3000 + Math.random() * 2000;
            }
        } else {
            // Waiting for next blink
            this.blinkTimer += deltaMs;
            
            if (this.blinkTimer >= this.blinkInterval) {
                this.triggerBlink();
            }
        }
    }
    
    /**
     * Trigger a blink animation
     */
    triggerBlink() {
        this.isBlinking = true;
        this.blinkProgress = 0;
        this.blinkTimer = 0;
    }
    
    /**
     * Set blink blend shape value
     */
    setBlinkValue(value) {
        if (!this.vrm?.expressionManager) return;
        
        const manager = this.vrm.expressionManager;
        
        // Try different blink expression names
        // VRM 1.0 uses 'blink', some models have 'blinkLeft'/'blinkRight'
        if (manager.getExpression('blink')) {
            manager.setValue('blink', value);
        } else {
            // Fall back to separate eye blinks
            if (manager.getExpression('blinkLeft')) {
                manager.setValue('blinkLeft', value);
            }
            if (manager.getExpression('blinkRight')) {
                manager.setValue('blinkRight', value);
            }
        }
    }
    
    /**
     * Update breathing animation - subtle chest/spine movement
     */
    updateBreathing(deltaMs) {
        this.breathTimer += deltaMs;
        
        // Sine wave for smooth breathing
        const breathPhase = (this.breathTimer / this.breathCycle) * Math.PI * 2;
        const breathAmount = Math.sin(breathPhase) * 0.002; // Very subtle
        
        // Apply to spine or chest
        if (this.spineBone && this.originalSpinePosition) {
            this.spineBone.position.y = this.originalSpinePosition.y + breathAmount;
        }
        
        // Reset timer to prevent overflow
        if (this.breathTimer > this.breathCycle) {
            this.breathTimer -= this.breathCycle;
        }
    }
    
    /**
     * Update micro-movements - very subtle head sway
     */
    updateMicroMovements(deltaMs) {
        this.microMovementTimer += deltaMs;
        
        if (!this.headBone || !this.originalHeadRotation) return;
        
        // Two different frequencies for more natural movement
        const swayX = Math.sin(this.microMovementTimer / 3000 * Math.PI * 2) * 0.008;
        const swayY = Math.sin(this.microMovementTimer / 4500 * Math.PI * 2) * 0.006;
        const swayZ = Math.sin(this.microMovementTimer / 5000 * Math.PI * 2) * 0.003;
        
        // Apply micro-movements (additive to original rotation)
        this.headBone.rotation.x = this.originalHeadRotation.x + swayX;
        this.headBone.rotation.y = this.originalHeadRotation.y + swayY;
        this.headBone.rotation.z = this.originalHeadRotation.z + swayZ;
        
        // Reset timer to prevent overflow (use LCM-ish value)
        if (this.microMovementTimer > 45000) {
            this.microMovementTimer -= 45000;
        }
    }
    
    /**
     * Pause idle animations (e.g., when triggered animation is playing)
     */
    pause() {
        this.isPaused = true;
    }
    
    /**
     * Resume idle animations
     */
    resume() {
        this.isPaused = false;
    }
    
    /**
     * Reset head to original rotation (for triggered animations to take over)
     */
    resetHead() {
        if (this.headBone && this.originalHeadRotation) {
            this.headBone.rotation.x = this.originalHeadRotation.x;
            this.headBone.rotation.y = this.originalHeadRotation.y;
            this.headBone.rotation.z = this.originalHeadRotation.z;
        }
    }
}

// Export for module usage
export { IdleAnimationSystem };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
    window.IdleAnimationSystem = IdleAnimationSystem;
}
