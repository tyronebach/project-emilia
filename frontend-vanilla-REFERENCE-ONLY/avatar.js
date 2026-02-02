/**
 * Emilia Avatar Module - VRM Loader
 * Renders VRM avatars using three.js and @pixiv/three-vrm
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { LipSyncEngine } from './js/lip-sync.js';
import { AvatarExpressionController } from './js/avatar-controller.js';
import { IdleAnimationSystem } from './js/idle-animations.js';
import { AnimationTriggerSystem } from './js/animation-trigger.js';

// Default VRM URL for testing
// Local Emilia model (VRM 1.0)
const DEFAULT_VRM_URL = './emilia.vrm';

class AvatarRenderer {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.vrm = null;
        this.clock = new THREE.Clock();
        this.isInitialized = false;
        this.animationFrameId = null;
        this.lipSyncEngine = null;  // Lip sync engine instance
        
        // Animation systems (initialized after VRM loads)
        this.idleAnimations = null;
        this.animationTrigger = null;
        this.expressionController = null;

        // Options with defaults
        this.options = {
            vrmUrl: options.vrmUrl || DEFAULT_VRM_URL,
            backgroundColor: options.backgroundColor || 0x1e293b,
            cameraDistance: options.cameraDistance || 0.6,
            cameraHeight: options.cameraHeight || 1.4,
            enableShadows: options.enableShadows !== false,
            onLoad: options.onLoad || null,
            onError: options.onError || null,
            onProgress: options.onProgress || null
        };
    }

    /**
     * Initialize the renderer and scene
     */
    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`Avatar container #${this.containerId} not found`);
            return false;
        }

        // Get container dimensions
        const width = this.container.clientWidth || 350;
        const height = this.container.clientHeight || 500;

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.options.backgroundColor);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
        this.camera.position.set(0, this.options.cameraHeight, this.options.cameraDistance);
        this.camera.lookAt(0, this.options.cameraHeight - 0.1, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        if (this.options.enableShadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        // Append canvas to container
        this.container.appendChild(this.renderer.domElement);

        // Setup lighting
        this.setupLighting();

        // Setup resize handler
        this.setupResizeHandler();

        this.isInitialized = true;
        console.log('Avatar renderer initialized');
        return true;
    }

    /**
     * Setup scene lighting
     */
    setupLighting() {
        // Ambient light for overall illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Main directional light (key light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(1, 2, 2);
        if (this.options.enableShadows) {
            keyLight.castShadow = true;
            keyLight.shadow.mapSize.width = 1024;
            keyLight.shadow.mapSize.height = 1024;
            keyLight.shadow.camera.near = 0.1;
            keyLight.shadow.camera.far = 10;
        }
        this.scene.add(keyLight);

        // Fill light from the left
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-1, 1, 1);
        this.scene.add(fillLight);

        // Rim light from behind
        const rimLight = new THREE.DirectionalLight(0x6366f1, 0.4);
        rimLight.position.set(0, 1, -2);
        this.scene.add(rimLight);
    }

    /**
     * Setup window resize handler
     */
    setupResizeHandler() {
        this.resizeHandler = () => {
            if (!this.container || !this.camera || !this.renderer) return;

            const width = this.container.clientWidth;
            const height = this.container.clientHeight;

            if (width === 0 || height === 0) return;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        };

        window.addEventListener('resize', this.resizeHandler);

        // Also observe container size changes
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.resizeHandler);
            this.resizeObserver.observe(this.container);
        }
    }

    /**
     * Load VRM model from URL
     */
    async loadVRM(url = null) {
        const vrmUrl = url || this.options.vrmUrl;

        console.log(`Loading VRM from: ${vrmUrl}`);

        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();

            // Register VRM loader plugin
            loader.register((parser) => new VRMLoaderPlugin(parser));

            loader.load(
                vrmUrl,
                (gltf) => {
                    const vrm = gltf.userData.vrm;

                    if (!vrm) {
                        const error = new Error('No VRM data found in loaded model');
                        console.error(error);
                        if (this.options.onError) this.options.onError(error);
                        reject(error);
                        return;
                    }

                    // Remove previous VRM if exists
                    if (this.vrm) {
                        VRMUtils.deepDispose(this.vrm.scene);
                        this.scene.remove(this.vrm.scene);
                    }

                    this.vrm = vrm;

                    // Rotate to face camera (VRMs face +Z by default)
                    VRMUtils.rotateVRM0(vrm);

                    // Add to scene
                    this.scene.add(vrm.scene);

                    // Enable shadows on VRM meshes
                    if (this.options.enableShadows) {
                        vrm.scene.traverse((obj) => {
                            if (obj.isMesh) {
                                obj.castShadow = true;
                                obj.receiveShadow = true;
                            }
                        });
                    }

                    // Initialize animation systems (idle, triggered, expressions)
                    this.idleAnimations = new IdleAnimationSystem(vrm);
                    this.animationTrigger = new AnimationTriggerSystem(vrm);
                    this.expressionController = new AvatarExpressionController(vrm);
                    
                    // Expose globally for external access
                    window.idleAnimations = this.idleAnimations;
                    window.animationTrigger = this.animationTrigger;
                    window.expressionController = this.expressionController;
                    window.avatarController = this.expressionController; // Legacy alias
                    
                    // Convenience functions
                    window.triggerAnimation = (name) => this.animationTrigger.trigger(name);
                    window.setAvatarExpression = (name, intensity) => this.expressionController.setExpression(name, intensity);
                    
                    console.log('Animation systems initialized');

                    // Initialize lip sync engine
                    this.lipSyncEngine = new LipSyncEngine(vrm);
                    window.lipSyncEngine = this.lipSyncEngine;  // Expose globally for TTS module
                    console.log('Lip sync engine initialized');

                    console.log('VRM loaded successfully:', vrm.meta?.name || 'Unknown');

                    if (this.options.onLoad) this.options.onLoad(vrm);
                    resolve(vrm);
                },
                (progress) => {
                    const percent = progress.total > 0
                        ? Math.round((progress.loaded / progress.total) * 100)
                        : 0;
                    console.log(`VRM loading: ${percent}%`);
                    if (this.options.onProgress) this.options.onProgress(percent);
                },
                (error) => {
                    console.error('Failed to load VRM:', error);
                    if (this.options.onError) this.options.onError(error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Start the render loop
     */
    startRenderLoop() {
        if (!this.isInitialized) {
            console.warn('Cannot start render loop: renderer not initialized');
            return;
        }

        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);

            const deltaTime = this.clock.getDelta();

            // Update idle animations (blink, breathe, micro-movements)
            if (this.idleAnimations) {
                this.idleAnimations.update(deltaTime);
            }
            
            // Update triggered animations (nod, wave, etc.)
            if (this.animationTrigger) {
                this.animationTrigger.update(deltaTime);
            }
            
            // Update lip sync (viseme animations synced to TTS audio)
            if (this.lipSyncEngine) {
                this.lipSyncEngine.update(deltaTime);
            }

            // Update VRM
            if (this.vrm) {
                this.vrm.update(deltaTime);
            }

            // Render
            this.renderer.render(this.scene, this.camera);
        };

        animate();
        console.log('Render loop started');
    }

    /**
     * Stop the render loop
     */
    stopRenderLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            console.log('Render loop stopped');
        }
    }

    /**
     * Set a blink expression (for idle animation)
     */
    blink(duration = 0.1) {
        if (!this.vrm?.expressionManager) return;

        const manager = this.vrm.expressionManager;
        manager.setValue('blink', 1);

        setTimeout(() => {
            manager.setValue('blink', 0);
        }, duration * 1000);
    }

    /**
     * Start idle blink animation
     * Note: IdleAnimationSystem now handles this automatically in the render loop
     */
    startIdleAnimation() {
        // Legacy: IdleAnimationSystem handles idle animations automatically
        // This method is kept for backwards compatibility
        if (this.idleAnimations) {
            this.idleAnimations.resume();
        }
    }

    /**
     * Stop idle animation
     */
    stopIdleAnimation() {
        // Legacy: IdleAnimationSystem handles idle animations automatically
        if (this.idleAnimations) {
            this.idleAnimations.pause();
        }
    }

    /**
     * Set lip sync value (0-1)
     */
    setLipSync(value) {
        if (!this.vrm?.expressionManager) return;
        this.vrm.expressionManager.setValue('aa', Math.min(1, Math.max(0, value)));
    }

    /**
     * Set expression
     */
    setExpression(name, value = 1) {
        if (!this.vrm?.expressionManager) return;
        this.vrm.expressionManager.setValue(name, value);
    }

    /**
     * Look at a point in world space
     */
    lookAt(x, y, z) {
        if (!this.vrm?.lookAt) return;
        this.vrm.lookAt.target = new THREE.Vector3(x, y, z);
    }

    /**
     * Cleanup and dispose resources
     */
    dispose() {
        this.stopRenderLoop();
        this.stopIdleAnimation();

        // Remove event listeners
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Dispose VRM
        if (this.vrm) {
            VRMUtils.deepDispose(this.vrm.scene);
        }

        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container && this.renderer.domElement.parentNode === this.container) {
                this.container.removeChild(this.renderer.domElement);
            }
        }

        this.isInitialized = false;
        console.log('Avatar renderer disposed');
    }
}

