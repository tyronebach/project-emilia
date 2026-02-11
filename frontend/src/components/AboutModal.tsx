import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, RefreshCw, X } from 'lucide-react';
import type { SoulAboutPayload } from '../types/soulWindow';
import { getSoulAbout } from '../utils/soulWindowApi';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

function toLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function AboutModal({ open, onClose }: AboutModalProps) {
  const [about, setAbout] = useState<SoulAboutPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAbout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSoulAbout(false);
      setAbout(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load about');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchAbout();
    }
  }, [open, fetchAbout]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[34rem] max-w-[94vw] p-0 overflow-hidden">
        <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpenText className="w-4 h-4 text-accent" />
            <DialogTitle>About</DialogTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void fetchAbout()}>
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
          Parsed SOUL profile sections for the selected agent.
        </DialogDescription>

        <div className="max-h-[70svh] overflow-y-auto px-4 py-3 space-y-4">
          {loading && !about ? (
            <div className="py-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-3">
              {error}
            </div>
          ) : !about ? (
            <div className="text-sm text-text-secondary">No profile data available.</div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-bg-secondary/40 p-3">
                <div className="text-sm text-text-primary">{about.display_name}</div>
                <div className="text-xs text-text-secondary">Agent ID: {about.agent_id}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">Identity</div>
                {Object.keys(about.sections.identity).length === 0 ? (
                  <div className="text-xs text-text-secondary">No identity metadata in SOUL.md.</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(about.sections.identity).map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2">
                        <div className="text-xs text-text-secondary">{toLabel(key)}</div>
                        <div className="text-sm text-text-primary">{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <SectionList title="Essence" items={about.sections.essence} />
              <SectionList title="Personality" items={about.sections.personality} />
              <SectionList title="Quirks" items={about.sections.quirks} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-text-secondary mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-text-secondary">No entries.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={`${title}-${idx}`} className="rounded-lg border border-white/10 bg-bg-secondary/30 p-2 text-sm text-text-primary">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AboutModal;
