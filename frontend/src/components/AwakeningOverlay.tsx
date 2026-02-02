import { useState, useEffect } from 'react';
import { useUserStore } from '../store/userStore';

const FLAVOR_TEXTS = [
  "Booting up neural pathways...",
  "Loading personality matrix...",
  "Installing memory modules...",
  "Calibrating emotional responses...",
  "Brushing hair...",
  "Picking out today's outfit...",
  "Reviewing conversation history...",
  "Stretching virtual muscles...",
  "Warming up voice synthesizer...",
  "Loading witty comebacks...",
  "Remembering your name...",
  "Preparing heartfelt greeting...",
  "Syncing with the cloud...",
  "Downloading latest gossip...",
  "Practicing smile in mirror...",
  "Making mental notes...",
  "Charging charm batteries...",
  "Activating sass module...",
  "Loading empathy drivers...",
  "Compiling feelings.exe...",
];

/**
 * First-message "awakening" overlay
 * Shows blurred avatar + spinner while agent is "waking up"
 */
function AwakeningOverlay() {
  const currentAgent = useUserStore((state) => state.currentAgent);
  const agentName = currentAgent?.display_name || 'your companion';
  
  const [flavorIndex, setFlavorIndex] = useState(() => 
    Math.floor(Math.random() * FLAVOR_TEXTS.length)
  );
  
  // Rotate flavor text every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFlavorIndex(prev => (prev + 1) % FLAVOR_TEXTS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <>
      {/* Blur overlay for avatar */}
      <div 
        className="absolute inset-0 z-5 pointer-events-none"
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(0, 0, 0, 0.3)',
        }}
      />
      
      {/* Centered spinner and text */}
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <div className="text-center px-4">
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              Bringing {agentName} to life...
            </h2>
            <p className="text-text-secondary text-sm h-5 transition-opacity duration-300">
              ✨ {FLAVOR_TEXTS[flavorIndex]}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default AwakeningOverlay;
