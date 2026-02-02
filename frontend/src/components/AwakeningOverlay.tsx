import { useUserStore } from '../store/userStore';

/**
 * First-message "awakening" overlay
 * Shows blurred avatar + spinner while agent is "waking up"
 */
function AwakeningOverlay() {
  const currentAgent = useUserStore((state) => state.currentAgent);
  const agentName = currentAgent?.display_name || 'your companion';
  
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
            <p className="text-text-secondary text-sm">
              ✨ Just a moment while she wakes up
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default AwakeningOverlay;
