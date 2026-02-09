import { Clock, MessageSquare } from 'lucide-react';
import type { UserAgentBondSummary } from '../../types/designer';

interface BondCardProps {
  bond: UserAgentBondSummary;
  onSelect: (userId: string, agentId: string) => void;
  selected?: boolean;
  comparing?: boolean;
  onCompareToggle?: (userId: string) => void;
}

function formatLastActive(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function BondCard({ bond, onSelect, selected, comparing, onCompareToggle }: BondCardProps) {
  const trustPct = Math.max(0, Math.min(100, bond.trust * 100));
  const intimacyPct = Math.max(0, Math.min(100, bond.intimacy * 100));

  const checkboxId = `compare-${bond.user_id}-${bond.agent_id}`;

  return (
    <button
      type="button"
      className={`w-full text-left bg-bg-secondary/70 border rounded-xl transition-colors cursor-pointer hover:border-white/20 ${
        selected ? 'border-accent/50' : 'border-white/10'
      }`}
      onClick={() => onSelect(bond.user_id, bond.agent_id)}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {onCompareToggle && (
                <label
                  htmlFor={checkboxId}
                  className="flex items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={comparing ?? false}
                    onChange={(e) => {
                      e.stopPropagation();
                      onCompareToggle(bond.user_id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-white/20 bg-bg-tertiary text-accent focus:ring-accent/50"
                  />
                  <span className="sr-only">Compare {bond.agent_name}</span>
                </label>
              )}
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">{bond.agent_name}</span>
                <span className="text-[10px] text-text-secondary font-mono truncate block">
                  user: {bond.user_id.slice(0, 12)}...
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-text-secondary shrink-0">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatLastActive(bond.last_interaction)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {bond.interaction_count}
            </span>
          </div>
        </div>

        {/* Dimension Bars */}
        <div className="space-y-2">
          {/* Trust */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-text-secondary">Trust</span>
              <span className="text-[10px] font-mono text-text-secondary">{trustPct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${trustPct}%` }}
              />
            </div>
          </div>

          {/* Intimacy */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-text-secondary">Intimacy</span>
              <span className="text-[10px] font-mono text-text-secondary">{intimacyPct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-400 rounded-full transition-all duration-300"
                style={{ width: `${intimacyPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default BondCard;
