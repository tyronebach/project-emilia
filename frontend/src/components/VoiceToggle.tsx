/**
 * VoiceToggle - Enable/disable button with state controls
 */

import { VoiceState } from '../services/VoiceService';

interface VoiceToggleProps {
  isEnabled: boolean;
  isSupported: boolean;
  state: VoiceState;
  onEnable: () => void;
  onDisable: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onCancel: () => void;
  className?: string;
}

export function VoiceToggle({
  isEnabled,
  isSupported,
  state,
  onEnable,
  onDisable,
  onActivate,
  onDeactivate,
  onCancel,
  className = '',
}: VoiceToggleProps) {
  if (!isSupported) {
    return (
      <div className={`text-sm text-error ${className}`}>
        ⚠️ Speech recognition not supported in this browser
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Main toggle */}
      <button
        onClick={isEnabled ? onDisable : onEnable}
        className={`
          px-6 py-3 rounded-lg font-medium transition-all border border-white/10
          ${isEnabled
            ? 'bg-accent/20 text-text-primary hover:bg-accent/30'
            : 'bg-bg-tertiary/80 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60'
          }
        `}
      >
        {isEnabled ? '🔴 Disable Voice' : '🎤 Enable Voice'}
      </button>

      {/* Control buttons (only when enabled) */}
      {isEnabled && (
        <div className="flex gap-2 flex-wrap">
          {state === 'PASSIVE' && (
            <button
              onClick={onActivate}
              className="px-4 py-2 text-sm bg-accent/20 text-text-primary border border-accent/30 hover:bg-accent/30 rounded-lg transition-colors"
            >
              ▶️ Start Listening
            </button>
          )}
          
          {state === 'ACTIVE' && (
            <button
              onClick={onDeactivate}
              className="px-4 py-2 text-sm bg-bg-tertiary/80 border border-white/10 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 rounded-lg transition-colors"
            >
              ⏹️ Stop Listening
            </button>
          )}
          
          {(state === 'ACTIVE' || state === 'PROCESSING') && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm bg-warning/15 border border-warning/30 text-text-primary hover:bg-warning/25 rounded-lg transition-colors"
            >
              ✖️ Cancel
            </button>
          )}
        </div>
      )}

      {/* State debug info */}
      {isEnabled && (
        <div className="text-xs text-text-secondary">
          State: <code className="text-text-secondary">{state}</code>
        </div>
      )}
    </div>
  );
}

export default VoiceToggle;
