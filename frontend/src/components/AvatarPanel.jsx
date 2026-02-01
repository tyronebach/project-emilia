import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { AvatarRenderer } from '../avatar/AvatarRenderer';

function AvatarPanel() {
  const { avatarRendererRef, avatarState, status } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  
  // Initialize avatar renderer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: '/emilia.vrm',
      onLoad: (vrm) => {
        console.log('VRM loaded:', vrm.meta?.name);
        setLoading(false);
        setError(null);
      },
      onError: (err) => {
        console.error('VRM load error:', err);
        setError(err.message || 'Failed to load avatar');
        setLoading(false);
      },
      onProgress: (percent) => {
        setLoadProgress(percent);
      }
    });
    
    // Initialize and start
    renderer.init();
    renderer.loadVRM();
    renderer.startRenderLoop();
    
    // Store reference
    avatarRendererRef.current = renderer;
    
    // Cleanup
    return () => {
      renderer.dispose();
      avatarRendererRef.current = null;
    };
  }, [avatarRendererRef]);
  
  // Status badge
  const getStatusBadge = () => {
    if (status === 'thinking') {
      return <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded">Thinking...</span>;
    }
    if (status === 'speaking') {
      return <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Speaking</span>;
    }
    if (avatarState?.mood) {
      return <span className="text-xs bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded">{avatarState.mood}</span>;
    }
    return null;
  };
  
  return (
    <div className={`bg-bg-secondary rounded-xl overflow-hidden transition-all duration-300 shrink-0 ${
      collapsed ? 'h-12' : 'h-48 md:h-64'
    }`}>
      {/* Header (clickable to collapse on mobile) */}
      <div 
        className="h-12 px-4 flex items-center justify-between bg-bg-tertiary/50 cursor-pointer md:cursor-default"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Avatar</span>
          {getStatusBadge()}
        </div>
        
        {/* Collapse arrow (mobile only) */}
        <svg 
          className={`w-4 h-4 text-text-secondary transition-transform md:hidden ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {/* Avatar Canvas */}
      <div 
        ref={containerRef}
        className={`w-full h-[calc(100%-3rem)] bg-bg-primary relative ${collapsed ? 'hidden' : ''}`}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/90 z-10">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-sm text-text-secondary">Loading avatar... {loadProgress}%</span>
          </div>
        )}
        
        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/90 z-10">
            <svg className="w-8 h-8 text-error mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-error">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AvatarPanel;
