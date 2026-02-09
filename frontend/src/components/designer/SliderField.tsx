interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  disabled = false,
}: SliderFieldProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-text-secondary">{label}</label>
        <span className="text-xs font-mono text-text-secondary">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-accent disabled:opacity-50"
      />
    </div>
  );
}

export default SliderField;
