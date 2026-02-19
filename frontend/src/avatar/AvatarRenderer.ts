/**
 * Emilia Avatar Renderer
 * Main Three.js + VRM setup class with quality settings support
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { AnimationController } from './AnimationController';
import { animationLibrary } from './AnimationLibrary';
import { animationStateMachine } from './AnimationStateMachine';
import { PostProcessingPipeline } from './PostProcessingPipeline';
import type { LipSyncEngine } from './LipSyncEngine';
import type { AnimationPlayer } from './AnimationPlayer';
import type { LookAtSystem, LookAtConfig } from './layers/LookAtSystem';
import { getDefaultQuality, type QualitySettings } from './QualityPresets';
import type { AvatarRendererOptions } from './types';
import { useRenderStore } from '../store/renderStore';

const DEFAULT_VRM_URL = '/vrm/emilia.vrm';

interface ResolvedOptions {
  vrmUrl: string;
  backgroundColor: number;
  cameraDistance: number;
  cameraHeight: number;
  enableShadows: boolean;
  enableOrbitControls: boolean;
  agentId: string | null;
  onLoad: ((vrm: VRM) => void) | null;
  onError: ((error: Error) => void) | null;
  onProgress: ((percent: number) => void) | null;
}

export class AvatarRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private vrm: VRM | null = null;
  private clock: THREE.Clock;
  private isInitialized: boolean = false;
  private animationFrameId: number | null = null;
  private controls: OrbitControls | null = null;

  // Animation systems
  private animationController: AnimationController | null = null;

  // Post-processing
  private postProcessing: PostProcessingPipeline | null = null;
  private _currentQuality: QualitySettings;

  // Lights (stored for quality updates)
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;

  // Options
  private options: ResolvedOptions;

  // Resize handling
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRAF: number | null = null;

  constructor(container: HTMLElement, options: AvatarRendererOptions = {}) {
    this.container = container;
    this.clock = new THREE.Clock();
    this._currentQuality = getDefaultQuality();

    this.options = {
      vrmUrl: options.vrmUrl || DEFAULT_VRM_URL,
      backgroundColor: options.backgroundColor ?? 0x1e293b,
      cameraDistance: options.cameraDistance ?? 1.1,
      cameraHeight: options.cameraHeight ?? 1.3,
      enableShadows: options.enableShadows !== false,
      enableOrbitControls: options.enableOrbitControls ?? false,
      agentId: options.agentId ?? null,
      onLoad: options.onLoad ?? null,
      onError: options.onError ?? null,
      onProgress: options.onProgress ?? null
    };
  }

  /**
   * Get the loaded VRM model
   */
  getVRM(): VRM | null {
    return this.vrm;
  }

  /**
   * Get the Three.js renderer
   */
  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  /**
   * Get current quality settings
   */
  get currentQuality(): QualitySettings {
    return { ...this._currentQuality };
  }

  /**
   * Backward-compatible accessors for animation systems
   */
  get lipSyncEngine(): LipSyncEngine | null {
    return this.animationController?.lipSync ?? null;
  }

  get animationPlayer(): AnimationPlayer | null {
    return this.animationController?.animations ?? null;
  }

  get expressionController(): AnimationController | null {
    return this.animationController;
  }

  get lookAtSystem(): LookAtSystem | null {
    return this.animationController?.lookAt ?? null;
  }

  /**
   * Reset animation system to bind pose
   * Stops all animations and resets skeleton
   */
  resetAnimations(): void {
    this.animationController?.graph?.resetToBindPose();
    animationLibrary.clear();
    console.log('[AvatarRenderer] Reset animations and cleared cache');
  }

  /**
   * Initialize renderer and scene
   */
  init(): boolean {
    if (!this.container) {
      console.error('Avatar container not found');
      return false;
    }

    const width = this.container.clientWidth || 350;
    const height = this.container.clientHeight || 500;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);

    // Camera
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.camera.position.set(0, this.options.cameraHeight, this.options.cameraDistance);
    this.camera.lookAt(0, this.options.cameraHeight - 0.1, 0);

    // Renderer with quality settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: this._currentQuality.antialias,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this._currentQuality.pixelRatio);

    // Color management for proper VRM/MToon rendering
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // Preserve toon colors

    if (this.options.enableShadows && this._currentQuality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.setupResizeHandler();

    // Initialize post-processing pipeline
    if (this.scene && this.camera) {
      this.postProcessing = new PostProcessingPipeline(
        this.renderer,
        this.scene,
        this.camera,
        width,
        height
      );
      this.postProcessing.setEnabled(this._currentQuality.postProcessing);
      this.postProcessing.setBloomEnabled(this._currentQuality.bloom);
      this.postProcessing.setBloomStrength(this._currentQuality.bloomStrength);
      this.postProcessing.setBloomThreshold(this._currentQuality.bloomThreshold);
      this.postProcessing.setBloomRadius(this._currentQuality.bloomRadius);
      this.postProcessing.setSMAAEnabled(this._currentQuality.smaa);
    }

    // Setup orbit controls if enabled
    if (this.options.enableOrbitControls && this.camera && this.renderer) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0, this.options.cameraHeight - 0.1, 0);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 5;
      this.controls.maxPolarAngle = Math.PI * 0.9;
      this.controls.update();
    }

    this.isInitialized = true;
    console.log('Avatar renderer initialized');
    return true;
  }

  /**
   * Setup scene lighting
   */
  private setupLighting(): void {
    if (!this.scene) return;

    // Ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Key light
    this.keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.keyLight.position.set(1, 2, 2);
    if (this.options.enableShadows && this._currentQuality.shadows) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.width = this._currentQuality.shadowMapSize;
      this.keyLight.shadow.mapSize.height = this._currentQuality.shadowMapSize;
      this.keyLight.shadow.camera.near = 0.1;
      this.keyLight.shadow.camera.far = 10;
      this.keyLight.shadow.bias = this._currentQuality.shadowBias;
      this.keyLight.shadow.normalBias = this._currentQuality.shadowNormalBias;
    }
    this.scene.add(this.keyLight);

    // Fill light
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.fillLight.position.set(-1, 1, 1);
    this.scene.add(this.fillLight);

    // Rim light (accent color)
    this.rimLight = new THREE.DirectionalLight(0x6366f1, 0.4);
    this.rimLight.position.set(0, 1, -2);
    this.scene.add(this.rimLight);
  }

  /**
   * Setup resize handler
   */
  private setupResizeHandler(): void {
    const doResize = (): void => {
      if (!this.container || !this.camera || !this.renderer) return;

      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      if (width === 0 || height === 0) return;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);

      // Update post-processing size
      if (this.postProcessing) {
        this.postProcessing.setSize(width, height);
      }
    };

    // Debounce resize via requestAnimationFrame to avoid redundant layout/GL work
    this.resizeHandler = (): void => {
      if (this.resizeRAF !== null) return;
      this.resizeRAF = requestAnimationFrame(() => {
        this.resizeRAF = null;
        doResize();
      });
    };

    window.addEventListener('resize', this.resizeHandler);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * Apply quality settings
   * Note: Some settings (antialias) require renderer recreation
   */
  applyQualitySettings(settings: QualitySettings): void {
    this._currentQuality = { ...settings };

    if (!this.renderer) return;

    // Update pixel ratio
    this.renderer.setPixelRatio(settings.pixelRatio);

    // Update shadows
    this.renderer.shadowMap.enabled = settings.shadows;
    if (this.keyLight) {
      this.keyLight.castShadow = settings.shadows;
      if (settings.shadows) {
        this.keyLight.shadow.mapSize.width = settings.shadowMapSize;
        this.keyLight.shadow.mapSize.height = settings.shadowMapSize;
        this.keyLight.shadow.bias = settings.shadowBias;
        this.keyLight.shadow.normalBias = settings.shadowNormalBias;
        this.keyLight.shadow.map?.dispose();
        this.keyLight.shadow.map = null;
      }
    }

    // Update post-processing
    if (this.postProcessing) {
      this.postProcessing.setEnabled(settings.postProcessing);
      this.postProcessing.setBloomEnabled(settings.bloom);
      this.postProcessing.setBloomStrength(settings.bloomStrength);
      this.postProcessing.setBloomThreshold(settings.bloomThreshold);
      this.postProcessing.setBloomRadius(settings.bloomRadius);
      this.postProcessing.setSMAAEnabled(settings.smaa);
    }

    // Update alphaToCoverage on VRM materials
    if (this.vrm) {
      this.applyAlphaToCoverage(this.vrm, settings.alphaToCoverage);
    }

    console.log('[AvatarRenderer] Applied quality settings:', settings);
  }

  /**
   * Configure look-at system settings
   */
  setLookAtConfig(config: Partial<LookAtConfig>): void {
    if (this.lookAtSystem) {
      this.lookAtSystem.setConfig(config);
      console.log('[AvatarRenderer] Updated look-at config:', config);
    }
  }

  /**
   * Enable/disable look-at tracking
   */
  setLookAtEnabled(enabled: boolean): void {
    if (this.lookAtSystem) {
      this.lookAtSystem.setEnabled(enabled);
    }
  }

  // Home camera position (set after VRM loads)
  private homePosition: THREE.Vector3 = new THREE.Vector3();
  private homeTarget: THREE.Vector3 = new THREE.Vector3();
  private lastInteractionTime: number = 0;
  private isDriftingHome: boolean = false;
  private readonly DRIFT_DELAY_MS = 10000; // 10 seconds
  private readonly DRIFT_SPEED = 0.02; // Lerp factor per frame

  /**
   * Auto-frame camera based on VRM head bone position
   * Called once after VRM loads to handle different model heights
   */
  private frameCameraToHead(vrm: VRM): void {
    if (!this.camera || !vrm.humanoid) return;

    const headBone = vrm.humanoid.getNormalizedBoneNode('head');
    if (!headBone) {
      console.warn('[AvatarRenderer] No head bone found, using default camera position');
      return;
    }

    // Get head world position
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);

    // Calculate default home position - face centered with slight upward bias
    const faceY = headPos.y - 0.05; // Face level
    const cameraDistance = this.options.cameraDistance * 1.15; // Zoom out 15%
    
    // Set home position (used for drift-back)
    // Camera higher, looking slightly down at face
    this.homePosition.set(0, faceY + 0.12, cameraDistance);
    this.homeTarget.set(0, faceY, 0);

    // Set up orbit controls listeners first
    if (this.controls) {
      this.controls.addEventListener('start', this.onCameraInteractionStart);
      this.controls.addEventListener('end', this.onCameraInteractionEnd);
    }

    // Try to load saved camera position first
    if (this.loadCameraPosition()) {
      // Saved position loaded, update home target for drift-back
      // but keep camera at user's saved position
      console.log(`[AvatarRenderer] Using saved camera position, home Y=${faceY.toFixed(2)}`);
      return;
    }

    // No saved position, use calculated home position
    this.camera.position.copy(this.homePosition);
    this.camera.lookAt(this.homeTarget.x, this.homeTarget.y, this.homeTarget.z);

    // Update orbit controls target if enabled
    if (this.controls) {
      this.controls.target.copy(this.homeTarget);
      this.controls.update();
    }

    console.log(`[AvatarRenderer] Camera framed to head at Y=${headPos.y.toFixed(2)}, distance=${cameraDistance.toFixed(2)}`);
  }

  /**
   * Called when user starts interacting with camera
   */
  private onCameraInteractionStart = (): void => {
    this.isDriftingHome = false;
  };

  /**
   * Called when user stops interacting with camera
   */
  private onCameraInteractionEnd = (): void => {
    this.lastInteractionTime = performance.now();
    // Save camera position when user finishes adjusting
    this.saveCameraPosition();
  };

  /**
   * Save current camera position to localStorage via store
   */
  private saveCameraPosition(): void {
    if (!this.camera || !this.controls) return;

    try {
      const pos = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
        targetX: this.controls.target.x,
        targetY: this.controls.target.y,
        targetZ: this.controls.target.z,
      };

      if (this.options.agentId) {
        useRenderStore.getState().setCameraPositionForAgent(this.options.agentId, pos);
      } else {
        useRenderStore.getState().setCameraPosition(pos);
      }
    } catch (e) {
      console.warn('[AvatarRenderer] Could not save camera position:', e);
    }
  }

  /**
   * Load camera position from localStorage via store
   * Returns true if position was loaded
   */
  private loadCameraPosition(): boolean {
    if (!this.camera || !this.controls) return false;

    try {
      const store = useRenderStore.getState();
      const saved = this.options.agentId
        ? store.getCameraPositionForAgent(this.options.agentId)
        : store.cameraPosition;

      if (saved) {
        this.camera.position.set(saved.x, saved.y, saved.z);
        this.controls.target.set(saved.targetX, saved.targetY, saved.targetZ);
        this.controls.update();
        console.log('[AvatarRenderer] Restored saved camera position' +
          (this.options.agentId ? ` for agent ${this.options.agentId}` : ''));
        return true;
      }
    } catch (e) {
      console.warn('[AvatarRenderer] Could not load camera position:', e);
    }

    return false;
  }

  /**
   * Check if camera should drift back to home and apply drift
   */
  private updateCameraDrift(): void {
    if (!this.controls || !this.camera) return;
    
    // Check if drift is enabled in settings
    const { cameraDriftEnabled } = useRenderStore.getState();
    if (!cameraDriftEnabled) {
      this.isDriftingHome = false;
      return;
    }
    
    const timeSinceInteraction = performance.now() - this.lastInteractionTime;
    
    // Start drifting after delay
    if (timeSinceInteraction > this.DRIFT_DELAY_MS && this.lastInteractionTime > 0) {
      this.isDriftingHome = true;
    }
    
    if (this.isDriftingHome) {
      // Lerp camera position toward home
      this.camera.position.lerp(this.homePosition, this.DRIFT_SPEED);
      this.controls.target.lerp(this.homeTarget, this.DRIFT_SPEED);
      
      // Stop drifting when close enough
      if (this.camera.position.distanceTo(this.homePosition) < 0.01) {
        this.isDriftingHome = false;
        this.camera.position.copy(this.homePosition);
        this.controls.target.copy(this.homeTarget);
      }
      
      this.controls.update();
    }
  }

  /**
   * Apply alphaToCoverage to MToon materials
   */
  private applyAlphaToCoverage(vrm: VRM, enabled: boolean): void {
    vrm.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const material = mat as any;
          if (material.isMToonMaterial) {
            material.alphaToCoverage = enabled;
          }
        }
      }
    });
  }

  /**
   * Load VRM model
   */
  async loadVRM(url: string | null = null): Promise<VRM> {
    const vrmUrl = url || this.options.vrmUrl;
    console.log(`Loading VRM from: ${vrmUrl}`);

    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        vrmUrl,
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM | undefined;

          if (!vrm) {
            const error = new Error('No VRM data found');
            if (this.options.onError) this.options.onError(error);
            reject(error);
            return;
          }

          // Remove previous VRM
          if (this.animationController) {
            this.animationController.dispose();
            this.animationController = null;
          }
          if (this.vrm && this.scene) {
            VRMUtils.deepDispose(this.vrm.scene);
            this.scene.remove(this.vrm.scene);
          }

          this.vrm = vrm;

          // Hide VRM IMMEDIATELY to avoid T-pose flash
          // Must be set before any VRM utilities or scene.add()
          vrm.scene.visible = false;

          VRMUtils.rotateVRM0(vrm);
          VRMUtils.combineSkeletons(vrm.scene);

          this.scene?.add(vrm.scene);

          // Apply alphaToCoverage to MToon materials
          this.applyAlphaToCoverage(vrm, this._currentQuality.alphaToCoverage);

          // Auto-frame camera based on head bone position
          this.frameCameraToHead(vrm);

          // Shadows
          if (this.options.enableShadows && this._currentQuality.shadows) {
            vrm.scene.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });
          }

          // Clear all animation caches and set VRM for animation library
          animationLibrary.clear();
          animationLibrary.setVRM(vrm);
          
          // Load animation state machine and manifest (don't await - can load in parallel)
          animationStateMachine.load().catch(err => {
            console.warn('[AvatarRenderer] Failed to load animation state machine:', err);
          });
          
          animationLibrary.fetchManifest().catch(err => {
            console.warn('[AvatarRenderer] Failed to fetch animation manifest:', err);
          });

          // Initialize animation systems via controller (after animationLibrary is ready)
          this.animationController = new AnimationController();
          this.animationController.init(vrm, this.camera ?? undefined);
          this.animationController.lookAt?.setConfig({
            headTrackingEnabled: true,
            maxYaw: 30,
            maxPitchUp: 25,
            maxPitchDown: 15,
            headWeight: 0.4,
            smoothSpeed: 6,
          });

          // Show VRM once idle animation is ready (avoids T-pose flash)
          this.animationController.onIdleReady(() => {
            if (vrm.scene) {
              vrm.scene.visible = true;
              console.log('[AvatarRenderer] VRM visible after idle animation loaded');
            }
          });

          // Debug: Log available humanoid bones
          this.logAvailableBones(vrm);

          const metaName = (vrm.meta as { name?: string })?.name;
          console.log('VRM loaded:', metaName || 'Unknown');

          if (this.options.onLoad) this.options.onLoad(vrm);
          resolve(vrm);
        },
        (progress) => {
          const percent = progress.total > 0
            ? Math.round((progress.loaded / progress.total) * 100)
            : 0;
          if (this.options.onProgress) this.options.onProgress(percent);
        },
        (error) => {
          console.error('VRM load failed:', error);
          const err = error instanceof Error ? error : new Error(String(error));
          if (this.options.onError) this.options.onError(err);
          reject(err);
        }
      );
    });
  }

  /**
   * Debug: Log available humanoid bones
   */
  private logAvailableBones(vrm: VRM): void {
    if (!vrm.humanoid) {
      console.warn('[AvatarRenderer] No humanoid data in VRM');
      return;
    }

    const boneNames = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot'
    ] as const;

    const available: string[] = [];
    const missing: string[] = [];

    for (const name of boneNames) {
      const normalized = vrm.humanoid.getNormalizedBoneNode(name);
      const raw = vrm.humanoid.getRawBoneNode(name);
      if (normalized || raw) {
        available.push(`${name}(${normalized ? 'N' : ''}${raw ? 'R' : ''})`);
      } else {
        missing.push(name);
      }
    }

    console.log('[AvatarRenderer] Available bones:', available.join(', '));
    if (missing.length > 0) {
      console.warn('[AvatarRenderer] Missing bones:', missing.join(', '));
    }
  }

  /**
   * Start render loop
   */
  startRenderLoop(): void {
    if (!this.isInitialized) return;

    const animate = (): void => {
      this.animationFrameId = requestAnimationFrame(animate);

      const deltaTime = this.clock.getDelta();

      // Update systems
      if (this.animationController) this.animationController.update(deltaTime);

      // Clamp deltaTime for VRM update (spring bone stability after tab switches/GC pauses)
      if (this.vrm) this.vrm.update(Math.min(deltaTime, 1 / 30));
      if (this.controls) this.controls.update();
      
      // Camera drift back to home
      this.updateCameraDrift();

      // Render (use post-processing if enabled)
      if (this.postProcessing && this._currentQuality.postProcessing) {
        this.postProcessing.render();
      } else if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
    console.log('Render loop started');
  }

  /**
   * Stop render loop
   */
  stopRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stopRenderLoop();

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.resizeRAF !== null) {
      cancelAnimationFrame(this.resizeRAF);
      this.resizeRAF = null;
    }

    if (this.controls) {
      this.controls.removeEventListener('start', this.onCameraInteractionStart);
      this.controls.removeEventListener('end', this.onCameraInteractionEnd);
      this.controls.dispose();
    }

    if (this.postProcessing) {
      this.postProcessing.dispose();
    }

    if (this.animationController) {
      this.animationController.dispose();
      this.animationController = null;
    }

    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
    }

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

export default AvatarRenderer;
