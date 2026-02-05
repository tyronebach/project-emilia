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
      color: 'text-text-secondary',
      bgColor: 'bg-bg-tertiary/60',
      animate: false,
    },
    ACTIVE: {
      icon: '🎙️',
      label: 'Listening...',
      color: 'text-success',
      bgColor: 'bg-success/20',
      animate: true,
    },
    PROCESSING: {
      icon: '⏳',
      label: 'Processing...',
      color: 'text-warning',
      bgColor: 'bg-warning/20',
      animate: true,
    },
    SPEAKING: {
      icon: '🔊',
      label: 'Speaking...',
      color: 'text-accent',
      bgColor: 'bg-accent/20',
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
        <div className="max-w-xs px-3 py-2 text-sm text-text-primary bg-bg-tertiary/70 rounded-lg animate-fade-in">
          <span className="text-text-secondary/70 mr-1">Heard:</span>
          {transcript}
        </div>
      )}
    </div>
  );
}

export default VoiceIndicator;
