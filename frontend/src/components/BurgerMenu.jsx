import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

function BurgerMenu({ onClose }) {
  const { sessionId, clearMessages } = useApp();
  const menuRef = useRef(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  // Close on escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  const handleClearChat = () => {
    clearMessages();
    onClose();
  };
  
  return (
    <div 
      ref={menuRef}
      className="absolute top-14 right-2 md:right-4 z-50 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl min-w-56 py-2"
    >
      {/* Session Info */}
      <div className="px-4 py-2 border-b border-bg-tertiary">
        <div className="text-xs text-text-secondary uppercase tracking-wide">Session</div>
        <div className="text-sm text-text-primary truncate">{sessionId}</div>
      </div>
      
      {/* Menu Items */}
      <div className="py-1">
        <button
          onClick={handleClearChat}
          className="w-full text-left px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear Chat
        </button>
        
        <button
          onClick={() => {
            // TODO: Implement session switching
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Switch Session
        </button>
        
        <button
          onClick={() => {
            // TODO: Implement new session
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
      </div>
      
      {/* Footer */}
      <div className="border-t border-bg-tertiary px-4 py-2 mt-1">
        <div className="text-xs text-text-secondary">
          Emilia v2.0 • React + Tailwind
        </div>
      </div>
    </div>
  );
}

export default BurgerMenu;
