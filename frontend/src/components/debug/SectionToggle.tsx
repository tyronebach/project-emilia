import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useDebugPanelStore } from './debugPanelStore';
import type { DebugSection } from './types';

interface SectionToggleProps {
  sections: DebugSection[];
}

export function SectionToggle({ sections }: SectionToggleProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { isEnabled, setEnabled } = useDebugPanelStore();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-white/10 transition-colors"
        title="Toggle sections"
      >
        <Settings className="w-3 h-3 text-text-secondary" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-primary/95 backdrop-blur-md border border-white/10 rounded-lg shadow-lg p-2 min-w-[180px]">
          <div className="text-[10px] text-text-secondary uppercase mb-1 px-1">Sections</div>
          {sections.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isEnabled(s.id, s.defaultEnabled)}
                onChange={(e) => setEnabled(s.id, e.target.checked)}
                className="w-3 h-3 accent-accent"
              />
              <span className="text-xs text-text-primary">{s.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
