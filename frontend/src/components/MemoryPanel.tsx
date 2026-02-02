import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { Button } from './ui/button';

interface MemoryPanelProps {
  className?: string;
}

function MemoryPanel({ className = '' }: MemoryPanelProps) {
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Fetch memories on mount
  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/api/memory');
      if (response.ok) {
        // API returns plain text (markdown)
        const text = await response.text();
        setMemoryContent(text);
      } else if (response.status === 404) {
        setMemoryContent('');
      } else {
        throw new Error('Failed to fetch memories');
      }
    } catch (_err) {
      setMemoryContent('');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);
  
  return (
    <div className={`bg-bg-secondary rounded-xl overflow-hidden ${className}`}>
      <div className="h-12 px-4 flex items-center justify-between bg-bg-tertiary/50">
        <span className="text-sm font-medium text-text-primary">📝 Memory</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={fetchMemories}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      <div className="p-4 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !memoryContent ? (
          <div className="text-center py-4">
            <Lightbulb className="w-8 h-8 mx-auto text-text-secondary/50 mb-2" />
            <p className="text-sm text-text-secondary">No memories yet</p>
            <p className="text-xs text-text-secondary/70 mt-1">
              Emilia will remember important things from your conversations
            </p>
          </div>
        ) : (
          <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono bg-bg-tertiary rounded-lg p-3 overflow-x-auto">
            {memoryContent}
          </pre>
        )}
      </div>
    </div>
  );
}

export default MemoryPanel;
