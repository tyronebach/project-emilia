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
      <div className={`text-sm text-red-400 ${className}`}>
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
          px-6 py-3 rounded-lg font-medium transition-all
          ${isEnabled 
            ? 'bg-red-600 hover:bg-red-700 text-white' 
            : 'bg-green-600 hover:bg-green-700 text-white'
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
              className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              ▶️ Start Listening
            </button>
          )}
          
          {state === 'ACTIVE' && (
            <button
              onClick={onDeactivate}
              className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              ⏹️ Stop Listening
            </button>
          )}
          
          {(state === 'ACTIVE' || state === 'PROCESSING') && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg transition-colors"
            >
              ✖️ Cancel
            </button>
          )}
        </div>
      )}

      {/* State debug info */}
      {isEnabled && (
        <div className="text-xs text-gray-500">
          State: <code className="text-gray-400">{state}</code>
        </div>
      )}
    </div>
  );
}

export default VoiceToggle;
