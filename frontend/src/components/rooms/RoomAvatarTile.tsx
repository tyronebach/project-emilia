import { useEffect, useMemo, useRef, useState } from 'react';
import { AvatarRenderer } from '../../avatar/AvatarRenderer';
import type { AvatarCommand } from '../../types';
import { useRenderStore } from '../../store/renderStore';

const DEFAULT_VRM_URL = '/vrm/emilia.vrm';

function resolveVrmUrl(vrmModel: string | null | undefined): string {
  if (!vrmModel || !vrmModel.trim()) {
    return DEFAULT_VRM_URL;
  }
  return `/vrm/${vrmModel.trim()}`;
}

interface RoomAvatarTileProps {
  agentId: string;
  displayName: string;
  vrmModel?: string | null;
  command?: AvatarCommand;
  isFocused?: boolean;
  isStreaming?: boolean;
  onLoadError?: (agentId: string, message: string) => void;
  onLoadRecovered?: (agentId: string) => void;
}

function RoomAvatarTile({
  agentId,
  displayName,
  vrmModel,
  command,
  isFocused = false,
  isStreaming = false,
  onLoadError,
  onLoadRecovered,
}: RoomAvatarTileProps) {
  const renderSettings = useRenderStore((state) => state.settings);
  const lookAtEnabled = useRenderStore((state) => state.lookAtEnabled);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const currentVrmRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const vrmUrl = useMemo(() => resolveVrmUrl(vrmModel), [vrmModel]);

  useEffect(() => {
    if (!containerRef.current) return;

    const settings = useRenderStore.getState().settings;
    const initialLookAtEnabled = useRenderStore.getState().lookAtEnabled;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl,
      backgroundColor: 0x0b1220,
      cameraDistance: 1.0,
      cameraHeight: 1.2,
      enableOrbitControls: false,
      onLoad: () => {
        renderer.applyQualitySettings(settings);
        renderer.setLookAtEnabled(initialLookAtEnabled);
        setLoading(false);
        setError(null);
        onLoadRecovered?.(agentId);
      },
      onError: (loadError: Error) => {
        console.error(`[RoomAvatarTile:${agentId}] VRM load error:`, loadError);
        const message = loadError.message || 'Failed to load avatar';
        setError(message);
        setLoading(false);
        onLoadError?.(agentId, message);
      },
      onProgress: (percent: number) => {
        setLoadProgress(percent);
      },
    });

    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();
    rendererRef.current = renderer;
    currentVrmRef.current = vrmUrl;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  // Intentional one-time initialization; renderer settings updates are handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !vrmUrl || vrmUrl === currentVrmRef.current) return;

    setLoading(true);
    setError(null);

    renderer.loadVRM(vrmUrl)
      .then(() => {
        currentVrmRef.current = vrmUrl;
        setLoading(false);
        setError(null);
        onLoadRecovered?.(agentId);
      })
      .catch((loadError: Error) => {
        console.error(`[RoomAvatarTile:${agentId}] VRM swap error:`, loadError);
        const message = loadError.message || 'Failed to load avatar';
        setError(message);
        setLoading(false);
        onLoadError?.(agentId, message);
      });
  }, [agentId, onLoadError, onLoadRecovered, vrmUrl]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.applyQualitySettings(renderSettings);
  }, [renderSettings]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setLookAtEnabled(lookAtEnabled);
  }, [lookAtEnabled]);

  useEffect(() => {
    if (!command) return;
    const expressionController = rendererRef.current?.expressionController;
    if (!expressionController) return;

    expressionController.handleIntent({
      intent: command.intent ?? 'neutral',
      mood: command.mood ?? 'neutral',
      energy: command.energy ?? 'medium',
    });
  }, [command]);

  return (
    <div
      className={`relative h-44 overflow-hidden rounded-xl border ${
        isFocused
          ? 'border-accent/50 bg-accent/8'
          : 'border-white/10 bg-bg-primary/60'
      }`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/70 text-xs text-text-secondary">
          <span>Loading {displayName}</span>
          <span>{loadProgress}%</span>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80 px-3 text-center text-xs text-error">
          {error}
        </div>
      ) : null}

      {isStreaming ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full border border-accent/40 bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-primary">
          Live
        </div>
      ) : null}
    </div>
  );
}

export default RoomAvatarTile;
