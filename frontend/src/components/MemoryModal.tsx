import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Brain, RefreshCw, ChevronDown } from 'lucide-react';
import { getMemory, listMemoryFiles, getMemoryFile } from '../utils/api';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

interface MemoryModalProps {
  open: boolean;
  onClose: () => void;
}

function MemoryModal({ open, onClose }: MemoryModalProps) {
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('MEMORY.md');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Sort files: MEMORY.md first, then daily files newest first
  const sortedFiles = useMemo(() => {
    const dailyFiles = files
      .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
      .sort((a, b) => b.localeCompare(a)); // Newest first
    
    const otherFiles = files.filter(f => 
      f !== 'MEMORY.md' && !f.match(/^\d{4}-\d{2}-\d{2}\.md$/)
    );
    
    return ['MEMORY.md', ...dailyFiles, ...otherFiles];
  }, [files]);

  // Fetch file list
  const fetchFileList = useCallback(async () => {
    try {
      const fileList = await listMemoryFiles();
      setFiles(fileList);
    } catch (err) {
      console.error('Failed to fetch file list:', err);
    }
  }, []);

  // Fetch selected file content
  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let text: string;
      if (selectedFile === 'MEMORY.md') {
        text = await getMemory();
      } else {
        text = await getMemoryFile(selectedFile);
      }
      setMemoryContent(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch memory');
      setMemoryContent('');
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  // Fetch file list when opened
  useEffect(() => {
    if (open) {
      fetchFileList();
    }
  }, [open, fetchFileList]);

  // Fetch content when file changes or modal opens
  useEffect(() => {
    if (open) {
      fetchContent();
    }
  }, [open, selectedFile, fetchContent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (dropdownOpen) {
      const handleClick = () => setDropdownOpen(false);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [dropdownOpen]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="top-12 md:top-16 left-4 right-4 translate-x-0 translate-y-0 w-auto max-w-none h-[45svh] max-h-[70svh] p-0 overflow-hidden bg-bg-primary/70">
        {/* Header */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <DialogTitle>Agent Memory</DialogTitle>
          </div>

          {/* File Selector Dropdown */}
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(!dropdownOpen);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-tertiary/80 border border-white/10 rounded hover:bg-bg-tertiary text-text-secondary"
              >
                <span className="max-w-[120px] truncate">{selectedFile}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full right-0 mt-1 bg-bg-secondary border border-white/10 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto min-w-[160px]">
                  {sortedFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => {
                        setSelectedFile(file);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-tertiary ${
                        file === selectedFile ? 'text-accent' : 'text-text-secondary'
                      }`}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={fetchContent}
              disabled={loading}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <X className="w-3 h-3" />
              </Button>
            </DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">
          Review memory files and daily logs for this agent.
        </DialogDescription>

        {/* Content - scrollable */}
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
                onClick={fetchContent}
                className="mt-2 text-xs"
              >
                Retry
              </Button>
            </div>
          ) : !memoryContent ? (
            <div className="text-center py-8">
              <Brain className="w-8 h-8 mx-auto text-text-secondary/30 mb-2" />
              <p className="text-text-secondary text-xs">No content in {selectedFile}</p>
            </div>
          ) : (
            <pre className="text-xs text-text-primary whitespace-pre-wrap break-words font-mono leading-relaxed">
              {memoryContent}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MemoryModal;
