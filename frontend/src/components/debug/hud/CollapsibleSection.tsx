import { useState, type ReactNode } from 'react';
import { RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '../../ui/button';

export interface CollapsibleSectionProps {
  /** Unique identifier for the section */
  id: string;
  /** Label displayed in the header */
  label: string;
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** Icon color class (e.g., 'text-pink-400') */
  iconColor?: string;
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  /** Optional refresh callback - shows refresh button when provided */
  onRefresh?: () => void;
  /** Disable refresh button */
  refreshDisabled?: boolean;
  /** Children to render when expanded */
  children: ReactNode;
  /** Optional badge content to show in header */
  badge?: ReactNode;
}

export function CollapsibleSection({
  label,
  icon: Icon,
  iconColor = 'text-accent',
  defaultExpanded = false,
  loading = false,
  onRefresh,
  refreshDisabled = false,
  children,
  badge,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        className="w-full h-8 px-3 flex items-center justify-between text-xs hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-3 h-3 ${iconColor}`} />
          <span className="text-text-primary">{label}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-text-secondary" />}
          <span className="text-text-secondary">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/10">
          {onRefresh && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                disabled={loading || refreshDisabled}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
