import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RotateCcw, GitCompareArrows, ChevronDown, X } from 'lucide-react';
import { Button } from '../ui/button';
import { getBonds, getBond, compareBonds, resetBond } from '../../utils/designerApiV2';
import { getPersonalities } from '../../utils/designerApiV2';
import BondCard from './BondCard';
import BondCompareView from './BondCompareView';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import DimensionBar from './DimensionBar';
import { HelpDot } from './Tooltip';
import type { UserAgentBond } from '../../types/designer';

type SortKey = 'trust' | 'interaction_count' | 'last_interaction';

function BondsTab() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedBond, setSelectedBond] = useState<{ userId: string; agentId: string } | null>(null);
  const [comparingUserIds, setComparingUserIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_interaction');

  // Fetch agent list for filter dropdown
  const { data: agents } = useQuery({
    queryKey: ['designer-v2', 'personalities'],
    queryFn: getPersonalities,
  });

  // Fetch bonds for selected agent (or all)
  const { data: bonds, isLoading, error } = useQuery({
    queryKey: ['designer-v2', 'bonds', selectedAgent],
    queryFn: () => getBonds(selectedAgent || undefined),
  });

  // Fetch full bond detail when selected
  const { data: bondDetail } = useQuery({
    queryKey: ['designer-v2', 'bond', selectedBond?.userId, selectedBond?.agentId],
    queryFn: () => getBond(selectedBond!.userId, selectedBond!.agentId),
    enabled: !!selectedBond,
  });

  // Compare bonds query
  const { data: comparedBonds } = useQuery({
    queryKey: ['designer-v2', 'bonds', 'compare', selectedAgent, comparingUserIds],
    queryFn: () => compareBonds(selectedAgent!, comparingUserIds),
    enabled: showCompare && !!selectedAgent && comparingUserIds.length >= 2,
  });

  // Reset bond mutation
  const resetMut = useMutation({
    mutationFn: ({ userId, agentId }: { userId: string; agentId: string }) => resetBond(userId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-v2', 'bonds'] });
      setSelectedBond(null);
    },
  });

  // Sort bonds
  const sortedBonds = useMemo(() => {
    if (!bonds) return [];
    const sorted = [...bonds];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'trust':
          return b.trust - a.trust;
        case 'interaction_count':
          return b.interaction_count - a.interaction_count;
        case 'last_interaction': {
          const aTime = a.last_interaction ? new Date(a.last_interaction).getTime() : 0;
          const bTime = b.last_interaction ? new Date(b.last_interaction).getTime() : 0;
          return bTime - aTime;
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [bonds, sortKey]);

  const handleSelectBond = (userId: string, agentId: string) => {
    if (selectedBond?.userId === userId && selectedBond?.agentId === agentId) {
      setSelectedBond(null);
    } else {
      setSelectedBond({ userId, agentId });
    }
  };

  const handleCompareToggle = (userId: string) => {
    setComparingUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCompare = () => {
    setShowCompare(true);
  };

  const agentNameForCompare = useMemo(() => {
    if (!selectedAgent || !agents) return 'Unknown';
    const agent = agents.find((a) => a.id === selectedAgent);
    return agent?.name ?? selectedAgent;
  }, [selectedAgent, agents]);

  if (isLoading) {
    return <div className="text-center py-8 text-text-secondary">Loading bonds...</div>;
  }

  if (error) {
    return (
      <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load bonds
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-display text-text-primary">User-Agent Bonds</h2>
        <p className="text-sm text-text-secondary mt-1">
          Each bond represents the unique relationship between a user and an agent. Bonds evolve through conversation — building trust, intimacy, and familiarity over time.
        </p>
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Agent Filter */}
        <div className="relative">
          <select
            value={selectedAgent ?? ''}
            onChange={(e) => {
              setSelectedAgent(e.target.value || null);
              setSelectedBond(null);
              setComparingUserIds([]);
              setShowCompare(false);
            }}
            className="appearance-none bg-bg-secondary/70 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none cursor-pointer"
          >
            <option value="">All Agents</option>
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none bg-bg-secondary/70 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none cursor-pointer"
          >
            <option value="last_interaction">Last Active</option>
            <option value="trust">Trust</option>
            <option value="interaction_count">Interactions</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
        </div>

        <div className="flex-1" />

        {/* Compare button */}
        {selectedAgent && comparingUserIds.length >= 2 && (
          <Button size="sm" className="gap-1" onClick={handleCompare}>
            <GitCompareArrows className="w-4 h-4" />
            Compare ({comparingUserIds.length})
          </Button>
        )}

        <p className="text-sm text-text-secondary">{sortedBonds.length} bond{sortedBonds.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Compare View */}
      {showCompare && comparedBonds && comparedBonds.length >= 2 && (
        <div className="relative">
          <button
            onClick={() => setShowCompare(false)}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
          <BondCompareView bonds={comparedBonds} agentName={agentNameForCompare} />
        </div>
      )}

      {/* Bond Cards */}
      <div className="space-y-3">
        {sortedBonds.map((bond) => (
          <BondCard
            key={`${bond.user_id}-${bond.agent_id}`}
            bond={bond}
            onSelect={handleSelectBond}
            selected={selectedBond?.userId === bond.user_id && selectedBond?.agentId === bond.agent_id}
            comparing={comparingUserIds.includes(bond.user_id)}
            onCompareToggle={selectedAgent ? handleCompareToggle : undefined}
          />
        ))}
      </div>

      {sortedBonds.length === 0 && (
        <div className="text-center py-8 text-text-secondary">No bonds found.</div>
      )}

      {/* Selected Bond Detail */}
      {selectedBond && bondDetail && (
        <BondDetailPanel
          bond={bondDetail}
          onReset={() => setConfirmReset(true)}
          resetting={resetMut.isPending}
        />
      )}

      <DeleteConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset this bond?"
        description="This will reset all relationship dimensions and calibration data for this user-agent bond back to defaults."
        onConfirm={() => {
          if (selectedBond) {
            resetMut.mutate({ userId: selectedBond.userId, agentId: selectedBond.agentId });
          }
          setConfirmReset(false);
        }}
        loading={resetMut.isPending}
      />
    </div>
  );
}

// ============ Bond Detail Panel (inline) ============

interface BondDetailPanelProps {
  bond: UserAgentBond;
  onReset: () => void;
  resetting: boolean;
}

const DETAIL_DIMENSIONS = [
  { key: 'trust' as const, label: 'Trust', color: 'trust' as const, tip: 'How much the agent trusts this user. Affects how ambiguous messages are interpreted.' },
  { key: 'intimacy' as const, label: 'Intimacy', color: 'trust' as const, tip: 'Emotional closeness. Higher intimacy unlocks more personal, vulnerable responses.' },
  { key: 'playfulness_safety' as const, label: 'Play Safety', color: 'trust' as const, tip: 'How safe teasing and banter feel. Low = teasing might be taken as an attack.' },
  { key: 'conflict_tolerance' as const, label: 'Conflict Tolerance', color: 'trust' as const, tip: 'How much friction the relationship can handle before the agent gets defensive.' },
  { key: 'attachment' as const, label: 'Attachment', color: 'trust' as const, tip: 'How emotionally invested the agent is. Higher = stronger reactions to absence or rejection.' },
  { key: 'familiarity' as const, label: 'Familiarity', color: 'trust' as const, tip: 'How well the agent knows this user. Grows with interactions over time.' },
] as const;

function BondDetailPanel({ bond, onReset, resetting }: BondDetailPanelProps) {
  return (
    <div className="bg-bg-secondary/70 border border-accent/30 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{bond.agent_name}</h3>
          <span className="text-[10px] text-text-secondary font-mono">
            user: {bond.user_id} | agent: {bond.agent_id}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="text-error hover:text-error gap-1"
          onClick={onReset}
          disabled={resetting}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </Button>
      </div>

      {/* Emotional State */}
      <div>
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
          Current Emotional State
          <HelpDot tip="The agent's current emotional state toward this user, shaped by recent interactions." />
        </h4>
        <p className="text-[10px] text-text-secondary/60 mb-2">How the agent is feeling right now in this relationship.</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-bg-tertiary/50 rounded-lg p-2 text-center" title="Positive = happy/warm, Negative = sad/upset">
            <span className="text-[10px] text-text-secondary block">Valence</span>
            <span className="text-sm font-mono">{bond.valence.toFixed(2)}</span>
          </div>
          <div className="bg-bg-tertiary/50 rounded-lg p-2 text-center" title="High = excited/alert, Low = calm/drowsy">
            <span className="text-[10px] text-text-secondary block">Arousal</span>
            <span className="text-sm font-mono">{bond.arousal.toFixed(2)}</span>
          </div>
          <div className="bg-bg-tertiary/50 rounded-lg p-2 text-center" title="High = assertive/leading, Low = yielding/following">
            <span className="text-[10px] text-text-secondary block">Dominance</span>
            <span className="text-sm font-mono">{bond.dominance.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Dominant Moods */}
      {bond.dominant_moods.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
            Dominant Moods
            <HelpDot tip="The strongest moods driving the agent's behavior. Relative share shows how dominant each mood is compared to the others." />
          </h4>
          <p className="text-[10px] text-text-secondary/60 mb-2">Mood weights accumulate from triggers and decay toward the agent's baseline over time.</p>
          {(() => {
            const totalPositive = Object.values(bond.mood_weights).reduce((s, w) => s + Math.max(0, w), 0) || 1;
            return (
              <div className="flex flex-wrap gap-1.5">
                {bond.dominant_moods.map((mood) => {
                  const weight = bond.mood_weights[mood] ?? 0;
                  const share = Math.max(0, weight) / totalPositive;
                  return (
                    <span
                      key={mood}
                      className="text-[10px] bg-white/10 rounded-full px-2 py-0.5 text-text-primary"
                      title={`Raw weight: ${weight.toFixed(2)}`}
                    >
                      {mood}
                      <span className="ml-1 text-text-secondary">
                        {(share * 100).toFixed(0)}%
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Relationship Dimensions */}
      <div>
        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Relationship Dimensions
        </h4>
        <div className="space-y-2">
          {DETAIL_DIMENSIONS.map(({ key, label, color, tip }) => (
            <DimensionBar
              key={key}
              label={label}
              value={bond[key]}
              colorScale={color}
              tooltip={tip}
            />
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="border-t border-white/10 pt-3 flex items-center justify-between text-[10px] text-text-secondary">
        <span>{bond.interaction_count} interactions</span>
        <span>{bond.has_calibration ? 'Has calibration data' : 'No calibration data'}</span>
      </div>
    </div>
  );
}

export default BondsTab;
