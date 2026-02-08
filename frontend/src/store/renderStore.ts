/**
 * Render Quality Store
 * Persists graphics settings and camera position to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getPreset, type QualityPreset, type QualitySettings } from '../avatar/QualityPresets';

const STORAGE_KEY = 'emilia-render-settings';

interface CameraPosition {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

interface RenderStore {
  preset: QualityPreset;
  settings: QualitySettings;
  cameraPosition: CameraPosition | null;
  cameraDriftEnabled: boolean;
  lookAtEnabled: boolean;
  setPreset: (preset: QualityPreset) => void;
  setSettings: (settings: QualitySettings) => void;
  setCameraPosition: (position: CameraPosition | null) => void;
  setCameraDriftEnabled: (enabled: boolean) => void;
  setLookAtEnabled: (enabled: boolean) => void;
}

export const useRenderStore = create<RenderStore>()(
  persist(
    (set) => ({
      preset: 'medium',
      settings: getPreset('medium'),
      cameraPosition: null,
      cameraDriftEnabled: true,
      lookAtEnabled: true,
      
      setPreset: (preset) => set({
        preset,
        settings: getPreset(preset),
      }),
      
      setSettings: (settings) => set({
        preset: 'custom',
        settings,
      }),
      
      setCameraPosition: (cameraPosition) => set({ cameraPosition }),
      setCameraDriftEnabled: (cameraDriftEnabled) => set({ cameraDriftEnabled }),
      setLookAtEnabled: (lookAtEnabled) => set({ lookAtEnabled }),
    }),
    {
      name: STORAGE_KEY,
      // Persist preset, camera position, drift setting, and lookAt setting
      partialize: (state) => ({ 
        preset: state.preset,
        cameraPosition: state.cameraPosition,
        cameraDriftEnabled: state.cameraDriftEnabled,
        lookAtEnabled: state.lookAtEnabled,
      }),
      onRehydrate: () => {
        // After loading preset from storage, recalculate settings
        return (rehydratedState) => {
          if (rehydratedState?.preset && rehydratedState.preset !== 'custom') {
            rehydratedState.settings = getPreset(rehydratedState.preset);
          }
        };
      },
    }
  )
);

// Friendly names for UI
export const QUALITY_LABELS: Record<QualityPreset, { name: string; description: string }> = {
  low: {
    name: 'Battery Saver',
    description: 'Best for older devices or saving battery',
  },
  medium: {
    name: 'Balanced',
    description: 'Good quality with smooth performance',
  },
  high: {
    name: 'Beautiful',
    description: 'Best visuals with bloom & effects',
  },
};
