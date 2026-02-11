import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartHandshake, RefreshCw, X } from 'lucide-react';
import type { SoulBondSnapshot } from '../types/soulWindow';
import { getSoulBond } from '../utils/soulWindowApi';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface BondModalProps {
  open: boolean;
  onClose: () => void;
}

function titleCase(text: string): string {
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatIso(iso: string | null): string {
  if (!iso) return 'N/A';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString();
}

function BondModal({ open, onClose }: BondModalProps) {
  const [bond, setBond] = useState<SoulBondSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dimensionRows = useMemo(() => {
    if (!bond) return [];
    return [
      { key: 'trust', value: bond.dimensions.trust },
      { key: 'intimacy', value: bond.dimensions.intimacy },
      { key: 'familiarity', value: bond.dimensions.familiarity },
      { key: 'attachment', value: bond.dimensions.attachment },
      { key: 'playfulness_safety', value: bond.dimensions.playfulness_safety },
      { key: 'conflict_tolerance', value: bond.dimensions.conflict_tolerance },
    ];
  }, [bond]);

  const fetchBond = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSoulBond();
      setBond(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bond');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchBond();
    }
  }, [open, fetchBond]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[32rem] max-w-[94vw] p-0 overflow-hidden">
        <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-accent" />
            <DialogTitle>Bond</DialogTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void fetchBond()}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <X className="w-3.5 h-3.5" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">
          Relationship dimensions and milestones for the current user and agent.
        </DialogDescription>

        <div className="max-h-[70svh] overflow-y-auto px-4 py-3 space-y-4">
          {loading && !bond ? (
            <div className="py-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-3">
              {error}
            </div>
          ) : !bond ? (
            <div className="text-sm text-text-secondary">No bond data yet.</div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-bg-secondary/40 p-3">
                <div className="text-sm text-text-primary">
                  {bond.agent_name}: <span className="text-accent">{titleCase(bond.relationship_type)}</span>
                </div>
                <div className="mt-1 text-xs text-text-secondary">{bond.labels.trust}</div>
                <div className="text-xs text-text-secondary">{bond.labels.intimacy}</div>
                <div className="text-xs text-text-secondary">{bond.labels.familiarity}</div>
              </div>

              <div className="space-y-2">
                {dimensionRows.map((row) => (
                  <div key={row.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary">{titleCase(row.key)}</span>
                      <span className="text-text-primary">{formatPercent(row.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-bg-tertiary/70 overflow-hidden">
                      <div
                        className="h-full bg-accent/80"
                        style={{ width: `${Math.round(Math.max(0, Math.min(1, row.value)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2">
                  <div className="text-text-secondary">Interactions</div>
                  <div className="text-text-primary">{bond.stats.interaction_count}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2">
                  <div className="text-text-secondary">Days Known</div>
                  <div className="text-text-primary">{bond.stats.days_known}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2 col-span-2">
                  <div className="text-text-secondary">First Interaction</div>
                  <div className="text-text-primary">{formatIso(bond.stats.first_interaction)}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2 col-span-2">
                  <div className="text-text-secondary">Last Interaction</div>
                  <div className="text-text-primary">{formatIso(bond.stats.last_interaction)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">Milestones</div>
                {bond.milestones.length === 0 ? (
                  <div className="text-xs text-text-secondary">No milestones yet.</div>
                ) : (
                  <div className="space-y-2">
                    {bond.milestones.slice(0, 12).map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2">
                        <div className="text-sm text-text-primary">{titleCase(item.type)}</div>
                        <div className="text-xs text-text-secondary">{item.date}</div>
                        {item.note && <div className="text-xs text-text-secondary mt-1">{item.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BondModal;
