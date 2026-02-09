/**
 * VRM Preloader
 * Preloads VRM models into Three.js cache for instant loading
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { Cache } from 'three';

// Enable Three.js caching
Cache.enabled = true;

const preloadPromises = new Map<string, Promise<void>>();

/**
 * Preload a VRM model into Three.js cache
 * Subsequent loads of the same URL will be instant
 */
export async function preloadVRM(url: string): Promise<void> {
  // Return existing preload promise if already in progress
  if (preloadPromises.has(url)) {
    return preloadPromises.get(url)!;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    console.log(`[Preload] Starting VRM preload: ${url}`);

    loader.load(
      url,
      () => {
        console.log(`[Preload] VRM preloaded successfully: ${url}`);
        resolve();
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[Preload] Progress: ${percent.toFixed(0)}%`);
        }
      },
      (error) => {
        console.error(`[Preload] Failed to preload VRM: ${url}`, error);
        reject(error);
      }
    );
  });

  preloadPromises.set(url, promise);

  try {
    await promise;
  } finally {
    // Keep the promise in the map for deduplication, but allow cleanup
    setTimeout(() => preloadPromises.delete(url), 60000); // Clean up after 1 minute
  }
}

/**
 * Check if a VRM is already cached
 */
export function isVRMCached(url: string): boolean {
  return Cache.get(url) !== undefined;
}

/**
 * Clear VRM from cache
 */
export function clearVRMCache(url?: string): void {
  if (url) {
    Cache.remove(url);
    preloadPromises.delete(url);
  } else {
    Cache.clear();
    preloadPromises.clear();
  }
}
