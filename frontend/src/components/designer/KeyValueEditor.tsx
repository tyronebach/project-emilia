import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../ui/button';

interface KeyValueEditorProps {
  label: string;
  data: Record<string, number>;
  onChange: (data: Record<string, number>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}

function KeyValueEditor({
  label,
  data,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = '0.0',
  disabled = false,
}: KeyValueEditorProps) {
  const [newKey, setNewKey] = useState('');

  const entries = Object.entries(data);

  const handleValueChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      onChange({ ...data, [key]: num });
    }
  };

  const handleRemove = (key: string) => {
    const next = { ...data };
    delete next[key];
    onChange(next);
  };

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key || key in data) return;
    onChange({ ...data, [key]: 0 });
    setNewKey('');
  };

  return (
    <div>
      <label className="block text-xs text-text-secondary mb-2">{label}</label>
      <div className="space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-mono bg-bg-tertiary rounded px-2 py-1 min-w-[80px]">
              {key}
            </span>
            <input
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => handleValueChange(key, e.target.value)}
              disabled={disabled}
              className="flex-1 bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-xs font-mono focus:border-accent focus:outline-none"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleRemove(key)}
              disabled={disabled}
              className="text-text-secondary hover:text-error shrink-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={keyPlaceholder}
            disabled={disabled}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1 bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-xs font-mono focus:border-accent focus:outline-none placeholder:text-text-secondary/50"
          />
          <input
            type="text"
            value={valuePlaceholder}
            readOnly
            className="w-16 bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1 text-xs font-mono opacity-50"
            tabIndex={-1}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleAdd}
            disabled={disabled || !newKey.trim()}
            className="text-text-secondary hover:text-accent shrink-0"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default KeyValueEditor;
