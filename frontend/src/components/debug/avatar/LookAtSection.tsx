import { useState, useEffect } from 'react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { useAvatarDebug } from './AvatarDebugContext';

export function LookAtSection() {
  const { rendererRef } = useAvatarDebug();

  const [lookAtEnabled, setLookAtEnabled] = useState(true);
  const [lookAtHeadTrackingEnabled, setLookAtHeadTrackingEnabled] = useState(true);
  const [lookAtMaxYaw, setLookAtMaxYaw] = useState(30);
  const [lookAtMaxPitchUp, setLookAtMaxPitchUp] = useState(25);
  const [lookAtMaxPitchDown, setLookAtMaxPitchDown] = useState(15);
  const [lookAtHeadWeight, setLookAtHeadWeight] = useState(0.4);
  const [lookAtSmoothSpeed, setLookAtSmoothSpeed] = useState(6);
  const [lookAtDebug, setLookAtDebug] = useState<{
    enabled: boolean;
    headTrackingEnabled: boolean;
    angleToCamera: number;
    currentHeadYaw: number;
    currentHeadPitch: number;
    hasCamera: boolean;
    hasHeadBone: boolean;
    hasVrmLookAt: boolean;
    lookAtType: string;
    isVRM0: boolean;
  } | null>(null);

  // LookAt debug polling
  useEffect(() => {
    const interval = setInterval(() => {
      const state = rendererRef.current?.lookAtSystem?.getState();
      if (state) {
        setLookAtDebug({
          enabled: state.enabled,
          headTrackingEnabled: state.headTrackingEnabled,
          angleToCamera: state.angleToCamera,
          currentHeadYaw: state.currentHeadYaw,
          currentHeadPitch: state.currentHeadPitch,
          hasCamera: state.hasCamera,
          hasHeadBone: state.hasHeadBone,
          hasVrmLookAt: state.hasVrmLookAt,
          lookAtType: state.lookAtType,
          isVRM0: state.isVRM0,
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [rendererRef]);

  return (
    <AccordionItem value="look-at" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        <span className="flex items-center gap-2">
          👁️ Look At (Eyes + Head)
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={lookAtEnabled}
              onChange={(e) => {
                setLookAtEnabled(e.target.checked);
                rendererRef.current?.setLookAtEnabled(e.target.checked);
              }}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text-secondary">Enable Look At (eyes via VRM)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={lookAtHeadTrackingEnabled}
              onChange={(e) => {
                setLookAtHeadTrackingEnabled(e.target.checked);
                rendererRef.current?.setLookAtConfig({ headTrackingEnabled: e.target.checked });
              }}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text-secondary">Enable Head Tracking (manual)</span>
          </label>

          {lookAtEnabled && (
            <div className="space-y-3 p-3 bg-bg-tertiary/60 border border-white/10 rounded-lg">
              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Max Yaw (left/right)</span>
                  <span className="text-accent">{lookAtMaxYaw}°</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={5}
                  value={lookAtMaxYaw}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setLookAtMaxYaw(val);
                    rendererRef.current?.setLookAtConfig({ maxYaw: val });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Max Pitch Up (looking up)</span>
                  <span className="text-accent">{lookAtMaxPitchUp}°</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={5}
                  value={lookAtMaxPitchUp}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setLookAtMaxPitchUp(val);
                    rendererRef.current?.setLookAtConfig({ maxPitchUp: val });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Max Pitch Down (looking down)</span>
                  <span className="text-accent">{lookAtMaxPitchDown}°</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={5}
                  value={lookAtMaxPitchDown}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setLookAtMaxPitchDown(val);
                    rendererRef.current?.setLookAtConfig({ maxPitchDown: val });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Head Weight (how much head follows)</span>
                  <span className="text-accent">{(lookAtHeadWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.05}
                  value={lookAtHeadWeight}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLookAtHeadWeight(val);
                    rendererRef.current?.setLookAtConfig({ headWeight: val });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Smooth Speed (higher = snappier)</span>
                  <span className="text-accent">{lookAtSmoothSpeed}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={1}
                  value={lookAtSmoothSpeed}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setLookAtSmoothSpeed(val);
                    rendererRef.current?.setLookAtConfig({ smoothSpeed: val });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <p className="text-xs text-text-secondary/70 mt-2">
                Eyes: VRM handles via lookAt.target (bone or expression type)<br/>
                Head: Manual bone rotation with configurable limits
              </p>

              {/* Debug output */}
              <div className="mt-3 p-2 bg-bg-primary/80 border border-white/10 rounded font-mono text-xs">
                <div className="text-text-secondary font-semibold mb-1">Debug State:</div>
                {lookAtDebug ? (
                  <>
                    <div className={lookAtDebug.hasCamera ? 'text-green-400' : 'text-red-400'}>
                      Camera: {lookAtDebug.hasCamera ? '✓' : '✗ NOT SET'}
                    </div>
                    <div className={lookAtDebug.hasHeadBone ? 'text-green-400' : 'text-red-400'}>
                      Head bone: {lookAtDebug.hasHeadBone ? '✓' : '✗ NOT FOUND'}
                    </div>
                    <div className={lookAtDebug.hasVrmLookAt ? 'text-green-400' : 'text-yellow-400'}>
                      VRM LookAt: {lookAtDebug.hasVrmLookAt ? '✓' : '○ not available'}
                    </div>
                    {lookAtDebug.hasVrmLookAt && (
                      <div className="text-text-secondary">
                        Type: <span className="text-accent">{lookAtDebug.lookAtType}</span>
                        <span className="text-xs ml-1">({lookAtDebug.lookAtType === 'bone' ? 'eye bones' : 'blend shapes'})</span>
                      </div>
                    )}
                    <div className="text-text-secondary">
                      VRM: <span className="text-accent">{lookAtDebug.isVRM0 ? '0.x' : '1.0'}</span>
                    </div>
                    <div className="mt-2 text-text-primary">
                      Angle to camera: <span className="text-accent">{lookAtDebug.angleToCamera.toFixed(1)}°</span>
                    </div>
                    <div className="text-text-primary">
                      Head Yaw: <span className="text-accent">{lookAtDebug.currentHeadYaw.toFixed(1)}°</span>
                      {' / '}
                      Pitch: <span className="text-accent">{lookAtDebug.currentHeadPitch.toFixed(1)}°</span>
                    </div>
                    {/* Visual yaw bar */}
                    <div className="mt-1">
                      <div className="text-xs text-text-secondary mb-0.5">Head Yaw</div>
                      <div className="h-2 bg-bg-tertiary rounded overflow-hidden relative">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                        <div
                          className="absolute h-full w-2 bg-accent transition-all duration-100 rounded"
                          style={{
                            left: `${50 + (lookAtDebug.currentHeadYaw / lookAtMaxYaw) * 50}%`,
                            transform: 'translateX(-50%)'
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-red-400">LookAtSystem not initialized</div>
                )}
              </div>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
