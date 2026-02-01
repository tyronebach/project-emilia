import { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { Badge } from './ui/badge';
import type { Memory } from '../types';

interface MemoryPanelProps {
  className?: string;
}

function MemoryPanel({ className = '' }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Fetch memories on mount
  useEffect(() => {
    const fetchMemories = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/memory');
        if (response.ok) {
          const data = await response.json();
          setMemories(data.memories || []);
        } else if (response.status === 404) {
          setMemories([]);
        } else {
          throw new Error('Failed to fetch memories');
        }
      } catch (_err) {
        setMemories([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMemories();
  }, []);
  
  return (
    <div className={`bg-bg-secondary rounded-xl overflow-hidden ${className}`}>
      <div className="h-12 px-4 flex items-center justify-between bg-bg-tertiary/50">
        <span className="text-sm font-medium text-text-primary">Memory</span>
        <Badge variant="secondary">
          {memories.length} entries
        </Badge>
      </div>
      
      <div className="p-4 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-4">
            <Lightbulb className="w-8 h-8 mx-auto text-text-secondary/50 mb-2" />
            <p className="text-sm text-text-secondary">No memories yet</p>
            <p className="text-xs text-text-secondary/70 mt-1">
              Emilia will remember important things from your conversations
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((memory, index) => (
              <div key={index} className="bg-bg-tertiary rounded-lg p-3">
                <div className="text-sm text-text-primary">{memory.content}</div>
                {memory.timestamp && (
                  <div className="text-xs text-text-secondary mt-1">
                    {new Date(memory.timestamp).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryPanel;
