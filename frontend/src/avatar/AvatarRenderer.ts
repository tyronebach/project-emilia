/**
 * Emilia Avatar Renderer
 * Main Three.js + VRM setup class (ported from vanilla)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { LipSyncEngine } from './LipSyncEngine';
import { ExpressionController } from './ExpressionController';
import { IdleAnimations } from './IdleAnimations';
import { AnimationTrigger } from './AnimationTrigger';
import type { AvatarRendererOptions } from './types';

const DEFAULT_VRM_URL = '/emilia.vrm';

interface ResolvedOptions {
  vrmUrl: string;
  backgroundColor: number;
  cameraDistance: number;
  cameraHeight: number;
  enableShadows: boolean;
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
  
  // Animation systems
  public lipSyncEngine: LipSyncEngine | null = null;
  private idleAnimations: IdleAnimations | null = null;
  public animationTrigger: AnimationTrigger | null = null;
  public expressionController: ExpressionController | null = null;
  
  // Options
  private options: ResolvedOptions;
  
  // Resize handling
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  
  constructor(container: HTMLElement, options: AvatarRendererOptions = {}) {
    this.container = container;
    this.clock = new THREE.Clock();
    
    this.options = {
      vrmUrl: options.vrmUrl || DEFAULT_VRM_URL,
      backgroundColor: options.backgroundColor ?? 0x1e293b,
      cameraDistance: options.cameraDistance ?? 0.6,
      cameraHeight: options.cameraHeight ?? 1.4,
      enableShadows: options.enableShadows !== false,
      onLoad: options.onLoad ?? null,
      onError: options.onError ?? null,
      onProgress: options.onProgress ?? null
    };
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
    
    // Renderer
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
    
    this.container.appendChild(this.renderer.domElement);
    
    this.setupLighting();
    this.setupResizeHandler();
    
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
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 2, 2);
    if (this.options.enableShadows) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
    }
    this.scene.add(keyLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-1, 1, 1);
    this.scene.add(fillLight);
    
    // Rim light (accent color)
    const rimLight = new THREE.DirectionalLight(0x6366f1, 0.4);
    rimLight.position.set(0, 1, -2);
    this.scene.add(rimLight);
  }
  
  /**
   * Setup resize handler
   */
  private setupResizeHandler(): void {
    this.resizeHandler = (): void => {
      if (!this.container || !this.camera || !this.renderer) return;
      
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      
      if (width === 0 || height === 0) return;
      
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', this.resizeHandler);
    
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.container);
    }
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
          if (this.vrm && this.scene) {
            VRMUtils.deepDispose(this.vrm.scene);
            this.scene.remove(this.vrm.scene);
          }
          
          this.vrm = vrm;
          VRMUtils.rotateVRM0(vrm);
          this.scene?.add(vrm.scene);
          
          // Shadows
          if (this.options.enableShadows) {
            vrm.scene.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });
          }
          
          // Initialize animation systems
          this.idleAnimations = new IdleAnimations(vrm);
          this.animationTrigger = new AnimationTrigger(vrm);
          this.expressionController = new ExpressionController(vrm);
          this.lipSyncEngine = new LipSyncEngine(vrm);
          
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
   * Start render loop
   */
  startRenderLoop(): void {
    if (!this.isInitialized) return;
    
    const animate = (): void => {
      this.animationFrameId = requestAnimationFrame(animate);
      
      const deltaTime = this.clock.getDelta();
      
      // Update systems
      if (this.idleAnimations) this.idleAnimations.update(deltaTime);
      if (this.animationTrigger) this.animationTrigger.update(deltaTime);
      if (this.lipSyncEngine) this.lipSyncEngine.update(deltaTime);
      if (this.vrm) this.vrm.update(deltaTime);
      
      // Render
      if (this.renderer && this.scene && this.camera) {
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
