/**
 * AnimationTriggerSystem - Triggered animations for VRM avatar
 * Handles nod, head_shake, thinking_pose, wave, and other triggered animations
 */

class AnimationTriggerSystem {
    constructor(vrm) {
        this.vrm = vrm;
        this.currentAnimation = null;
        this.animationTimer = 0;
        this.animationQueue = [];
        
        // Cache bone references
        this.headBone = this.getBone('head');
        this.neckBone = this.getBone('neck');
        this.rightUpperArmBone = this.getBone('rightUpperArm');
        this.rightLowerArmBone = this.getBone('rightLowerArm');
        
        // Store original rotations
        this.originalRotations = {};
        this.cacheOriginalRotations();
        
        console.log('AnimationTriggerSystem initialized', {
            hasHead: !!this.headBone,
            hasNeck: !!this.neckBone,
            hasRightArm: !!this.rightUpperArmBone
        });
    }
    
    /**
     * Safely get a bone from the VRM humanoid
     */
    getBone(boneName) {
        try {
            if (this.vrm?.humanoid) {
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
     * Cache original bone rotations for reset
     */
    cacheOriginalRotations() {
        const bones = ['head', 'neck', 'rightUpperArm', 'rightLowerArm'];
        
        for (const boneName of bones) {
            const bone = this.getBone(boneName);
            if (bone) {
                this.originalRotations[boneName] = {
                    x: bone.rotation.x,
                    y: bone.rotation.y,
                    z: bone.rotation.z
                };
            }
        }
    }
    
    /**
     * Trigger a named animation
     */
    trigger(animationName) {
        console.log('Triggering animation:', animationName);
        
        // If an animation is playing, queue the new one
        if (this.currentAnimation && animationName !== this.currentAnimation) {
            this.animationQueue.push(animationName);
            return;
        }
        
        this.currentAnimation = animationName;
        this.animationTimer = 0;
        
        // Notify idle system if available
        if (window.idleAnimations) {
            window.idleAnimations.pause();
        }
    }
    
    /**
     * Check if an animation is currently playing
     */
    isPlaying() {
        return this.currentAnimation !== null;
    }
    
    /**
     * Main update loop - call every frame with deltaTime in seconds
     */
    update(deltaTime) {
        if (!this.currentAnimation) {
            // Check queue for pending animations
            if (this.animationQueue.length > 0) {
                this.trigger(this.animationQueue.shift());
            }
            return;
        }
        
        this.animationTimer += deltaTime * 1000;
        
        switch (this.currentAnimation) {
            case 'nod':
                this.animateNod();
                break;
            case 'head_shake':
            case 'shake':
                this.animateHeadShake();
                break;
            case 'thinking_pose':
            case 'thinking':
                this.animateThinking();
                break;
            case 'wave':
                this.animateWave();
                break;
            case 'surprised':
                this.animateSurprised();
                break;
            default:
                console.warn('Unknown animation:', this.currentAnimation);
                this.finishAnimation();
        }
    }
    
    /**
     * Finish current animation and reset
     */
    finishAnimation() {
        this.resetBones();
        this.currentAnimation = null;
        this.animationTimer = 0;
        
        // Resume idle animations
        if (window.idleAnimations) {
            window.idleAnimations.resume();
        }
    }
    
    /**
     * Reset all bones to original rotation
     */
    resetBones() {
        for (const [boneName, rotation] of Object.entries(this.originalRotations)) {
            const bone = this.getBone(boneName);
            if (bone) {
                bone.rotation.x = rotation.x;
                bone.rotation.y = rotation.y;
                bone.rotation.z = rotation.z;
            }
        }
    }
    
    /**
     * Nod animation - head down then up over 1000ms
     */
    animateNod() {
        if (!this.headBone) {
            this.finishAnimation();
            return;
        }
        
        const t = this.animationTimer / 1000;
        const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
        
        if (t < 0.3) {
            // Down phase
            this.headBone.rotation.x = orig.x + (-0.15 * (t / 0.3));
        } else if (t < 0.6) {
            // Up phase
            this.headBone.rotation.x = orig.x + (-0.15 + 0.15 * ((t - 0.3) / 0.3));
        } else {
            this.finishAnimation();
        }
    }
    
    /**
     * Head shake animation - left-right-left over 1000ms
     */
    animateHeadShake() {
        if (!this.headBone) {
            this.finishAnimation();
            return;
        }
        
        const t = this.animationTimer / 1000;
        const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
        
        if (t < 1) {
            // Sinusoidal shake - 3 oscillations
            this.headBone.rotation.y = orig.y + (Math.sin(t * Math.PI * 3) * 0.1);
        } else {
            this.finishAnimation();
        }
    }
    
    /**
     * Thinking pose - tilt head, look up for 2000ms then return
     */
    animateThinking() {
        if (!this.headBone) {
            this.finishAnimation();
            return;
        }
        
        const t = this.animationTimer / 2000;
        const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
        
        if (t < 0.2) {
            // Ease into thinking pose
            const easeT = t / 0.2;
            this.headBone.rotation.z = orig.z + (0.1 * easeT);
            this.headBone.rotation.x = orig.x + (-0.05 * easeT);
        } else if (t < 0.8) {
            // Hold thinking pose
            this.headBone.rotation.z = orig.z + 0.1;
            this.headBone.rotation.x = orig.x - 0.05;
        } else if (t < 1) {
            // Ease out of thinking pose
            const easeT = (t - 0.8) / 0.2;
            this.headBone.rotation.z = orig.z + (0.1 * (1 - easeT));
            this.headBone.rotation.x = orig.x + (-0.05 * (1 - easeT));
        } else {
            this.finishAnimation();
        }
    }
    
    /**
     * Wave animation - uses arm if available, otherwise just happy expression
     */
    animateWave() {
        const t = this.animationTimer / 2000;
        
        // Try to use arm bones
        if (this.rightUpperArmBone && this.rightLowerArmBone) {
            const origUpper = this.originalRotations.rightUpperArm || { x: 0, y: 0, z: 0 };
            const origLower = this.originalRotations.rightLowerArm || { x: 0, y: 0, z: 0 };
            
            if (t < 0.2) {
                // Raise arm
                const easeT = t / 0.2;
                this.rightUpperArmBone.rotation.z = origUpper.z + (-1.2 * easeT);
                this.rightLowerArmBone.rotation.y = origLower.y + (0.5 * easeT);
            } else if (t < 0.8) {
                // Wave back and forth
                const waveT = (t - 0.2) / 0.6;
                this.rightUpperArmBone.rotation.z = origUpper.z - 1.2;
                this.rightLowerArmBone.rotation.y = origLower.y + 0.5 + (Math.sin(waveT * Math.PI * 4) * 0.3);
            } else if (t < 1) {
                // Lower arm
                const easeT = (t - 0.8) / 0.2;
                this.rightUpperArmBone.rotation.z = origUpper.z + (-1.2 * (1 - easeT));
                this.rightLowerArmBone.rotation.y = origLower.y + (0.5 * (1 - easeT));
            }
        }
        
        // Also show happy expression during wave
        if (this.vrm?.expressionManager && t < 1) {
            const expressionValue = t < 0.1 ? t / 0.1 : (t > 0.9 ? (1 - t) / 0.1 : 1);
            this.vrm.expressionManager.setValue('happy', expressionValue * 0.5);
        }
        
        if (t >= 1) {
            if (this.vrm?.expressionManager) {
                this.vrm.expressionManager.setValue('happy', 0);
            }
            this.finishAnimation();
        }
    }
    
    /**
     * Surprised animation - quick head back, eyes wide
     */
    animateSurprised() {
        if (!this.headBone) {
            this.finishAnimation();
            return;
        }
        
        const t = this.animationTimer / 1500;
        const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
        
        // Set surprised expression
        if (this.vrm?.expressionManager) {
            const exprValue = t < 0.1 ? t / 0.1 : (t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1);
            this.vrm.expressionManager.setValue('surprised', exprValue);
        }
        
        if (t < 0.15) {
            // Quick head back
            const easeT = t / 0.15;
            this.headBone.rotation.x = orig.x + (-0.1 * easeT);
        } else if (t < 0.7) {
            // Hold
            this.headBone.rotation.x = orig.x - 0.1;
        } else if (t < 1) {
            // Return
            const easeT = (t - 0.7) / 0.3;
            this.headBone.rotation.x = orig.x + (-0.1 * (1 - easeT));
        } else {
            if (this.vrm?.expressionManager) {
                this.vrm.expressionManager.setValue('surprised', 0);
            }
            this.finishAnimation();
        }
    }
}

// Export for module usage
export { AnimationTriggerSystem };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
    window.AnimationTriggerSystem = AnimationTriggerSystem;
}