/**
 * Initialize avatar in the page
 */
async function initAvatar() {
    const avatarContainer = document.getElementById('avatarContainer');
    const avatarDisplay = document.getElementById('avatarDisplay');
    const placeholder = avatarContainer?.querySelector('.avatar-placeholder');

    if (!avatarDisplay) {
        console.log('Avatar display element not found - avatar disabled');
        return null;
    }

    // Show loading state
    if (placeholder) {
        placeholder.querySelector('.avatar-hint').innerHTML = 'Loading avatar...';
    }

    const avatar = new AvatarRenderer('avatarDisplay', {
        onLoad: (vrm) => {
            // Hide placeholder, show avatar
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            avatarDisplay.style.display = 'block';

            // Start idle animation
            avatar.startIdleAnimation();

            console.log('Avatar ready:', vrm.meta?.name || 'VRM Avatar');
            // Dispatch event for main page
            window.dispatchEvent(new CustomEvent('avatarLoaded', { detail: { name: vrm.meta?.name || 'VRM Avatar' } }));
        },
        onError: (error) => {
            console.error('Avatar failed to load:', error);
            // Dispatch error event for main page
            window.dispatchEvent(new CustomEvent('avatarError', { detail: { error: error.message || error } }));
            if (placeholder) {
                placeholder.querySelector('.avatar-hint').innerHTML =
                    'Avatar failed to load<br/><small>Check console for details</small>';
            }
        },
        onProgress: (percent) => {
            if (placeholder) {
                placeholder.querySelector('.avatar-hint').innerHTML =
                    `Loading avatar...<br/><small>${percent}%</small>`;
            }
        }
    });

    // Initialize renderer
    if (!avatar.init()) {
        console.error('Failed to initialize avatar renderer');
        return null;
    }

    // Start render loop
    avatar.startRenderLoop();

    // Load VRM
    try {
        await avatar.loadVRM();
    } catch (error) {
        console.error('Failed to load VRM:', error);
    }

    // Expose to window for debugging and external control
    window.emiliaAvatar = avatar;

    return avatar;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAvatar);
} else {
    initAvatar();
}

// Export for module usage
export { AvatarRenderer, initAvatar, DEFAULT_VRM_URL };
