import type { UserAgentBond } from '../../types/designer';

interface BondCompareViewProps {
  bonds: UserAgentBond[];
  agentName: string;
}

const DIMENSIONS = [
  { key: 'trust' as const, label: 'Trust', color: 'bg-blue-400' },
  { key: 'intimacy' as const, label: 'Intimacy', color: 'bg-pink-400' },
  { key: 'playfulness_safety' as const, label: 'Play Safety', color: 'bg-purple-400' },
  { key: 'conflict_tolerance' as const, label: 'Conflict Tol.', color: 'bg-orange-400' },
  { key: 'attachment' as const, label: 'Attachment', color: 'bg-cyan-400' },
  { key: 'familiarity' as const, label: 'Familiarity', color: 'bg-green-400' },
] as const;

const DIVERGENCE_DIMENSIONS: (keyof UserAgentBond)[] = [
  'trust',
  'intimacy',
  'playfulness_safety',
  'conflict_tolerance',
];

// Assign each bond a distinct color for its bar segments
const BOND_COLORS = [
  'bg-blue-400',
  'bg-pink-400',
  'bg-purple-400',
  'bg-orange-400',
  'bg-cyan-400',
  'bg-green-400',
];

function computeDivergence(bonds: UserAgentBond[]): number {
  if (bonds.length < 2) return 0;

  let totalDiff = 0;
  let pairCount = 0;

  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      let dimDiff = 0;
      for (const dim of DIVERGENCE_DIMENSIONS) {
        dimDiff += Math.abs(
          (bonds[i][dim] as number) - (bonds[j][dim] as number)
        );
      }
      totalDiff += dimDiff / DIVERGENCE_DIMENSIONS.length;
      pairCount++;
    }
  }

  return pairCount > 0 ? totalDiff / pairCount : 0;
}

function getDivergenceLabel(score: number): { text: string; color: string } {
  if (score < 0.15) return { text: 'Similar', color: 'text-green-400' };
  if (score <= 0.4) return { text: 'Diverging', color: 'text-yellow-400' };
  return { text: 'Very Different', color: 'text-red-400' };
}

function BondCompareView({ bonds, agentName }: BondCompareViewProps) {
  const divergence = computeDivergence(bonds);
  const { text: divLabel, color: divColor } = getDivergenceLabel(divergence);

  return (
    <div className="bg-bg-secondary/70 border border-white/10 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium">Bond Comparison: {agentName}</h3>
        <p className="text-[10px] text-text-secondary mt-0.5">
          Comparing how {agentName} relates to {bonds.length} different users. Wider gaps in the bars mean the agent treats these users very differently.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {bonds.map((bond, i) => (
          <div key={bond.user_id} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${BOND_COLORS[i % BOND_COLORS.length]}`} />
            <span className="text-[10px] text-text-secondary font-mono">
              {bond.user_id.slice(0, 12)}...
            </span>
          </div>
        ))}
      </div>

      {/* Dimension Bars */}
      <div className="space-y-3">
        {DIMENSIONS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-secondary">{label}</span>
            </div>
            <div className="space-y-1">
              {bonds.map((bond, i) => {
                const value = bond[key] as number;
                const pct = Math.max(0, Math.min(100, value * 100));
                return (
                  <div key={bond.user_id} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${BOND_COLORS[i % BOND_COLORS.length]}`} />
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${BOND_COLORS[i % BOND_COLORS.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-text-primary w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Divergence Score */}
      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary" title="Measures how differently the agent treats these users. Higher = more different relationships.">Divergence Score</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-primary">{(divergence * 100).toFixed(1)}%</span>
            <span className={`text-xs font-medium ${divColor}`}>{divLabel}</span>
          </div>
        </div>
        <div className="mt-1.5 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              divergence < 0.15 ? 'bg-green-400' : divergence <= 0.4 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(100, divergence * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default BondCompareView;
