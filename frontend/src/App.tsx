import { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { useAppStore } from './store';
import { useUserStore } from './store/userStore';
import { useChatStore } from './store/chatStore';
import Header from './components/Header';
import Drawer from './components/Drawer';
import AvatarPanel from './components/AvatarPanel';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';
import DebugPanel from './components/DebugPanel';
import MemoryModal from './components/MemoryModal';

interface AppProps {
  userId: string;
  sessionId: string;
}

/**
 * Main App Layout
 * 
 * Structure:
 * - Full-screen avatar background
 * - Header overlay at top (with drawer toggle + debug/memory buttons)
 * - Chat history overlay on bottom half (semi-transparent)
 * - Floating input bar at bottom
 * - Side drawer for sessions/settings
 * - Debug panel (right side modal)
 * - Memory modal (top half modal)
 */
function App({ userId, sessionId }: AppProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const setSessionId = useAppStore((state) => state.setSessionId);
  const currentUser = useUserStore((state) => state.currentUser);
  const clearMessages = useChatStore((state) => state.clearMessages);

  // Sync sessionId from route to store
  useEffect(() => {
    if (sessionId && sessionId !== 'new') {
      setSessionId(sessionId);
    } else {
      // 'new' session - clear session ID, will be created on first message
      setSessionId('');
      clearMessages();
    }
  }, [sessionId, setSessionId, clearMessages]);

  // Verify user matches route
  useEffect(() => {
    if (currentUser && currentUser.id !== userId) {
      // User mismatch - clear state (routing will handle redirect)
      clearMessages();
    }
  }, [userId, currentUser, clearMessages]);

  return (
    <AppProvider>
      <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden relative">
        {/* Full-screen Avatar Background */}
        <AvatarPanel />

        {/* Header Overlay */}
        <Header 
          onMenuClick={() => setDrawerOpen(true)} 
          onDebugClick={() => setDebugOpen(!debugOpen)}
          onMemoryClick={() => setMemoryOpen(!memoryOpen)}
          debugOpen={debugOpen}
          memoryOpen={memoryOpen}
        />

        {/* Chat History Overlay (bottom half) */}
        <ChatPanel />

        {/* Floating Input Bar */}
        <InputControls />

        {/* Side Drawer */}
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* Debug Panel */}
        <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />

        {/* Memory Modal */}
        <MemoryModal open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      </div>
    </AppProvider>
  );
}

export default App;
