import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Button } from '../../ui/button';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { getPreset, type QualityPreset, type QualitySettings } from '../../../avatar';
import { useRenderStore } from '../../../store/renderStore';
import { useAvatarDebug } from './AvatarDebugContext';

export function RenderQualitySection() {
  const { rendererRef, setLastAction } = useAvatarDebug();
  const storePreset = useRenderStore((s) => s.preset);
  const storeSetPreset = useRenderStore((s) => s.setPreset);
  const storeSetSettings = useRenderStore((s) => s.setSettings);

  // Local state initialised from store; written back on Apply
  const [qualityPreset, setQualityPreset] = useState<QualityPreset | 'custom'>(storePreset);
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>(getPreset(storePreset));
  const [fps, setFps] = useState<number>(0);
  const fpsFramesRef = useRef<number[]>([]);
  const lastFpsUpdateRef = useRef<number>(0);

  // FPS tracking
  useEffect(() => {
    let animationId: number;

    const trackFps = () => {
      const now = performance.now();
      fpsFramesRef.current.push(now);

      const oneSecondAgo = now - 1000;
      fpsFramesRef.current = fpsFramesRef.current.filter(t => t > oneSecondAgo);

      if (now - lastFpsUpdateRef.current > 500) {
        setFps(fpsFramesRef.current.length);
        lastFpsUpdateRef.current = now;
      }

      animationId = requestAnimationFrame(trackFps);
    };

    animationId = requestAnimationFrame(trackFps);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <AccordionItem value="render-quality" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        <span className="flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Render Quality
          <span className="ml-auto text-xs font-normal text-accent">{fps} FPS</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          {/* Preset selector */}
          <div>
            <label className="text-xs text-text-secondary">Quality Preset</label>
            <select
              value={qualityPreset}
              onChange={(e) => {
                const preset = e.target.value as QualityPreset;
                if (preset === 'custom') return;
                setQualityPreset(preset);
                setQualitySettings(getPreset(preset));
              }}
              className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1"
            >
              <option value="low">Low (Performance)</option>
              <option value="medium">Medium (Balanced)</option>
              <option value="high">High (Quality)</option>
              {qualityPreset === 'custom' && <option value="custom">Custom</option>}
            </select>
          </div>

          {/* Individual controls */}
          <div className="space-y-3 p-3 bg-bg-tertiary/60 border border-white/10 rounded-lg">
            <div className="text-xs font-semibold text-text-secondary">Fine-Tune Settings</div>

            {/* Shadows */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qualitySettings.shadows}
                onChange={(e) => {
                  setQualitySettings(prev => ({ ...prev, shadows: e.target.checked }));
                  setQualityPreset('custom');
                }}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-xs text-text-secondary">Shadows</span>
            </label>

            {qualitySettings.shadows && (
              <>
                <div>
                  <label className="text-xs text-text-secondary">Shadow Map Size</label>
                  <select
                    value={qualitySettings.shadowMapSize}
                    onChange={(e) => {
                      setQualitySettings(prev => ({ ...prev, shadowMapSize: parseInt(e.target.value) }));
                      setQualityPreset('custom');
                    }}
                    className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1 text-xs mt-1"
                  >
                    <option value={512}>512 (Fast)</option>
                    <option value={1024}>1024 (Balanced)</option>
                    <option value={2048}>2048 (Quality)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-text-secondary mb-1">
                    <span>Shadow Bias (acne fix)</span>
                    <span className="text-accent">{qualitySettings.shadowBias.toFixed(4)}</span>
                  </div>
                  <input
                    type="range"
                    min="-0.005"
                    max="0"
                    step="0.0001"
                    value={qualitySettings.shadowBias}
                    onChange={(e) => {
                      setQualitySettings(prev => ({ ...prev, shadowBias: parseFloat(e.target.value) }));
                      setQualityPreset('custom');
                    }}
                    className="w-full h-2 accent-accent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-text-secondary mb-1">
                    <span>Normal Bias (curved surfaces)</span>
                    <span className="text-accent">{qualitySettings.shadowNormalBias.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.005"
                    value={qualitySettings.shadowNormalBias}
                    onChange={(e) => {
                      setQualitySettings(prev => ({ ...prev, shadowNormalBias: parseFloat(e.target.value) }));
                      setQualityPreset('custom');
                    }}
                    className="w-full h-2 accent-accent"
                  />
                </div>
              </>
            )}

            {/* Post-Processing */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qualitySettings.postProcessing}
                onChange={(e) => {
                  setQualitySettings(prev => ({ ...prev, postProcessing: e.target.checked }));
                  setQualityPreset('custom');
                }}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-xs text-text-secondary">Post-Processing</span>
            </label>

            {qualitySettings.postProcessing && (
              <>
                <label className="flex items-center gap-2 cursor-pointer pl-4">
                  <input
                    type="checkbox"
                    checked={qualitySettings.bloom}
                    onChange={(e) => {
                      setQualitySettings(prev => ({ ...prev, bloom: e.target.checked }));
                      setQualityPreset('custom');
                    }}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-xs text-text-secondary">Bloom</span>
                </label>

                {qualitySettings.bloom && (
                  <div className="pl-4 space-y-2">
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <span>Bloom Strength</span>
                        <span className="text-accent">{qualitySettings.bloomStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={qualitySettings.bloomStrength}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, bloomStrength: parseFloat(e.target.value) }));
                          setQualityPreset('custom');
                        }}
                        className="w-full h-2 accent-accent"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <span>Bloom Threshold</span>
                        <span className="text-accent">{qualitySettings.bloomThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={qualitySettings.bloomThreshold}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, bloomThreshold: parseFloat(e.target.value) }));
                          setQualityPreset('custom');
                        }}
                        className="w-full h-2 accent-accent"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <span>Bloom Radius</span>
                        <span className="text-accent">{qualitySettings.bloomRadius.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={qualitySettings.bloomRadius}
                        onChange={(e) => {
                          setQualitySettings(prev => ({ ...prev, bloomRadius: parseFloat(e.target.value) }));
                          setQualityPreset('custom');
                        }}
                        className="w-full h-2 accent-accent"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer pl-4">
                  <input
                    type="checkbox"
                    checked={qualitySettings.smaa}
                    onChange={(e) => {
                      setQualitySettings(prev => ({ ...prev, smaa: e.target.checked }));
                      setQualityPreset('custom');
                    }}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-xs text-text-secondary">SMAA (Anti-Aliasing)</span>
                </label>
              </>
            )}

            {/* Alpha To Coverage */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qualitySettings.alphaToCoverage}
                onChange={(e) => {
                  setQualitySettings(prev => ({ ...prev, alphaToCoverage: e.target.checked }));
                  setQualityPreset('custom');
                }}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-xs text-text-secondary">Alpha To Coverage (smooth edges)</span>
            </label>
          </div>

          {/* Apply button */}
          <Button
            onClick={() => {
              rendererRef.current?.applyQualitySettings(qualitySettings);
              // Persist to store so main app stays in sync
              if (qualityPreset === 'custom') {
                storeSetSettings(qualitySettings);
              } else {
                storeSetPreset(qualityPreset as QualityPreset);
              }
              setLastAction(`Quality: ${qualityPreset}`);
            }}
            size="sm"
            className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            Apply Quality Settings
          </Button>

          {/* Current settings summary */}
          <div className="text-xs text-text-secondary/70 p-2 bg-bg-tertiary/80 border border-white/10 rounded font-mono">
            <div>Pixel Ratio: {qualitySettings.pixelRatio.toFixed(1)}x</div>
            <div>Shadows: {qualitySettings.shadows ? `ON (${qualitySettings.shadowMapSize}px)` : 'OFF'}</div>
            <div>Post-FX: {qualitySettings.postProcessing ? 'ON' : 'OFF'}</div>
            {qualitySettings.postProcessing && (
              <>
                <div className="pl-2">Bloom: {qualitySettings.bloom ? `${qualitySettings.bloomStrength.toFixed(2)}` : 'OFF'}</div>
                <div className="pl-2">SMAA: {qualitySettings.smaa ? 'ON' : 'OFF'}</div>
              </>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
