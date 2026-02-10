/**
 * Avatar Debug Panel
 * Test VRM models, animations, expressions, and lip sync
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { RefreshCw, Sliders, Bug, Palette } from 'lucide-react';
import { Accordion } from './ui/accordion';
import { AvatarRenderer, animationLibrary, animationStateMachine } from '../avatar';
import { useVrmOptions, type VrmOption } from '../hooks/useVrmOptions';
import { useAppStore } from '../store';
import { useRenderStore } from '../store/renderStore';
import { useDebugPanelStore } from './debug/debugPanelStore';
import { SectionToggle } from './debug/SectionToggle';
import { AvatarDebugProvider } from './debug/avatar/AvatarDebugContext';
import { avatarSections } from './debug/avatar';
import AppTopNav from './AppTopNav';
import type { VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

const VRM_BASE_PATH = '/vrm';

const DEFAULT_MODELS: VrmOption[] = [
  { id: 'emilia.vrm', name: 'Emilia' },
  { id: 'rem.vrm', name: 'Rem' },
];

const buildVrmUrl = (modelId: string) => `${VRM_BASE_PATH}/${modelId}`;

function AvatarDebugPanel() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setAvatarRenderer = useAppStore((state) => state.setAvatarRenderer);

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0].id);
  const [lastAction, setLastAction] = useState<string>('Initializing...');
  const [loading, setLoading] = useState(true);

  const fbxMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fbxActionRef = useRef<THREE.AnimationAction | null>(null);

  const { models: vrmOptions } = useVrmOptions();
  const availableModels = vrmOptions.length ? vrmOptions : DEFAULT_MODELS;
  const { isEnabled } = useDebugPanelStore();

  // Handle model switch
  const switchModel = useCallback(async (modelId: string) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (fbxActionRef.current) {
      fbxActionRef.current.stop();
      fbxActionRef.current = null;
    }
    if (fbxMixerRef.current) {
      fbxMixerRef.current.stopAllAction();
      fbxMixerRef.current = null;
    }

    setLoading(true);
    setLastAction(`Loading ${modelId}...`);
    setSelectedModel(modelId);

    try {
      const vrm = await renderer.loadVRM(buildVrmUrl(modelId));
      const metaName = (vrm.meta as { name?: string })?.name;
      setLastAction(`Loaded: ${metaName || modelId}`);

      const animations = await animationLibrary.getAvailableAnimations();
      await animationStateMachine.load();
      // Animations are loaded by AnimationsSection on mount
      void animations;
    } catch (err) {
      setLastAction(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (availableModels.some((model) => model.id === selectedModel)) return;
    const fallback = availableModels[0]?.id;
    if (!fallback) return;
    setSelectedModel(fallback);
    if (rendererRef.current) {
      switchModel(fallback);
    }
  }, [availableModels, selectedModel, switchModel]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current) return;

    const lookAtEnabled = useRenderStore.getState().lookAtEnabled;

    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: buildVrmUrl(selectedModel),
      cameraDistance: 3.0,
      cameraHeight: 1.0,
      enableOrbitControls: true,
      onLoad: async (vrm: VRM) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        setLastAction(`Loaded: ${metaName || selectedModel}`);
        setLoading(false);
        renderer.setLookAtEnabled(lookAtEnabled);
      },
      onError: (err: Error) => {
        setLastAction(`Error: ${err.message}`);
        setLoading(false);
      },
    });

    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();
    rendererRef.current = renderer;
    setAvatarRenderer(renderer);

    return () => {
      setAvatarRenderer(null);
      renderer.dispose();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update FBX mixer each frame
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();

    const updateFbxMixer = () => {
      const now = performance.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      if (fbxMixerRef.current) {
        fbxMixerRef.current.update(deltaTime);

        const vrm = rendererRef.current?.getVRM?.();
        if (vrm) {
          vrm.update(deltaTime);
        }
      }

      animationId = requestAnimationFrame(updateFbxMixer);
    };

    animationId = requestAnimationFrame(updateFbxMixer);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  const contextValue = {
    rendererRef,
    audioRef,
    fbxMixerRef,
    fbxActionRef,
    lastAction,
    setLastAction,
    loading,
    setLoading,
  };

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary flex flex-col">
      <AppTopNav
        onBack={() => navigate({ to: '/manage' })}
        subtitle="Avatar Debug Panel"
        className="relative z-30"
        rightSlot={(
          <>
            <span className="text-xs text-text-secondary bg-bg-secondary/70 border border-white/10 px-3 py-1 rounded-full max-w-[200px] truncate">
              {lastAction}
            </span>
            <SectionToggle sections={avatarSections} />
            <button
              onClick={() => navigate({ to: '/manage' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Settings"
            >
              <Sliders className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: '/designer-v2' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Agent Designer"
            >
              <Palette className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate({ to: '/debug' })}
              className="p-2 rounded-xl bg-bg-secondary/70 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
              title="Debug Avatar"
            >
              <Bug className="w-5 h-5" />
            </button>
          </>
        )}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Avatar Viewport */}
        <div className="flex-1 min-h-[350px] lg:min-h-0 bg-bg-secondary relative">
          <div ref={containerRef} className="w-full h-full" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
              <RefreshCw className="w-8 h-8 animate-spin text-accent" />
            </div>
          )}

          <div className="absolute top-4 left-4 bg-bg-primary/80 border border-white/10 backdrop-blur rounded-xl p-2">
            <select
              value={selectedModel}
              onChange={(e) => switchModel(e.target.value)}
              className="bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1 text-sm"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{m.version ? ` (${m.version})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-bg-secondary/40 overflow-y-auto shrink-0">
          <AvatarDebugProvider value={contextValue}>
            <Accordion type="multiple" defaultValue={["render-quality"]} className="px-3">
              {avatarSections
                .filter((s) => isEnabled(s.id, s.defaultEnabled))
                .map((s) => (
                  <s.component key={s.id} />
                ))}
            </Accordion>
          </AvatarDebugProvider>
        </div>
      </div>
    </div>
  );
}

export default AvatarDebugPanel;
