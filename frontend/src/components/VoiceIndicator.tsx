/**
 * VoiceIndicator - Visual feedback for voice state
 */

import { VoiceState } from '../services/VoiceService';

interface VoiceIndicatorProps {
  state: VoiceState;
  transcript?: string;
  className?: string;
}

export function VoiceIndicator({ state, transcript, className = '' }: VoiceIndicatorProps) {
  const stateConfig = {
    PASSIVE: {
      icon: '🎤',
      label: 'Voice Off',
      color: 'text-gray-400',
      bgColor: 'bg-gray-800/50',
      animate: false,
    },
    ACTIVE: {
      icon: '🎙️',
      label: 'Listening...',
      color: 'text-green-400',
      bgColor: 'bg-green-900/50',
      animate: true,
    },
    PROCESSING: {
      icon: '⏳',
      label: 'Processing...',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/50',
      animate: true,
    },
    SPEAKING: {
      icon: '🔊',
      label: 'Speaking...',
      color: 'text-blue-400',
      bgColor: 'bg-blue-900/50',
      animate: true,
    },
  };

  const config = stateConfig[state];

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* State indicator */}
      <div
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full
          ${config.bgColor} ${config.color}
          ${config.animate ? 'animate-pulse' : ''}
          transition-all duration-300
        `}
      >
        <span className="text-xl">{config.icon}</span>
        <span className="text-sm font-medium">{config.label}</span>
      </div>

      {/* Transcript display */}
      {transcript && state === 'ACTIVE' && (
        <div className="max-w-xs px-3 py-2 text-sm text-gray-300 bg-gray-800/70 rounded-lg animate-fade-in">
          <span className="text-gray-500 mr-1">Heard:</span>
          {transcript}
        </div>
      )}
    </div>
  );
}

export default VoiceIndicator;
