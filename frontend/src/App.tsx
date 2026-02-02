import { useState, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AppProvider } from './context/AppContext';
import { useAppStore } from './store';
import { useUserStore } from './store/userStore';
import { useChatStore } from './store/chatStore';
import { useSession } from './hooks/useSession';
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
 * Main App Layout - Only for existing chat sessions
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
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const hasValidatedRef = useRef(false);

  const setSessionId = useAppStore((state) => state.setSessionId);
  const currentUser = useUserStore((state) => state.currentUser);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const { fetchSessions } = useSession();

  // Sync sessionId from route to store
  useEffect(() => {
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  // Reset validation flag when sessionId changes
  useEffect(() => {
    hasValidatedRef.current = false;
  }, [sessionId]);

  // Validate sessionId exists - redirect to /chat/new if not found
  // Only validate ONCE per sessionId using fresh API data
  useEffect(() => {
    // Don't validate if no user or already validated this sessionId
    if (!currentUser || hasValidatedRef.current) return;

    // Mark as validated to prevent re-checking
    hasValidatedRef.current = true;

    console.log('[App] Validating session:', sessionId);

    // Always use fresh API data to validate - don't rely on cached sessions state
    // This prevents race conditions when navigating from InitializingPage
    fetchSessions().then(freshSessions => {
      const existsInFresh = freshSessions.some(s => s.id === sessionId);
      console.log('[App] Session exists in fresh data:', existsInFresh);

      if (!existsInFresh) {
        console.log('[App] Session not found, redirecting to /chat/new');
        navigate({
          to: '/user/$userId/chat/new',
          params: { userId: currentUser.id },
          replace: true
        });
      }
    });
  }, [sessionId, currentUser, navigate, fetchSessions]);

  // Verify user matches route
  useEffect(() => {
    if (currentUser && currentUser.id !== userId) {
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
