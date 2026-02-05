import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface AppTopNavProps {
  onBack?: () => void;
  subtitle?: string;
  rightSlot?: ReactNode;
  className?: string;
  showBrand?: boolean;
}

function AppTopNav({
  onBack,
  subtitle,
  rightSlot,
  className,
  showBrand = true,
}: AppTopNavProps) {
  return (
    <header
      className={cn(
        'w-full h-12 md:h-16 border-b border-white/10 bg-bg-secondary/60 backdrop-blur-md',
        className
      )}
    >
      <div className="flex items-center justify-between h-full px-3 md:px-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Back"
              className="text-text-primary hover:bg-white/10 bg-bg-secondary/70 border border-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          {showBrand && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-2xl bg-bg-tertiary/80 border border-white/10 flex items-center justify-center text-sm md:text-base font-semibold tracking-wide">
                心
              </div>
              <div className="leading-tight">
                <div className="font-display text-base md:text-lg">Kokoro</div>
                {subtitle && (
                  <div className="text-xs text-text-secondary">{subtitle}</div>
                )}
              </div>
            </div>
          )}
        </div>
        {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
      </div>
    </header>
  );
}

export default AppTopNav;
