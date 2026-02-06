/**
 * Animation Library
 * Loads and caches GLB and VRMA animation files for VRM avatar
 * Supports auto-discovery via /animations/animation-manifest.json
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';

export interface AnimationClipData {
  name: string;
  clip: THREE.AnimationClip;
  duration: number;
  type: 'glb' | 'vrma';
}

export interface ManifestEntry {
  id: string;
  name: string;
  type: 'glb' | 'vrma';
}

export class AnimationLibrary {
  private glbLoader: GLTFLoader;
  private vrmaLoader: GLTFLoader;
  private cache: Map<string, AnimationClipData> = new Map();
  private vrmaCache: Map<string, VRMAnimation> = new Map(); // Raw VRMA for re-binding to different VRMs
  private loadingPromises: Map<string, Promise<AnimationClipData | null>> = new Map();
  private manifest: ManifestEntry[] = [];
  private manifestLoaded: boolean = false;
  private currentVRM: VRM | null = null;

  constructor() {
    this.glbLoader = new GLTFLoader();
    this.vrmaLoader = new GLTFLoader();
    this.vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  }

  /**
   * Set the current VRM model (needed for VRMA clip creation)
   */
  setVRM(vrm: VRM): void {
    // If VRM changed, clear VRMA clip cache (need to rebind)
    if (this.currentVRM !== vrm) {
      for (const [name, data] of this.cache.entries()) {
        if (data.type === 'vrma') {
          this.cache.delete(name);
        }
      }
    }
    this.currentVRM = vrm;
  }

  /**
   * Fetch the animation manifest from server
   */
  async fetchManifest(): Promise<ManifestEntry[]> {
    if (this.manifestLoaded) {
      return this.manifest;
    }

    try {
      const response = await fetch('/animations/animation-manifest.json');
      if (!response.ok) {
        console.warn('[AnimationLibrary] Could not fetch manifest');
        return [];
      }
      this.manifest = await response.json();
      this.manifestLoaded = true;
      console.log(`[AnimationLibrary] Loaded manifest: ${this.manifest.length} animations`);
      return this.manifest;
    } catch (err) {
      console.warn('[AnimationLibrary] Error fetching manifest:', err);
      return [];
    }
  }

  /**
   * Get list of available animations (fetches manifest if needed)
   */
  async getAvailableAnimations(): Promise<ManifestEntry[]> {
    if (!this.manifestLoaded) {
      await this.fetchManifest();
    }
    return this.manifest;
  }

  /**
   * Get animations by type
   */
  async getAnimationsByType(type: 'glb' | 'vrma'): Promise<ManifestEntry[]> {
    const all = await this.getAvailableAnimations();
    return all.filter(a => a.type === type);
  }

  /**
   * Load an animation by ID (filename)
   */
  async load(id: string): Promise<AnimationClipData | null> {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    // Check if already loading
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!;
    }

    // Find in manifest
    await this.fetchManifest();
    const entry = this.manifest.find(e => e.id === id);
    if (!entry) {
      console.warn(`[AnimationLibrary] Animation '${id}' not found in manifest`);
      return null;
    }

    // Start loading based on type
    const loadPromise = entry.type === 'vrma' 
      ? this.loadVRMA(entry)
      : this.loadGLB(entry);
    
    this.loadingPromises.set(id, loadPromise);
    const result = await loadPromise;
    this.loadingPromises.delete(id);

    return result;
  }

  /**
   * Load GLB animation file
   */
  private async loadGLB(entry: ManifestEntry): Promise<AnimationClipData | null> {
    const path = `/animations/${entry.id}`;
    
    return new Promise((resolve) => {
      this.glbLoader.load(
        path,
        (gltf) => {
          if (gltf.animations.length === 0) {
            console.warn(`[AnimationLibrary] No animations in '${path}'`);
            resolve(null);
            return;
          }

          const clip = gltf.animations[0];
          clip.name = entry.id;

          const data: AnimationClipData = {
            name: entry.name,
            clip,
            duration: clip.duration,
            type: 'glb'
          };

          this.cache.set(entry.id, data);
          console.log(`[AnimationLibrary] Loaded GLB '${entry.name}' (${clip.duration.toFixed(2)}s)`);
          resolve(data);
        },
        undefined,
        () => {
          console.warn(`[AnimationLibrary] Failed to load '${path}'`);
          resolve(null);
        }
      );
    });
  }

  /**
   * Load VRMA animation file
   */
  private async loadVRMA(entry: ManifestEntry): Promise<AnimationClipData | null> {
    if (!this.currentVRM) {
      console.warn('[AnimationLibrary] No VRM set for VRMA loading');
      return null;
    }

    const path = `/animations/${entry.id}`;

    // Check if we have cached VRMAnimation
    let vrmAnimation = this.vrmaCache.get(entry.id);

    if (!vrmAnimation) {
      // Load the VRMA file
      try {
        vrmAnimation = await new Promise<VRMAnimation | null>((resolve) => {
          this.vrmaLoader.load(
            path,
            (gltf) => {
              const vrmAnimations: VRMAnimation[] = gltf.userData.vrmAnimations;
              if (!vrmAnimations || vrmAnimations.length === 0) {
                console.warn(`[AnimationLibrary] No VRM animations in '${path}'`);
                resolve(null);
                return;
              }
              resolve(vrmAnimations[0]);
            },
            undefined,
            () => {
              console.warn(`[AnimationLibrary] Failed to load '${path}'`);
              resolve(null);
            }
          );
        });

        if (!vrmAnimation) return null;
        this.vrmaCache.set(entry.id, vrmAnimation);
      } catch (err) {
        console.warn(`[AnimationLibrary] Error loading VRMA '${path}':`, err);
        return null;
      }
    }

    // Create clip bound to current VRM
    const clip = createVRMAnimationClip(vrmAnimation, this.currentVRM);
    clip.name = entry.id;

    const data: AnimationClipData = {
      name: entry.name,
      clip,
      duration: clip.duration,
      type: 'vrma'
    };

    this.cache.set(entry.id, data);
    console.log(`[AnimationLibrary] Loaded VRMA '${entry.name}' (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);
    return data;
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.cache.clear();
    this.vrmaCache.clear();
  }

  /**
   * Force refresh manifest from server
   */
  async refreshManifest(): Promise<ManifestEntry[]> {
    this.manifestLoaded = false;
    return this.fetchManifest();
  }
}

// Singleton instance
export const animationLibrary = new AnimationLibrary();

export default AnimationLibrary;
