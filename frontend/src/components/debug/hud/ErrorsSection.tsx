import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAppStore } from '../../../store';

export function ErrorsSection() {
  const errors = useAppStore((s) => s.errors);

  const recentErrors = useMemo(() => {
    return (errors || []).slice(-5);
  }, [errors]);

  if (recentErrors.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] text-error uppercase mb-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        Errors
      </div>
      <div className="space-y-1 max-h-20 overflow-y-auto">
        {recentErrors.map((err, i) => (
          <div key={i} className="text-[10px] text-error/80 bg-error/10 rounded px-2 py-1">
            {err}
          </div>
        ))}
      </div>
    </div>
  );
}
