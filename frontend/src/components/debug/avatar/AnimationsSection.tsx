import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { animationLibrary, animationStateMachine, type ManifestEntry } from '../../../avatar';
import { useAvatarDebug } from './AvatarDebugContext';

export function AnimationsSection() {
  const { rendererRef, setLastAction } = useAvatarDebug();

  const [availableAnimations, setAvailableAnimations] = useState<ManifestEntry[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [stateMachineActions, setStateMachineActions] = useState<string[]>([]);

  // Load animations on mount
  useEffect(() => {
    (async () => {
      try {
        const animations = await animationLibrary.getAvailableAnimations();
        setAvailableAnimations(animations);

        await animationStateMachine.load();
        const actions = animationStateMachine.getAvailableActions();
        setStateMachineActions(actions);

        if (actions.length > 0) {
          setSelectedAnimation(actions[0]);
        } else if (animations.length > 0) {
          setSelectedAnimation(animations[0].id);
        }
      } catch (err) {
        console.warn('Failed to fetch animations:', err);
      }
    })();
  }, []);

  const playAnimation = useCallback((name: string) => {
    const renderer = rendererRef.current;
    if (!renderer?.animationPlayer) {
      setLastAction('Error: Animation player not ready');
      return;
    }

    renderer.animationPlayer.play(name);
    setLastAction(`Animation: ${name}`);
  }, [rendererRef, setLastAction]);

  return (
    <AccordionItem value="animations" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        Animations ({stateMachineActions.length} actions, {availableAnimations.length} files)
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary">Select Animation</label>
            <select
              value={selectedAnimation}
              onChange={(e) => setSelectedAnimation(e.target.value)}
              className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1"
            >
              <optgroup label="⚡ State Machine Actions">
                {stateMachineActions.map((action) => (
                  <option key={action} value={action}>🎬 {action}</option>
                ))}
              </optgroup>
              <optgroup label="📁 VRMA Files">
                {availableAnimations.filter(a => a.type === 'vrma').map((anim) => (
                  <option key={anim.id} value={anim.id}>{anim.name}</option>
                ))}
              </optgroup>
              <optgroup label="📁 GLB Files">
                {availableAnimations.filter(a => a.type === 'glb').map((anim) => (
                  <option key={anim.id} value={anim.id}>{anim.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => playAnimation(selectedAnimation)}
              disabled={!selectedAnimation}
              className="flex-1 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
            >
              <Play className="w-3 h-3 mr-1" />
              Play
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                rendererRef.current?.resetAnimations();
                setLastAction('Reset to bind pose');
              }}
              className="text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10 bg-warning/10"
              title="Reset skeleton to bind pose and clear animation cache"
            >
              🔄 Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setLastAction('Refreshing animations...');
                const animations = await animationLibrary.refreshManifest();
                setAvailableAnimations(animations);
                setLastAction(`Found ${animations.length} animations`);
              }}
              className="text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
              title="Refresh animation list"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>

          <p className="text-xs text-text-secondary">
            State machine: {stateMachineActions.length} actions | Files: {availableAnimations.filter(a => a.type === 'vrma').length} VRMA, {availableAnimations.filter(a => a.type === 'glb').length} GLB
          </p>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
