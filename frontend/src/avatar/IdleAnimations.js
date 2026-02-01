/**
 * Emilia Idle Animation System
 * Handles blinking, breathing, and subtle micro-movements
 */

export class IdleAnimations {
  constructor(vrm) {
    this.vrm = vrm;
    this.isPaused = false;
    
    // Blink state
    this.blinkTimer = 0;
    this.blinkInterval = 3000 + Math.random() * 2000;
    this.isBlinking = false;
    this.blinkProgress = 0;
    this.blinkDuration = 150;
    
    // Breathing state
    this.breathTimer = 0;
    this.breathCycle = 4000;
    
    // Micro-movement state
    this.microMovementTimer = 0;
    
    // Cache bones
    this.headBone = this.getBone('head');
    this.spineBone = this.getBone('spine');
    
    // Store original rotations
    this.originalHeadRotation = this.headBone ? {
      x: this.headBone.rotation.x,
      y: this.headBone.rotation.y,
      z: this.headBone.rotation.z
    } : null;
    
    this.originalSpinePosition = this.spineBone ? {
      y: this.spineBone.position.y
    } : null;
    
    console.log('[IdleAnimations] Initialized', {
      hasHead: !!this.headBone,
      hasSpine: !!this.spineBone
    });
  }
  
  getBone(name) {
    try {
      if (this.vrm?.humanoid) {
        return this.vrm.humanoid.getNormalizedBoneNode(name) ||
               this.vrm.humanoid.getRawBoneNode(name);
      }
    } catch (e) {}
    return null;
  }
  
  update(deltaTime) {
    if (this.isPaused) return;
    
    const deltaMs = deltaTime * 1000;
    
    this.updateBlink(deltaMs);
    this.updateBreathing(deltaMs);
    this.updateMicroMovements(deltaMs);
  }
  
  updateBlink(deltaMs) {
    if (this.isBlinking) {
      this.blinkProgress += deltaMs;
      const t = this.blinkProgress / this.blinkDuration;
      
      if (t < 0.5) {
        this.setBlinkValue(t * 2);
      } else if (t < 1) {
        this.setBlinkValue(1 - (t - 0.5) * 2);
      } else {
        this.setBlinkValue(0);
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkInterval = 3000 + Math.random() * 2000;
      }
    } else {
      this.blinkTimer += deltaMs;
      if (this.blinkTimer >= this.blinkInterval) {
        this.triggerBlink();
      }
    }
  }
  
  triggerBlink() {
    this.isBlinking = true;
    this.blinkProgress = 0;
    this.blinkTimer = 0;
  }
  
  setBlinkValue(value) {
    if (!this.vrm?.expressionManager) return;
    
    const em = this.vrm.expressionManager;
    
    try {
      if (em.getExpression?.('blink') || em.getValue?.('blink') !== undefined) {
        em.setValue('blink', value);
      } else {
        em.setValue('blinkLeft', value);
        em.setValue('blinkRight', value);
      }
    } catch (e) {}
  }
  
  updateBreathing(deltaMs) {
    this.breathTimer += deltaMs;
    
    const breathPhase = (this.breathTimer / this.breathCycle) * Math.PI * 2;
    const breathAmount = Math.sin(breathPhase) * 0.002;
    
    if (this.spineBone && this.originalSpinePosition) {
      this.spineBone.position.y = this.originalSpinePosition.y + breathAmount;
    }
    
    if (this.breathTimer > this.breathCycle) {
      this.breathTimer -= this.breathCycle;
    }
  }
  
  updateMicroMovements(deltaMs) {
    this.microMovementTimer += deltaMs;
    
    if (!this.headBone || !this.originalHeadRotation) return;
    
    const swayX = Math.sin(this.microMovementTimer / 3000 * Math.PI * 2) * 0.008;
    const swayY = Math.sin(this.microMovementTimer / 4500 * Math.PI * 2) * 0.006;
    const swayZ = Math.sin(this.microMovementTimer / 5000 * Math.PI * 2) * 0.003;
    
    this.headBone.rotation.x = this.originalHeadRotation.x + swayX;
    this.headBone.rotation.y = this.originalHeadRotation.y + swayY;
    this.headBone.rotation.z = this.originalHeadRotation.z + swayZ;
    
    if (this.microMovementTimer > 45000) {
      this.microMovementTimer -= 45000;
    }
  }
  
  pause() {
    this.isPaused = true;
  }
  
  resume() {
    this.isPaused = false;
  }
  
  resetHead() {
    if (this.headBone && this.originalHeadRotation) {
      this.headBone.rotation.x = this.originalHeadRotation.x;
      this.headBone.rotation.y = this.originalHeadRotation.y;
      this.headBone.rotation.z = this.originalHeadRotation.z;
    }
  }
}

export default IdleAnimations;
