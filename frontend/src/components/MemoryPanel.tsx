import { useState, useEffect } from 'react';
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
          // API not implemented yet
          setMemories([]);
        } else {
          throw new Error('Failed to fetch memories');
        }
      } catch (_err) {
        // Silent fail - API may not be implemented
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
        <span className="text-xs bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded">
          {memories.length} entries
        </span>
      </div>
      
      <div className="p-4 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center py-4">
            <svg className="w-8 h-8 mx-auto text-text-secondary/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
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
