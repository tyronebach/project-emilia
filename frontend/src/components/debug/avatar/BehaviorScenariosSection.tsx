import { useState, useCallback } from 'react';
import { Button } from '../../ui/button';
import { AccordionItem, AccordionTrigger, AccordionContent } from '../../ui/accordion';
import { useAppStore } from '../../../store';
import { parseBehaviorTags, type ParsedBehavior } from '../../../utils/behaviorTags';
import { useAvatarDebug } from './AvatarDebugContext';

// Behavior scenarios mapped to state machine actions (FBX animations)
const BEHAVIOR_SCENARIOS = [
  // Greetings & Farewells
  { id: 'wave', label: '👋 Wave', text: '[INTENT:greeting] [MOOD:happy:0.7] [ENERGY:high] Hi there!' },
  { id: 'bow', label: '🙇 Bow', text: '[INTENT:farewell] [MOOD:neutral:0.5] [ENERGY:medium] Thank you!' },
  // Agreement & Disagreement
  { id: 'nod', label: '✓ Nod', text: '[INTENT:agreement] [MOOD:happy:0.5] [ENERGY:medium] Yes, I agree.' },
  { id: 'agree', label: '👍 Agree', text: '[INTENT:agreement] [MOOD:happy:0.6] [ENERGY:medium] Absolutely!' },
  { id: 'disagree', label: '✗ Disagree', text: '[INTENT:disagreement] [MOOD:neutral:0.4] [ENERGY:low] I don\'t think so.' },
  // Emotions
  { id: 'happy', label: '😊 Happy', text: '[INTENT:playful] [MOOD:happy:0.8] [ENERGY:high] This is wonderful!' },
  { id: 'excited', label: '🎉 Excited', text: '[INTENT:excited] [MOOD:happy:0.9] [ENERGY:high] Oh wow, amazing!' },
  { id: 'surprised', label: '😮 Surprised', text: '[INTENT:surprised] [MOOD:surprised:0.9] [ENERGY:high] Wait, really?!' },
  { id: 'shy', label: '😳 Shy', text: '[INTENT:affection] [MOOD:embarrassed:0.7] [ENERGY:low] Oh, you\'re too kind~' },
  { id: 'thinking', label: '🤔 Thinking', text: '[INTENT:thinking] [MOOD:neutral:0.5] [ENERGY:low] Hmm, let me consider...' },
  // Negative emotions
  { id: 'angry', label: '😠 Angry', text: '[INTENT:disagreement] [MOOD:angry:0.8] [ENERGY:high] That\'s unacceptable!' },
  { id: 'annoyed', label: '😤 Annoyed', text: '[INTENT:dismissive] [MOOD:angry:0.5] [ENERGY:medium] Ugh, really?' },
  { id: 'dismissive', label: '🙄 Dismissive', text: '[INTENT:dismissive] [MOOD:neutral:0.4] [ENERGY:low] Whatever...' },
  { id: 'sarcastic', label: '😏 Sarcastic', text: '[INTENT:playful] [MOOD:smug:0.6] [ENERGY:medium] Oh sure, totally.' },
  // Other
  { id: 'smug', label: '😼 Smug', text: '[INTENT:confident] [MOOD:smug:0.7] [ENERGY:medium] Obviously I\'m right.' },
  { id: 'relieved', label: '😌 Relieved', text: '[INTENT:neutral] [MOOD:happy:0.5] [ENERGY:low] Phew, that\'s a relief.' },
  { id: 'look_away', label: '👀 Look Away', text: '[INTENT:thinking] [MOOD:neutral:0.3] [ENERGY:low] Well, about that...' },
  // Fun
  { id: 'dance', label: '💃 Dance', text: '[INTENT:playful] [MOOD:happy:0.9] [ENERGY:high] Let\'s dance!' },
];

type BehaviorDebugInfo = {
  intent: string;
  mood: string;
  energy: string;
  emotion: string;
  intensity: number;
  gesture: string | null;
};

type BehaviorLogEntry = {
  id: string;
  time: string;
  label: string;
  intent: string;
  mood: string;
  energy: string;
  gesture: string | null;
  emotion: string;
  intensity: number;
};

