import { useState, useEffect, useRef } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AvatarRenderer } from '../avatar/AvatarRenderer';
import { Badge } from './ui/badge';
import type { VRM } from '@pixiv/three-vrm';

function AvatarPanel() {
  const { avatarRendererRef, avatarState, status } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Initialize avatar renderer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const renderer = new AvatarRenderer(containerRef.current, {
      vrmUrl: '/emilia.vrm',
      onLoad: (vrm: VRM) => {
        const metaName = (vrm.meta as { name?: string })?.name;
        console.log('VRM loaded:', metaName || 'Unknown');
        setLoading(false);
        setError(null);
      },
      onError: (err: Error) => {
        console.error('VRM load error:', err);
        setError(err.message || 'Failed to load avatar');
        setLoading(false);
      },
      onProgress: (percent: number) => {
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
      return <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">Thinking...</Badge>;
    }
    if (status === 'speaking') {
      return <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">Speaking</Badge>;
    }
    if (avatarState?.mood) {
      return <Badge variant="secondary">{avatarState.mood}</Badge>;
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
        <ChevronDown 
          className={`w-4 h-4 text-text-secondary transition-transform md:hidden ${collapsed ? '' : 'rotate-180'}`}
        />
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
            <AlertTriangle className="w-8 h-8 text-error mb-2" />
            <span className="text-sm text-error">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AvatarPanel;
