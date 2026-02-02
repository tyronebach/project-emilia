import { useState, useEffect, useCallback } from 'react';
import { X, Brain, RefreshCw } from 'lucide-react';
import { getMemory } from '../utils/api';
import { Button } from './ui/button';

interface MemoryModalProps {
  open: boolean;
  onClose: () => void;
}

function MemoryModal({ open, onClose }: MemoryModalProps) {
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await getMemory();
      setMemoryContent(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memories');
      setMemoryContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when opened and periodically refresh
  useEffect(() => {
    if (open) {
      fetchMemories();
      // Auto-refresh every 10 seconds while open
      const interval = setInterval(fetchMemories, 10000);
      return () => clearInterval(interval);
    }
  }, [open, fetchMemories]);

  if (!open) return null;

  return (
    <div className="fixed top-14 left-0 right-0 h-[45vh] bg-black/50 backdrop-blur-sm border-b border-white/10 z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          <Brain className="w-3 h-3 text-accent" />
          <span className="text-xs font-medium text-text-primary">Agent Memory</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={fetchMemories}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content - scrollable, clipped */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        {loading && !memoryContent ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-error text-xs">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchMemories}
              className="mt-2 text-xs"
            >
              Retry
            </Button>
          </div>
        ) : !memoryContent ? (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 mx-auto text-text-secondary/30 mb-2" />
            <p className="text-text-secondary text-xs">No memories stored yet</p>
          </div>
        ) : (
          <pre className="text-xs text-text-primary whitespace-pre-wrap break-words font-mono leading-relaxed">
            {memoryContent}
          </pre>
        )}
      </div>
    </div>
  );
}

export default MemoryModal;
