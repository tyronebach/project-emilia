import { useEffect, useRef, useState } from 'react';
import { Settings2, HeartHandshake, BookOpenText, Brain, Zap } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { Button } from './ui/button';
import { updateAgent } from '../utils/api';

interface AgentPanelDropdownProps {
  onBondClick: () => void;
  onAboutClick: () => void;
  onMemoryClick: () => void;
}

function AgentPanelDropdown({
  onBondClick,
  onAboutClick,
  onMemoryClick,
}: AgentPanelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [modeTogglePending, setModeTogglePending] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const updateCurrentAgent = useUserStore((state) => state.updateCurrentAgent);

  const chatMode = currentAgent?.chat_mode || 'openclaw';

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleToggleMode = async () => {
    if (!currentAgent?.id || modeTogglePending) return;
    const nextMode = chatMode === 'direct' ? 'openclaw' : 'direct';

    setModeTogglePending(true);
    updateCurrentAgent({ chat_mode: nextMode });

    try {
      await updateAgent(currentAgent.id, { chat_mode: nextMode });
    } catch (error) {
      console.error('Failed to update chat mode:', error);
      updateCurrentAgent({ chat_mode: chatMode });
    } finally {
      setModeTogglePending(false);
    }
  };

  const handleItemClick = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className={`text-text-primary hover:bg-white/10 bg-bg-secondary/45 border border-white/10 ${open ? 'bg-white/15' : ''}`}
        title="Agent Panel"
      >
        <Settings2 className="w-5 h-5" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-bg-secondary/95 backdrop-blur-xl shadow-lg z-50 overflow-hidden">
          {/* Mode toggle */}
          <button
            onClick={handleToggleMode}
            disabled={modeTogglePending || !currentAgent?.id}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors border-b border-white/10 disabled:opacity-50"
          >
            <Zap className={`w-4 h-4 ${chatMode === 'direct' ? 'text-amber-400' : 'text-blue-400'}`} />
            <div className="flex-1">
              <div className="text-sm text-text-primary">Chat Mode</div>
              <div className={`text-xs ${chatMode === 'direct' ? 'text-amber-400' : 'text-blue-400'}`}>
                {chatMode === 'direct' ? 'Direct' : 'OpenClaw'}
              </div>
            </div>
          </button>

          {/* Bond */}
          <button
            onClick={() => handleItemClick(onBondClick)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
          >
            <HeartHandshake className="w-4 h-4 text-pink-400" />
            <span className="text-sm text-text-primary">Bond</span>
          </button>

          {/* About */}
          <button
            onClick={() => handleItemClick(onAboutClick)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
          >
            <BookOpenText className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-text-primary">About</span>
          </button>

          {/* Memory */}
          <button
            onClick={() => handleItemClick(onMemoryClick)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
          >
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-text-primary">Agent Memory</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default AgentPanelDropdown;
