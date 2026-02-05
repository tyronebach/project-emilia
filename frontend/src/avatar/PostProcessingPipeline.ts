/**
 * Post-Processing Pipeline for VRM Avatar Rendering
 * Wraps Three.js EffectComposer with bloom and SMAA passes
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostProcessingPipeline {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private smaaPass: SMAAPass;
  private outputPass: OutputPass;
  
  private _enabled: boolean = false;
  private _bloomEnabled: boolean = true;
  private _smaaEnabled: boolean = true;
  
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Create composer
    this.composer = new EffectComposer(renderer);

    // Base render pass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Bloom pass - glow effect for bright areas
    const resolution = new THREE.Vector2(width, height);
    this.bloomPass = new UnrealBloomPass(
      resolution,
      0.8,   // strength (higher = more visible)
      0.5,   // radius
      0.3    // threshold (lower = more pixels bloom)
    );
    this.bloomPass.enabled = this._bloomEnabled;
    this.composer.addPass(this.bloomPass);

    // SMAA pass - high quality AA
    this.smaaPass = new SMAAPass(width, height);
    this.smaaPass.enabled = this._smaaEnabled;
    this.composer.addPass(this.smaaPass);

    // Output pass - ensures correct color space output
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /**
   * Get whether post-processing is enabled
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable/disable the entire post-processing pipeline
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Enable/disable bloom effect
   */
  setBloomEnabled(enabled: boolean): void {
    this._bloomEnabled = enabled;
    this.bloomPass.enabled = enabled;
  }

  /**
   * Get bloom enabled state
   */
  get bloomEnabled(): boolean {
    return this._bloomEnabled;
  }

  /**
   * Set bloom strength (0-1 typical range)
   */
  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }

  /**
   * Get current bloom strength
   */
  get bloomStrength(): number {
    return this.bloomPass.strength;
  }

  /**
   * Set bloom radius
   */
  setBloomRadius(radius: number): void {
    this.bloomPass.radius = radius;
  }

  /**
   * Set bloom threshold
   */
  setBloomThreshold(threshold: number): void {
    this.bloomPass.threshold = threshold;
  }

  /**
   * Enable/disable SMAA anti-aliasing
   */
  setSMAAEnabled(enabled: boolean): void {
    this._smaaEnabled = enabled;
    this.smaaPass.enabled = enabled;
  }

  /**
   * Get SMAA enabled state
   */
  get smaaEnabled(): boolean {
    return this._smaaEnabled;
  }

  /**
   * Render the scene through post-processing
   */
  render(): void {
    if (this._enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Update render size
   */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
  }

  /**
   * Update camera reference (for when camera changes)
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.renderPass.camera = camera;
  }

  /**
   * Update scene reference (for when scene changes)
   */
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.renderPass.scene = scene;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.composer.dispose();
  }
}
