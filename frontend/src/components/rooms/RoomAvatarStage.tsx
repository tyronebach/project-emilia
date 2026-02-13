import { useEffect, useMemo, useState } from 'react';
import { preloadVRM } from '../../avatar/preloadVRM';
import { useRoomStore } from '../../store/roomStore';
import RoomAvatarTile from './RoomAvatarTile';

const MOBILE_QUERY = '(max-width: 1023px)';
const MOBILE_MAX_RENDERERS = 2;
const DESKTOP_MAX_RENDERERS = 4;
const DEFAULT_VRM_URL = '/vrm/emilia.vrm';

function resolveVrmUrl(vrmModel: string | null | undefined): string {
  if (!vrmModel || !vrmModel.trim()) {
    return DEFAULT_VRM_URL;
  }
  return `/vrm/${vrmModel.trim()}`;
}

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(MOBILE_QUERY);

    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isMobile;
}

function hasWebGLSupport(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas) return false;
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface RoomAvatarStageProps {
  className?: string;
}

function RoomAvatarStage({ className = '' }: RoomAvatarStageProps) {
  const agents = useRoomStore((state) => state.agents);
  const focusedAgentId = useRoomStore((state) => state.focusedAgentId);
  const streamingByAgent = useRoomStore((state) => state.streamingByAgent);
  const avatarCommandByAgent = useRoomStore((state) => state.avatarCommandByAgent);
  const lastAvatarEventAtByAgent = useRoomStore((state) => state.lastAvatarEventAtByAgent);
  const isMobile = useIsMobileViewport();
  const [tileErrors, setTileErrors] = useState<Record<string, string>>({});

  const maxRenderers = isMobile ? MOBILE_MAX_RENDERERS : DESKTOP_MAX_RENDERERS;
  const webglSupported = useMemo(() => hasWebGLSupport(), []);

  const prioritizedAgents = useMemo(() => {
    return agents
      .map((agent, index) => {
        const agentId = agent.agent_id;
        const streaming = Boolean((streamingByAgent[agentId] ?? '').trim());
        const isFocused = focusedAgentId === agentId;
        const lastAvatarEventAt = Number(lastAvatarEventAtByAgent[agentId] ?? 0);
        return {
          agent,
          index,
          streaming,
          isFocused,
          lastAvatarEventAt,
        };
      })
      .sort((left, right) => {
        if (left.isFocused !== right.isFocused) {
          return left.isFocused ? -1 : 1;
        }
        if (left.streaming !== right.streaming) {
          return left.streaming ? -1 : 1;
        }
        if (left.lastAvatarEventAt !== right.lastAvatarEventAt) {
          return right.lastAvatarEventAt - left.lastAvatarEventAt;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.agent);
  }, [agents, focusedAgentId, lastAvatarEventAtByAgent, streamingByAgent]);

  const activeAgentIds = useMemo(() => {
    return new Set(
      prioritizedAgents
        .slice(0, maxRenderers)
        .map((agent) => agent.agent_id),
    );
  }, [maxRenderers, prioritizedAgents]);

  useEffect(() => {
    const preloadTargets = prioritizedAgents.slice(0, maxRenderers + 2);
    for (const agent of preloadTargets) {
      const url = resolveVrmUrl(agent.vrm_model);
      void preloadVRM(url).catch((error) => {
        console.warn(`[RoomAvatarStage] VRM preload failed for ${agent.agent_id}:`, error);
      });
    }
  }, [maxRenderers, prioritizedAgents]);

  const handleTileError = (agentId: string, message: string) => {
    setTileErrors((prev) => ({
      ...prev,
      [agentId]: message,
    }));
  };

  const handleTileRecovered = (agentId: string) => {
    setTileErrors((prev) => {
      if (!prev[agentId]) return prev;
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  };

  if (!webglSupported) {
    return (
      <div className={`rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary ${className}`}>
        Live room avatars are unavailable because WebGL is not supported in this browser.
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-bg-secondary/70 p-4 text-sm text-text-secondary ${className}`}>
        No agents available for room avatar rendering.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-text-secondary">Room Avatars</p>
        <p className="text-xs text-text-secondary/80">
          Rendering {Math.min(maxRenderers, agents.length)} / {agents.length}
        </p>
      </div>

      {Object.keys(tileErrors).length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
          Some avatars failed to load. Check model files/manifest for the affected agents.
        </div>
      ) : null}

      <div className={`grid gap-3 ${agents.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {agents.map((agent) => {
          const agentId = agent.agent_id;
          const isFocused = focusedAgentId === agentId;
          const isStreaming = Boolean((streamingByAgent[agentId] ?? '').trim());
          const isActive = activeAgentIds.has(agentId);
          const command = avatarCommandByAgent[agentId];
          const lastEventTs = lastAvatarEventAtByAgent[agentId];

          return (
            <div
              key={agentId}
              className={`rounded-2xl border p-2 ${
                isFocused
                  ? 'border-accent/45 bg-accent/10'
                  : 'border-white/10 bg-bg-secondary/70'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="truncate text-sm font-medium text-text-primary">{agent.display_name}</p>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                  {isFocused ? (
                    <span className="rounded-full border border-accent/40 bg-accent/20 px-2 py-0.5 text-text-primary">
                      Focus
                    </span>
                  ) : null}
                  {isStreaming ? (
                    <span className="rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-text-primary">
                      Speaking
                    </span>
                  ) : null}
                </div>
              </div>

              {isActive ? (
                <RoomAvatarTile
                  agentId={agentId}
                  displayName={agent.display_name}
                  vrmModel={agent.vrm_model}
                  command={command}
                  isFocused={isFocused}
                  isStreaming={isStreaming}
                  onLoadError={handleTileError}
                  onLoadRecovered={handleTileRecovered}
                />
              ) : (
                <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-bg-primary/45 px-4 text-center">
                  <p className="text-xs text-text-secondary">Renderer paused (performance cap).</p>
                  <p className="mt-1 text-[11px] text-text-secondary/80">
                    {lastEventTs
                      ? `Last avatar cue at ${new Date(lastEventTs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'No avatar cues yet.'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RoomAvatarStage;
