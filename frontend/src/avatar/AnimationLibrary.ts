/**
 * Animation Library
 * Loads and caches GLB animation files for VRM avatar
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface AnimationClipData {
  name: string;
  clip: THREE.AnimationClip;
  duration: number;
}

export class AnimationLibrary {
  private loader: GLTFLoader;
  private cache: Map<string, AnimationClipData> = new Map();
  private loadingPromises: Map<string, Promise<AnimationClipData | null>> = new Map();
  
  // Animation manifest - maps animation names to file paths
  private manifest: Record<string, string> = {
    // These will be populated as we add animation files
    // 'wave': '/animations/wave.glb',
    // 'nod': '/animations/nod.glb',
    // 'thinking': '/animations/thinking.glb',
    // 'idle': '/animations/idle.glb',
  };

  constructor() {
    this.loader = new GLTFLoader();
  }

  /**
   * Register an animation file
   */
  register(name: string, path: string): void {
    this.manifest[name] = path;
  }

  /**
   * Get list of available animations
   */
  getAvailableAnimations(): string[] {
    return Object.keys(this.manifest);
  }

  /**
   * Load an animation by name
   */
  async load(name: string): Promise<AnimationClipData | null> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // Check if already loading
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name)!;
    }

    // Get path from manifest
    const path = this.manifest[name];
    if (!path) {
      console.warn(`[AnimationLibrary] Animation '${name}' not found in manifest`);
      return null;
    }

    // Start loading
    const loadPromise = this.loadFromFile(name, path);
    this.loadingPromises.set(name, loadPromise);

    const result = await loadPromise;
    this.loadingPromises.delete(name);

    return result;
  }

  /**
   * Load animation from GLB file
   */
  private async loadFromFile(name: string, path: string): Promise<AnimationClipData | null> {
    return new Promise((resolve) => {
      this.loader.load(
        path,
        (gltf) => {
          if (gltf.animations.length === 0) {
            console.warn(`[AnimationLibrary] No animations found in '${path}'`);
            resolve(null);
            return;
          }

          // Use first animation in the file
          const clip = gltf.animations[0];
          clip.name = name; // Rename to our standard name

          const data: AnimationClipData = {
            name,
            clip,
            duration: clip.duration
          };

          this.cache.set(name, data);
          console.log(`[AnimationLibrary] Loaded '${name}' (${clip.duration.toFixed(2)}s)`);
          resolve(data);
        },
        undefined,
        (error) => {
          console.error(`[AnimationLibrary] Failed to load '${path}':`, error);
          resolve(null);
        }
      );
    });
  }

  /**
   * Preload multiple animations
   */
  async preload(names: string[]): Promise<void> {
    await Promise.all(names.map(name => this.load(name)));
  }

  /**
   * Preload all registered animations
   */
  async preloadAll(): Promise<void> {
    await this.preload(Object.keys(this.manifest));
  }

  /**
   * Get cached clip (returns null if not loaded)
   */
  getClip(name: string): THREE.AnimationClip | null {
    return this.cache.get(name)?.clip || null;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const animationLibrary = new AnimationLibrary();

export default AnimationLibrary;
