/**
 * Render Quality Store
 * Persists graphics settings per-user to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getPreset, type QualityPreset, type QualitySettings } from '../avatar/QualityPresets';

const STORAGE_KEY = 'emilia-render-settings-v2';
const DEFAULT_USER = '_default';

interface CameraPosition {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

interface UserRenderSettings {
  preset: QualityPreset;
  cameraPosition: CameraPosition | null;
  cameraDriftEnabled: boolean;
  lookAtEnabled: boolean;
}

const DEFAULT_USER_SETTINGS: UserRenderSettings = {
  preset: 'medium',
  cameraPosition: null,
  cameraDriftEnabled: true,
  lookAtEnabled: true,
};

interface RenderStore {
  // Current active settings (derived from current user)
  preset: QualityPreset;
  settings: QualitySettings;
  cameraPosition: CameraPosition | null;
  cameraDriftEnabled: boolean;
  lookAtEnabled: boolean;
  
  // Per-user storage
  currentUserId: string;
  userSettings: Record<string, UserRenderSettings>;
  
  // Actions
  setCurrentUser: (userId: string | number | null) => void;
  setPreset: (preset: QualityPreset) => void;
  setSettings: (settings: QualitySettings) => void;
  setCameraPosition: (position: CameraPosition | null) => void;
  setCameraDriftEnabled: (enabled: boolean) => void;
  setLookAtEnabled: (enabled: boolean) => void;
}

function getUserKey(userId: string | number | null): string {
  return userId ? String(userId) : DEFAULT_USER;
}

export const useRenderStore = create<RenderStore>()(
  persist(
    (set, get) => ({
      // Default active settings
      preset: 'medium',
      settings: getPreset('medium'),
      cameraPosition: null,
      cameraDriftEnabled: true,
      lookAtEnabled: true,
      
      // Per-user storage
      currentUserId: DEFAULT_USER,
      userSettings: {},
      
      // Switch user and load their settings
      setCurrentUser: (userId) => {
        const key = getUserKey(userId);
        const { userSettings } = get();
        const settings = userSettings[key] || DEFAULT_USER_SETTINGS;
        
        set({
          currentUserId: key,
          preset: settings.preset,
          settings: getPreset(settings.preset),
          cameraPosition: settings.cameraPosition,
          cameraDriftEnabled: settings.cameraDriftEnabled,
          lookAtEnabled: settings.lookAtEnabled,
        });
      },
      
      setPreset: (preset) => {
        const { currentUserId, userSettings } = get();
        const current = userSettings[currentUserId] || DEFAULT_USER_SETTINGS;
        
        set({
          preset,
          settings: getPreset(preset),
          userSettings: {
            ...userSettings,
            [currentUserId]: { ...current, preset },
          },
        });
      },
      
      setSettings: (settings) => set({
        preset: 'custom' as QualityPreset,
        settings,
      }),
      
      setCameraPosition: (cameraPosition) => {
        const { currentUserId, userSettings } = get();
        const current = userSettings[currentUserId] || DEFAULT_USER_SETTINGS;
        
        set({
          cameraPosition,
          userSettings: {
            ...userSettings,
            [currentUserId]: { ...current, cameraPosition },
          },
        });
      },
      
      setCameraDriftEnabled: (cameraDriftEnabled) => {
        const { currentUserId, userSettings } = get();
        const current = userSettings[currentUserId] || DEFAULT_USER_SETTINGS;
        
        set({
          cameraDriftEnabled,
          userSettings: {
            ...userSettings,
            [currentUserId]: { ...current, cameraDriftEnabled },
          },
        });
      },
      
      setLookAtEnabled: (lookAtEnabled) => {
        const { currentUserId, userSettings } = get();
        const current = userSettings[currentUserId] || DEFAULT_USER_SETTINGS;
        
        set({
          lookAtEnabled,
          userSettings: {
            ...userSettings,
            [currentUserId]: { ...current, lookAtEnabled },
          },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      // Only persist the per-user settings map
      partialize: (state) => ({ 
        userSettings: state.userSettings,
        currentUserId: state.currentUserId,
      }),
      onRehydrate: () => {
        return (rehydratedState) => {
          if (!rehydratedState) return;
          
          // Load current user's settings after rehydration
          const key = rehydratedState.currentUserId || DEFAULT_USER;
          const settings = rehydratedState.userSettings?.[key] || DEFAULT_USER_SETTINGS;
          
          rehydratedState.preset = settings.preset;
          rehydratedState.settings = getPreset(settings.preset);
          rehydratedState.cameraPosition = settings.cameraPosition;
          rehydratedState.cameraDriftEnabled = settings.cameraDriftEnabled;
          rehydratedState.lookAtEnabled = settings.lookAtEnabled;
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
