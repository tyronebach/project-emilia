import { User } from 'lucide-react';
import { useAppStore } from '../../../store';
import { useUserStore } from '../../../store/userStore';
import { STATUS_COLORS } from '../../../types';
import type { AppStatus } from '../../../types';
import { CollapsibleSection } from './CollapsibleSection';

const getStatusColor = (s: AppStatus): string => STATUS_COLORS[s] ?? 'bg-text-secondary/60';

export function StatusSection() {
  const status = useAppStore((s) => s.status);
  const sessionId = useAppStore((s) => s.sessionId);
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);

  return (
    <CollapsibleSection
      id="hud-status"
      label="Status & Context"
      icon={User}
      iconColor="text-blue-400"
      defaultExpanded
    >
      {/* Status Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(status)}`} />
          <span className="text-xs font-medium text-text-primary capitalize">{status}</span>
        </div>
        <div className="text-xs text-text-secondary font-mono">
          {sessionId ? sessionId.slice(0, 8) + '...' : '—'}
        </div>
      </div>

      {/* Context */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-text-secondary">User: </span>
          <span className="text-text-primary">{currentUser?.display_name || '—'}</span>
        </div>
        <div>
          <span className="text-text-secondary">Agent: </span>
          <span className="text-accent">{currentAgent?.display_name || '—'}</span>
        </div>
      </div>
    </CollapsibleSection>
  );
}
