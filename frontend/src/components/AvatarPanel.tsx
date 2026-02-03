import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import type { VRM } from '@pixiv/three-vrm';

/**
 * Full-screen avatar background component
 * No collapse, no header - just the 3D avatar filling the viewport
 */
function AvatarPanel() {
  const { avatarRendererRef } = useApp();
  const setAvatarRenderer = useAppStore((state) => state.setAvatarRenderer);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentVrmRef = useRef<string | null>(null);

  // Get VRM URL from agent or default
  const vrmUrl = currentAgent?.vrm_model ? `/vrm/${currentAgent.vrm_model}` : '/vrm/emilia.vrm';

  // Initialize avatar renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl,
      onLoad: (vrm: VRM) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        console.log('VRM loaded:', metaName || 'Unknown');
        setLoading(false);
        setError(null);
        // Sync renderer to store AFTER VRM loads
        setAvatarRenderer(renderer);
      },
      onError: (err: Error) => {
        console.error('VRM load error:', err);
        setError(err.message || 'Failed to load avatar');
        setLoading(false);
      },
      onProgress: (percent: number) => {
        setLoadProgress(percent);
      },
    });

    // Initialize and start
    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();

    // Store reference and track loaded VRM
    avatarRendererRef.current = renderer;
    currentVrmRef.current = vrmUrl;

    // Cleanup
    return () => {
      renderer.dispose();
      avatarRendererRef.current = null;
      setAvatarRenderer(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarRendererRef, setAvatarRenderer]);

  // Hotswap VRM when agent changes
  useEffect(() => {
    const renderer = avatarRendererRef.current;
    if (!renderer || !vrmUrl || vrmUrl === currentVrmRef.current) return;

    console.log('Hotswapping VRM:', currentVrmRef.current, '→', vrmUrl);
    setLoading(true);
    setError(null);

    renderer.loadVRM(vrmUrl)
      .then((vrm) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        console.log('VRM hotswapped:', metaName || 'Unknown');
        currentVrmRef.current = vrmUrl;
        setLoading(false);
      })
      .catch((err) => {
        console.error('VRM hotswap error:', err);
        setError(err.message || 'Failed to load avatar');
        setLoading(false);
      });
  }, [vrmUrl, avatarRendererRef]);

  return (
    <div className="absolute inset-0 z-0">
      {/* Avatar Canvas - full screen */}
      <div ref={containerRef} className="w-full h-full bg-bg-primary">
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary z-10">
            <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
            <span className="text-sm text-text-secondary">
              Loading avatar... {loadProgress}%
            </span>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary z-10">
            <span className="text-sm text-error mb-2">⚠️ {error}</span>
            <span className="text-xs text-text-secondary">
              Check console for details
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AvatarPanel;
