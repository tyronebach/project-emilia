import { createContext, useContext } from 'react';
import type { AvatarRenderer } from '../../../avatar';
import type * as THREE from 'three';

export interface AvatarDebugContextValue {
  rendererRef: React.RefObject<AvatarRenderer | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  fbxMixerRef: React.RefObject<THREE.AnimationMixer | null>;
  fbxActionRef: React.RefObject<THREE.AnimationAction | null>;
  lastAction: string;
  setLastAction: (action: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const AvatarDebugContext = createContext<AvatarDebugContextValue | null>(null);

export function AvatarDebugProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AvatarDebugContextValue;
}) {
  return (
    <AvatarDebugContext.Provider value={value}>
      {children}
    </AvatarDebugContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context + hook is standard pattern
export function useAvatarDebug(): AvatarDebugContextValue {
  const ctx = useContext(AvatarDebugContext);
  if (!ctx) throw new Error('useAvatarDebug must be used within AvatarDebugProvider');
  return ctx;
}
