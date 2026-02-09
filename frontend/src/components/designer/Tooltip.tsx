import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition(rect.top < 80 ? 'bottom' : 'top');
    }
  }, [visible]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className={`absolute z-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-text-primary bg-bg-tertiary border border-white/15 rounded-lg shadow-lg max-w-[240px] w-max pointer-events-none ${
            position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-1/2 -translate-x-1/2`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export function HelpDot({ tip }: { tip: string }) {
  return (
    <Tooltip content={tip}>
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/8 border border-white/15 text-[9px] text-text-secondary cursor-help ml-1 hover:bg-white/15 hover:text-text-primary transition-colors">
        ?
      </span>
    </Tooltip>
  );
}

export default Tooltip;
