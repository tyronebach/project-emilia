import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAppStore } from '../../../store';
import { CollapsibleSection } from './CollapsibleSection';

export function ErrorsSection() {
  const errors = useAppStore((s) => s.errors);

  const recentErrors = useMemo(() => {
    return (errors || []).slice(-5);
  }, [errors]);

  const errorBadge =
    recentErrors.length > 0 ? (
      <span className="ml-2 px-1.5 py-0.5 text-[9px] font-medium rounded bg-error/20 text-error">
        {recentErrors.length}
      </span>
    ) : null;

  return (
    <CollapsibleSection
      id="hud-errors"
      label="Errors"
      icon={AlertCircle}
      iconColor="text-error"
      badge={errorBadge}
    >
      {recentErrors.length > 0 ? (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {recentErrors.map((err, i) => (
            <div key={i} className="text-[10px] text-error/80 bg-error/10 rounded px-2 py-1">
              {err}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-success text-center py-2">
          No errors
        </div>
      )}
    </CollapsibleSection>
  );
}
