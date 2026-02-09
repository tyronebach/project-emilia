import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Heart, RefreshCw } from 'lucide-react';
import { useUserStore } from '../../../store/userStore';
import { useChatStore } from '../../../store/chatStore';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '../../ui/dialog';
import { fetchWithAuth } from '../../../utils/api';
import { Sparkline } from '../Sparkline';
import { DeltaBadge } from '../DeltaBadge';

interface EmotionalState {
  valence: number;
  arousal: number;
  dominance: number;
  trust: number;
  attachment: number;
  familiarity: number;
  intimacy: number;
  playfulness_safety: number;
  conflict_tolerance: number;
}

interface BehaviorLevers {
  warmth: number;
  playfulness: number;
  guardedness: number;
}

interface EmotionalDebug {
  state: EmotionalState;
  behavior_levers: BehaviorLevers | null;
  profile: Record<string, unknown>;
  interaction_count: number;
}

interface TimelineEvent {
  timestamp: number;
  valence_before: number;
  valence_after: number;
  arousal_before: number;
  arousal_after: number;
  trust_delta: number | null;
  intimacy_delta: number | null;
  dominant_mood_after: string | null;
  triggers: Array<[string, number]>;
  inferred_outcome: string | null;
}

export function EmotionEngineSection() {
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const lastEmotionDebug = useChatStore((s) => s.lastEmotionDebug);

  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [emotionalData, setEmotionalData] = useState<EmotionalDebug | null>(null);
  const [emotionalLoading, setEmotionalLoading] = useState(false);
  const [emotionalError, setEmotionalError] = useState<string | null>(null);
  const [emotionalExpanded, setEmotionalExpanded] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const previousEmotionalData = useRef<EmotionalDebug | null>(null);

  const fetchEmotionalState = useCallback(async () => {
    if (!currentUser?.id || !currentAgent?.id) return;
    setEmotionalLoading(true);
    setEmotionalError(null);
    try {
      const [stateRes, timelineRes] = await Promise.all([
        fetchWithAuth(`/api/debug/emotional-state/${currentUser.id}/${currentAgent.id}`),
        fetchWithAuth(`/api/debug/emotional-timeline/${currentUser.id}/${currentAgent.id}?limit=30`),
      ]);
      if (!stateRes.ok) throw new Error(`${stateRes.status}`);
      const newData = await stateRes.json();
      setEmotionalData((prev) => {
        if (!prev || newData.interaction_count !== prev.interaction_count) {
          previousEmotionalData.current = prev;
        }
        return newData;
      });
      if (timelineRes.ok) {
        const tl = await timelineRes.json();
        setTimelineEvents(tl.events || []);
      }
    } catch (e) {
      setEmotionalError((e as Error).message);
    } finally {
      setEmotionalLoading(false);
    }
  }, [currentUser?.id, currentAgent?.id]);

  useEffect(() => {
    if (currentUser?.id && currentAgent?.id) {
      fetchEmotionalState();
    }
  }, [currentUser?.id, currentAgent?.id, fetchEmotionalState]);

  return (
    <>
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <button
          className="w-full h-8 px-3 flex items-center justify-between text-xs hover:bg-white/5 transition-colors"
          onClick={() => setEmotionalExpanded(!emotionalExpanded)}
        >
          <div className="flex items-center gap-2">
            <Heart className="w-3 h-3 text-pink-400" />
            <span className="text-text-primary">Emotion Engine</span>
          </div>
          <div className="flex items-center gap-2">
            {emotionalLoading && <RefreshCw className="w-3 h-3 animate-spin text-text-secondary" />}
            <span className="text-text-secondary">{emotionalExpanded ? '−' : '+'}</span>
          </div>
        </button>

        {emotionalExpanded && (
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/10">
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px]"
                onClick={fetchEmotionalState}
                disabled={emotionalLoading || !currentUser?.id || !currentAgent?.id}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${emotionalLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {emotionalError && (
              <div className="text-[10px] text-error bg-error/10 rounded px-2 py-1">{emotionalError}</div>
            )}

            {!currentUser?.id || !currentAgent?.id ? (
              <div className="text-[10px] text-text-secondary text-center py-2">
                Select user and agent to view emotional state
              </div>
            ) : emotionalData ? (
              <>
                {timelineEvents.length >= 2 && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase mb-1">Timeline</div>
                    <div className="bg-white/5 rounded p-1.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-blue-400 w-10">Val</span>
                        <Sparkline
                          data={timelineEvents.map((e) => e.valence_after)}
                          color="#60a5fa"
                          width={260}
                          height={28}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-red-400 w-10">Aro</span>
                        <Sparkline
                          data={timelineEvents.map((e) => e.arousal_after)}
                          color="#f87171"
                          width={260}
                          height={28}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] text-text-secondary uppercase mb-1">VAD State</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['valence', 'arousal', 'dominance'] as const).map((key) => (
                      <div key={key} className="bg-white/5 rounded px-2 py-1 text-center">
                        <div className="text-[10px] text-text-secondary capitalize">{key}</div>
                        <div className={`text-xs font-mono ${
                          emotionalData.state[key] > 0.3 ? 'text-success' :
                          emotionalData.state[key] < -0.2 ? 'text-error' : 'text-text-primary'
                        }`}>
                          {emotionalData.state[key].toFixed(2)}
                          <DeltaBadge
                            current={emotionalData.state[key]}
                            previous={previousEmotionalData.current?.state[key]}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-text-secondary uppercase mb-1">Relationship</div>
                  <div className="space-y-1">
                    {([
                      { key: 'trust' as const, label: 'Trust', color: 'bg-blue-400' },
                      { key: 'intimacy' as const, label: 'Intimacy', color: 'bg-pink-400' },
                      { key: 'playfulness_safety' as const, label: 'Play Safety', color: 'bg-purple-400' },
                      { key: 'conflict_tolerance' as const, label: 'Conflict Tol.', color: 'bg-orange-400' },
                      { key: 'attachment' as const, label: 'Attachment', color: 'bg-cyan-400' },
                      { key: 'familiarity' as const, label: 'Familiarity', color: 'bg-green-400' },
                    ]).map(({ key, label, color }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] text-text-secondary w-20 truncate">{label}</span>
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${color}`}
                            style={{ width: `${Math.max(0, Math.min(100, emotionalData.state[key] * 100))}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-primary font-mono w-10 text-right">
                          {(emotionalData.state[key] * 100).toFixed(0)}%
                        </span>
                        <DeltaBadge
                          current={emotionalData.state[key]}
                          previous={previousEmotionalData.current?.state[key]}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {emotionalData.behavior_levers && (
                  <div>
                    <div className="text-[10px] text-text-secondary uppercase mb-1">Behavior Levers</div>
                    <div className="space-y-1">
                      {([
                        { key: 'warmth' as const, color: 'bg-pink-400' },
                        { key: 'playfulness' as const, color: 'bg-purple-400' },
                        { key: 'guardedness' as const, color: 'bg-orange-400' },
                      ]).map(({ key, color }) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] text-text-secondary w-20 capitalize">{key}</span>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${color}`}
                              style={{ width: `${Math.max(0, Math.min(100, emotionalData.behavior_levers![key] * 100))}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-text-primary font-mono w-10 text-right">
                            {emotionalData.behavior_levers![key].toFixed(2)}
                          </span>
                          <DeltaBadge
                            current={emotionalData.behavior_levers![key]}
                            previous={previousEmotionalData.current?.behavior_levers?.[key]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-text-secondary text-right">
                  {emotionalData.interaction_count} interactions
                  <DeltaBadge
                    current={emotionalData.interaction_count}
                    previous={previousEmotionalData.current?.interaction_count}
                    precision={0}
                  />
                </div>

                <div>
                  <div className="text-[10px] text-text-secondary uppercase mb-1">Last Classification</div>
                  {lastEmotionDebug ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1">
                        {lastEmotionDebug.triggers.length > 0 ? (
                          lastEmotionDebug.triggers.map(([trigger, intensity]) => (
                            <span
                              key={trigger}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded text-[10px] font-mono"
                            >
                              {trigger}
                              <span className="text-pink-400/70">{intensity.toFixed(2)}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-text-secondary/60">No triggers</span>
                        )}
                      </div>
                      {lastEmotionDebug.context_block && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] text-text-secondary hover:text-text-primary"
                          onClick={() => setContextModalOpen(true)}
                        >
                          View Prompt Context
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-text-secondary/60">No data yet — send a message</div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-[10px] text-text-secondary text-center py-2">
                {emotionalLoading ? 'Loading...' : 'No emotional data'}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={contextModalOpen} onOpenChange={(next) => { if (!next) setContextModalOpen(false); }}>
        <DialogContent className="w-[28rem] max-w-[92vw] max-h-[80vh] overflow-hidden flex flex-col p-0">
          <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-400" />
              <DialogTitle>Emotion Context Block</DialogTitle>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <X className="w-3 h-3" />
              </Button>
            </DialogClose>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {lastEmotionDebug?.context_block ? (
              <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap leading-relaxed bg-bg-tertiary/80 rounded-lg p-3 border border-white/5 overflow-x-auto">
                {lastEmotionDebug.context_block}
              </pre>
            ) : (
              <div className="text-xs text-text-secondary text-center py-6">No context block available</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
