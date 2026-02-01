/**
 * Emilia Animation Trigger System
 * Handles triggered animations (nod, wave, thinking, etc.)
 */

export class AnimationTrigger {
  constructor(vrm) {
    this.vrm = vrm;
    this.currentAnimation = null;
    this.animationTimer = 0;
    this.animationQueue = [];
    
    // Cache bones
    this.headBone = this.getBone('head');
    this.neckBone = this.getBone('neck');
    this.rightUpperArmBone = this.getBone('rightUpperArm');
    this.rightLowerArmBone = this.getBone('rightLowerArm');
    
    // Store original rotations
    this.originalRotations = {};
    this.cacheOriginalRotations();
    
    // Reference to idle system for pausing
    this.idleAnimations = null;
    
    console.log('[AnimationTrigger] Initialized', {
      hasHead: !!this.headBone,
      hasArm: !!this.rightUpperArmBone
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
  
  cacheOriginalRotations() {
    const bones = ['head', 'neck', 'rightUpperArm', 'rightLowerArm'];
    
    for (const name of bones) {
      const bone = this.getBone(name);
      if (bone) {
        this.originalRotations[name] = {
          x: bone.rotation.x,
          y: bone.rotation.y,
          z: bone.rotation.z
        };
      }
    }
  }
  
  /**
   * Set reference to idle animation system
   */
  setIdleAnimations(idleAnimations) {
    this.idleAnimations = idleAnimations;
  }
  
  /**
   * Trigger a named animation
   */
  trigger(name) {
    console.log('[AnimationTrigger] Triggering:', name);
    
    if (this.currentAnimation && name !== this.currentAnimation) {
      this.animationQueue.push(name);
      return;
    }
    
    this.currentAnimation = name;
    this.animationTimer = 0;
    
    // Pause idle animations
    if (this.idleAnimations) {
      this.idleAnimations.pause();
    }
  }
  
  isPlaying() {
    return this.currentAnimation !== null;
  }
  
  update(deltaTime) {
    if (!this.currentAnimation) {
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
        this.finishAnimation();
    }
  }
  
  finishAnimation() {
    this.resetBones();
    this.currentAnimation = null;
    this.animationTimer = 0;
    
    if (this.idleAnimations) {
      this.idleAnimations.resume();
    }
  }
  
  resetBones() {
    for (const [name, rotation] of Object.entries(this.originalRotations)) {
      const bone = this.getBone(name);
      if (bone) {
        bone.rotation.x = rotation.x;
        bone.rotation.y = rotation.y;
        bone.rotation.z = rotation.z;
      }
    }
  }
  
  animateNod() {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }
    
    const t = this.animationTimer / 1000;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
    
    if (t < 0.3) {
      this.headBone.rotation.x = orig.x + (-0.15 * (t / 0.3));
    } else if (t < 0.6) {
      this.headBone.rotation.x = orig.x + (-0.15 + 0.15 * ((t - 0.3) / 0.3));
    } else {
      this.finishAnimation();
    }
  }
  
  animateHeadShake() {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }
    
    const t = this.animationTimer / 1000;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
    
    if (t < 1) {
      this.headBone.rotation.y = orig.y + (Math.sin(t * Math.PI * 3) * 0.1);
    } else {
      this.finishAnimation();
    }
  }
  
  animateThinking() {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }
    
    const t = this.animationTimer / 2000;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
    
    if (t < 0.2) {
      const easeT = t / 0.2;
      this.headBone.rotation.z = orig.z + (0.1 * easeT);
      this.headBone.rotation.x = orig.x + (-0.05 * easeT);
    } else if (t < 0.8) {
      this.headBone.rotation.z = orig.z + 0.1;
      this.headBone.rotation.x = orig.x - 0.05;
    } else if (t < 1) {
      const easeT = (t - 0.8) / 0.2;
      this.headBone.rotation.z = orig.z + (0.1 * (1 - easeT));
      this.headBone.rotation.x = orig.x + (-0.05 * (1 - easeT));
    } else {
      this.finishAnimation();
    }
  }
  
  animateWave() {
    const t = this.animationTimer / 2000;
    
    if (this.rightUpperArmBone && this.rightLowerArmBone) {
      const origUpper = this.originalRotations.rightUpperArm || { x: 0, y: 0, z: 0 };
      const origLower = this.originalRotations.rightLowerArm || { x: 0, y: 0, z: 0 };
      
      if (t < 0.2) {
        const easeT = t / 0.2;
        this.rightUpperArmBone.rotation.z = origUpper.z + (-1.2 * easeT);
        this.rightLowerArmBone.rotation.y = origLower.y + (0.5 * easeT);
      } else if (t < 0.8) {
        const waveT = (t - 0.2) / 0.6;
        this.rightUpperArmBone.rotation.z = origUpper.z - 1.2;
        this.rightLowerArmBone.rotation.y = origLower.y + 0.5 + (Math.sin(waveT * Math.PI * 4) * 0.3);
      } else if (t < 1) {
        const easeT = (t - 0.8) / 0.2;
        this.rightUpperArmBone.rotation.z = origUpper.z + (-1.2 * (1 - easeT));
        this.rightLowerArmBone.rotation.y = origLower.y + (0.5 * (1 - easeT));
      }
    }
    
    // Happy expression
    if (this.vrm?.expressionManager && t < 1) {
      const v = t < 0.1 ? t / 0.1 : (t > 0.9 ? (1 - t) / 0.1 : 1);
      this.vrm.expressionManager.setValue('happy', v * 0.5);
    }
    
    if (t >= 1) {
      if (this.vrm?.expressionManager) {
        this.vrm.expressionManager.setValue('happy', 0);
      }
      this.finishAnimation();
    }
  }
  
  animateSurprised() {
    if (!this.headBone) {
      this.finishAnimation();
      return;
    }
    
    const t = this.animationTimer / 1500;
    const orig = this.originalRotations.head || { x: 0, y: 0, z: 0 };
    
    if (this.vrm?.expressionManager) {
      const v = t < 0.1 ? t / 0.1 : (t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1);
      this.vrm.expressionManager.setValue('surprised', v);
    }
    
    if (t < 0.15) {
      const easeT = t / 0.15;
      this.headBone.rotation.x = orig.x + (-0.1 * easeT);
    } else if (t < 0.7) {
      this.headBone.rotation.x = orig.x - 0.1;
    } else if (t < 1) {
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

export default AnimationTrigger;