export function BehaviorScenariosSection() {
  const { rendererRef, setLastAction } = useAvatarDebug();
  const applyAvatarCommand = useAppStore((state) => state.applyAvatarCommand);

  const [customScenarioText, setCustomScenarioText] = useState('');
  const [lastScenarioParse, setLastScenarioParse] = useState<{
    label: string;
    rawText: string;
    cleanText: string;
    behavior: ParsedBehavior;
  } | null>(null);
  const [behaviorDebug, setBehaviorDebug] = useState<BehaviorDebugInfo | null>(null);
  const [behaviorLog, setBehaviorLog] = useState<BehaviorLogEntry[]>([]);

  const runBehaviorScenario = useCallback((label: string, rawText: string) => {
    const renderer = rendererRef.current;
    if (!renderer?.expressionController) {
      setLastAction('Error: Behavior engine not ready');
      return;
    }

    const { cleanText, behavior } = parseBehaviorTags(rawText);
    applyAvatarCommand({
      intent: behavior.intent ?? undefined,
      mood: behavior.mood ?? undefined,
      energy: behavior.energy ?? undefined,
      intensity: behavior.mood_intensity,
    });

    const debug = renderer.expressionController.getLastBehaviorDebug?.() ?? null;
    setBehaviorDebug(debug);
    setLastScenarioParse({ label, rawText, cleanText, behavior });

    const resolved = debug ?? {
      intent: behavior.intent ?? 'neutral',
      mood: behavior.mood ?? 'neutral',
      energy: behavior.energy ?? 'medium',
      emotion: behavior.mood ?? 'neutral',
      intensity: behavior.mood_intensity,
      gesture: null,
    };

    setBehaviorLog((prev) => {
      const entry: BehaviorLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: new Date().toLocaleTimeString(),
        label,
        intent: resolved.intent,
        mood: resolved.mood,
        energy: resolved.energy,
        emotion: resolved.emotion,
        intensity: resolved.intensity,
        gesture: resolved.gesture,
      };
      return [...prev, entry].slice(-5);
    });

    const gestureLabel = resolved.gesture ? ` → ${resolved.gesture}` : '';
    setLastAction(`Behavior: ${label}${gestureLabel}`);
  }, [applyAvatarCommand, rendererRef, setLastAction]);

  return (
    <AccordionItem value="behavior-scenarios" className="border-white/10">
      <AccordionTrigger className="text-sm font-semibold text-text-secondary uppercase tracking-wide hover:no-underline">
        Behavior Scenarios
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <div>
            <div className="text-xs text-text-secondary mb-2">Scripted Scenarios</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BEHAVIOR_SCENARIOS.map((scenario) => (
                <Button
                  key={scenario.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => runBehaviorScenario(scenario.label, scenario.text)}
                  className="justify-start text-left text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
                  title={scenario.text}
                >
                  {scenario.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Custom Scenario</label>
            <textarea
              value={customScenarioText}
              onChange={(e) => setCustomScenarioText(e.target.value)}
              placeholder="[INTENT:greeting] [MOOD:happy:0.8] [ENERGY:high] Hi there!"
              rows={3}
              className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-2 py-1.5 text-sm mt-1 resize-none"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => runBehaviorScenario('Custom', customScenarioText)}
                disabled={!customScenarioText.trim()}
                size="sm"
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                Run Custom
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomScenarioText('')}
                className="text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 border border-white/10"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="p-2 bg-bg-tertiary/80 border border-white/10 rounded space-y-1 text-xs">
            <div className="text-text-secondary font-semibold">Behavior Output</div>
            {lastScenarioParse ? (
              <>
                <div className="text-text-secondary">
                  Scenario: <span className="text-text-primary">{lastScenarioParse.label}</span>
                </div>
                <div className="text-text-secondary">
                  Parsed tags: intent <span className="text-accent">{lastScenarioParse.behavior.intent ?? 'none'}</span>, mood{' '}
                  <span className="text-accent">{lastScenarioParse.behavior.mood ?? 'none'}</span> @{' '}
                  {lastScenarioParse.behavior.mood_intensity.toFixed(2)}, energy{' '}
                  <span className="text-accent">{lastScenarioParse.behavior.energy ?? 'none'}</span>
                </div>
                <div className="text-text-secondary">
                  Clean text: <span className="text-text-primary">{lastScenarioParse.cleanText || '-'}</span>
                </div>
                <div className="text-text-secondary">
                  Selected gesture: <span className="text-accent">{behaviorDebug?.gesture ?? 'none'}</span>
                </div>
                <div className="text-text-secondary">
                  Facial emotion: <span className="text-accent">{behaviorDebug?.emotion ?? '-'}</span> @{' '}
                  {(behaviorDebug?.intensity ?? 0).toFixed(2)}
                </div>
              </>
            ) : (
              <div className="text-text-secondary">Run a scenario to see parsed tags and the planned gesture.</div>
            )}
          </div>

          <div className="p-2 bg-bg-tertiary/80 border border-white/10 rounded space-y-1 text-xs">
            <div className="text-text-secondary font-semibold">Recent Behaviors</div>
            {behaviorLog.length === 0 ? (
              <div className="text-text-secondary">No behaviors triggered yet.</div>
            ) : (
              <div className="space-y-1">
                {behaviorLog.map((entry) => (
                  <div key={entry.id} className="rounded border border-white/10 bg-bg-tertiary/60 px-2 py-1">
                    <div className="flex items-center justify-between">
                      <span className="text-text-primary">{entry.label}</span>
                      <span className="text-text-secondary">{entry.time}</span>
                    </div>
                    <div className="text-text-secondary">
                      intent <span className="text-accent">{entry.intent}</span>, mood{' '}
                      <span className="text-accent">{entry.mood}</span>, energy{' '}
                      <span className="text-accent">{entry.energy}</span>, gesture{' '}
                      <span className="text-accent">{entry.gesture ?? 'none'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
