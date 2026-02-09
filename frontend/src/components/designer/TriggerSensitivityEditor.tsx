import { TRIGGER_TAXONOMY, CATEGORY_DESCRIPTIONS, TRIGGER_DESCRIPTIONS } from '../../types/designer';
import type { TriggerCategory } from '../../types/designer';

interface TriggerSensitivityEditorProps {
  sensitivities: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
}

function getSensitivityLabel(value: number): { label: string; color: string } {
  if (value < 0.5) return { label: 'Muted', color: 'text-red-400' };
  if (value < 0.8) return { label: 'Low', color: 'text-yellow-400' };
  if (value <= 1.2) return { label: 'Normal', color: 'text-text-secondary' };
  if (value <= 2.0) return { label: 'Amplified', color: 'text-blue-400' };
  return { label: 'Hypersensitive', color: 'text-purple-400' };
}

function TriggerSensitivityEditor({ sensitivities, onChange }: TriggerSensitivityEditorProps) {
  const handleChange = (trigger: string, value: number) => {
    onChange({ ...sensitivities, [trigger]: value });
  };

  const categories = Object.keys(TRIGGER_TAXONOMY) as TriggerCategory[];

  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const triggers = TRIGGER_TAXONOMY[category];
        return (
          <div key={category}>
            <h5 className="text-xs font-medium text-text-secondary uppercase tracking-wider capitalize">
              {category}
            </h5>
            <p className="text-[10px] text-text-secondary/60 mb-2">{CATEGORY_DESCRIPTIONS[category]}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2">
              {triggers.map((trigger) => {
                const value = sensitivities[trigger] ?? 1.0;
                const { label, color } = getSensitivityLabel(value);
                return (
                  <div key={trigger}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-secondary capitalize" title={TRIGGER_DESCRIPTIONS[trigger] ?? ''}>
                        {trigger.replace(/_/g, ' ')}
                      </label>
                      <span className={`text-xs font-mono ${color}`}>
                        {value.toFixed(2)} {label}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={3.0}
                      step={0.05}
                      value={value}
                      onChange={(e) => handleChange(trigger, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-accent"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TriggerSensitivityEditor;
