import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AppProvider, useApp } from './context/AppContext';
import { useAppStore } from './store';
import { useUserStore } from './store/userStore';
import { useChatStore } from './store/chatStore';
import { fetchWithAuth } from './utils/api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { useChat } from './hooks/useChat';
import type { VoiceDebugEntry } from './components/VoiceDebugTimeline';
import Header from './components/Header';
import Drawer from './components/Drawer';
import AvatarPanel from './components/AvatarPanel';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';
import DebugPanel from './components/DebugPanel';
import MemoryModal from './components/MemoryModal';
import UserSettingsModal from './components/UserSettingsModal';
import AwakeningOverlay from './components/AwakeningOverlay';

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
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const hasValidatedRef = useRef(false);

  const setSessionId = useAppStore((state) => state.setSessionId);
  const currentUser = useUserStore((state) => state.currentUser);
  const clearMessages = useChatStore((state) => state.clearMessages);

  // Sync sessionId from route to store
  useEffect(() => {
    const currentStoreSessionId = useAppStore.getState().sessionId;
    // Only clear messages if sessionId actually changed (not on initial mount with same ID)
    if (currentStoreSessionId && currentStoreSessionId !== sessionId) {
      useChatStore.getState().clearMessages();
    }
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  // Reset validation flag when sessionId changes
  useEffect(() => {
    hasValidatedRef.current = false;
  }, [sessionId]);

  // Validate sessionId exists - redirect to /chat/new if not found
  // Only validate ONCE per sessionId using direct session lookup (no agent dependency)
  useEffect(() => {
    // Don't validate if no user or already validated this sessionId
    if (!currentUser || hasValidatedRef.current || !sessionId) return;

    // Mark as validated to prevent re-checking
    hasValidatedRef.current = true;

    console.log('[App] Validating session:', sessionId);

    const validateSession = async () => {
      try {
        const response = await fetchWithAuth(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (response.status === 404 || response.status === 403) {
          console.log('[App] Session not found, redirecting to /chat/new');
          navigate({
            to: '/user/$userId/chat/new',
            params: { userId: currentUser.id },
            replace: true
          });
          return;
        }
        if (!response.ok) {
          console.warn('[App] Session validation failed:', response.status);
        }
      } catch (error) {
        console.warn('[App] Session validation error:', error);
      }
    };

    validateSession();
  }, [sessionId, currentUser, navigate]);

  // Verify user matches route
  useEffect(() => {
    if (currentUser && currentUser.id !== userId) {
      clearMessages();
    }
  }, [userId, currentUser, clearMessages]);

  return (
    <AppProvider>
      <AppContent
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        debugOpen={debugOpen}
        setDebugOpen={setDebugOpen}
        memoryOpen={memoryOpen}
        setMemoryOpen={setMemoryOpen}
        userSettingsOpen={userSettingsOpen}
        setUserSettingsOpen={setUserSettingsOpen}
      />
    </AppProvider>
  );
}

/**
 * Inner component that has access to AppContext
 * Handles awakening state for first-message experience
 */
function AppContent({
  drawerOpen,
  setDrawerOpen,
  debugOpen,
  setDebugOpen,
  memoryOpen,
  setMemoryOpen,
  userSettingsOpen,
  setUserSettingsOpen,
}: {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  debugOpen: boolean;
  setDebugOpen: (open: boolean) => void;
  memoryOpen: boolean;
  setMemoryOpen: (open: boolean) => void;
  userSettingsOpen: boolean;
  setUserSettingsOpen: (open: boolean) => void;
}) {
  const { messages, status, addMessage, addError, setTtsEnabled } = useApp();
  const { sendMessage } = useChat();
  const handsFreeEnabled = useAppStore((state) => state.handsFreeEnabled);
  const setHandsFreeEnabled = useAppStore((state) => state.setHandsFreeEnabled);
  const currentUser = useUserStore((state) => state.currentUser);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDebugEvents, setVoiceDebugEvents] = useState<VoiceDebugEntry[]>([]);
  const [voicePermissionWarning, setVoicePermissionWarning] = useState<string | null>(null);
  const voiceEnabledRef = useRef<boolean | null>(null);
  const MAX_VOICE_DEBUG_EVENTS = 80;

  const addVoiceDebugEvent = useCallback((event: VoiceDebugEntry['event']) => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setVoiceDebugEvents((prev) => {
      const next = [...prev, { id, time, event }];
      return next.slice(-MAX_VOICE_DEBUG_EVENTS);
    });
  }, []);

  const clearVoiceDebugEvents = useCallback(() => {
    setVoiceDebugEvents([]);
  }, []);

  const voiceChat = useVoiceChat({
    onTranscript: (text) => {
      setVoiceTranscript(text);
      addMessage('user', text, { source: 'voice' });
      void sendMessage(text);
    },
    onError: (error) => {
      addError(error.message);
    },
    onMicPermissionDenied: () => {
      setVoicePermissionWarning('Microphone permission denied');
    },
    onDebugEvent: addVoiceDebugEvent,
    silenceTimeout: 15000,
    autoResumeAfterTranscript: true,
  });
  const [hasAwakened, setHasAwakened] = useState(false);

  // Check if there are any assistant messages with content
  const hasAssistantMessage = messages.some(m => m.role === 'assistant' && m.content.trim() !== '');

  // Awakening mode: no assistant messages AND thinking
  const isAwakening = !hasAwakened && !hasAssistantMessage && status === 'thinking';

  // Latch: once we exit awakening, never go back
  useEffect(() => {
    if (!isAwakening && !hasAwakened) {
      // Check if we should latch (we had the opportunity to awaken but conditions changed)
      if (hasAssistantMessage || (status !== 'thinking' && status !== 'initializing')) {
        setHasAwakened(true);
      }
    }
  }, [isAwakening, hasAwakened, hasAssistantMessage, status]);

  useEffect(() => {
    if (!currentUser?.preferences) {
      setHandsFreeEnabled(false);
      setTtsEnabled(false);
      return;
    }
    try {
      const parsed = JSON.parse(currentUser.preferences);
      setHandsFreeEnabled(Boolean(parsed?.voice_hands_free));
      setTtsEnabled(Boolean(parsed?.tts_enabled));
    } catch {
      setHandsFreeEnabled(false);
      setTtsEnabled(false);
    }
  }, [currentUser?.preferences, setHandsFreeEnabled, setTtsEnabled]);

  useEffect(() => {
    if (voiceEnabledRef.current === null) {
      voiceEnabledRef.current = voiceChat.isEnabled;
      return;
    }
    if (voiceEnabledRef.current !== voiceChat.isEnabled) {
      clearVoiceDebugEvents();
      voiceEnabledRef.current = voiceChat.isEnabled;
    }
  }, [voiceChat.isEnabled, clearVoiceDebugEvents]);

  useEffect(() => {
    if (!handsFreeEnabled) {
      if (voiceChat.isEnabled) {
        voiceChat.disableVoice();
      }
      return;
    }

    if (!voiceChat.isSupported) return;

    if (!voiceChat.isEnabled) {
      setVoicePermissionWarning(null);
      void voiceChat.enableVoice();
    }
  }, [handsFreeEnabled, voiceChat.isEnabled, voiceChat.isSupported, voiceChat.enableVoice, voiceChat.disableVoice]);

  useEffect(() => {
    if (!handsFreeEnabled || !voiceChat.isEnabled) return;

    if (status === 'speaking') {
      if (voiceChat.voiceState !== 'SPEAKING') {
        voiceChat.setSpeaking();
      }
      return;
    }

    if (status === 'thinking' || status === 'processing') {
      if (voiceChat.voiceState !== 'PROCESSING') {
        voiceChat.setProcessing();
      }
      return;
    }

    if (status === 'ready' || status === 'initializing') {
      if (voiceChat.voiceState !== 'ACTIVE') {
        voiceChat.activate();
      }
    }
  }, [
    handsFreeEnabled,
    voiceChat.isEnabled,
    voiceChat.voiceState,
    voiceChat.activate,
    voiceChat.setSpeaking,
    voiceChat.setProcessing,
    status,
  ]);

  useEffect(() => {
    if (!handsFreeEnabled) {
      setVoicePermissionWarning(null);
    }
  }, [handsFreeEnabled]);

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden relative">
      {/* Full-screen Avatar Background */}
      <AvatarPanel />

      {/* Awakening overlay - shows during first message */}
      {isAwakening && <AwakeningOverlay />}

      {/* Header Overlay - always visible */}
      <Header
        onMenuClick={() => setDrawerOpen(true)}
        onDebugClick={() => setDebugOpen(!debugOpen)}
        onMemoryClick={() => setMemoryOpen(!memoryOpen)}
        debugOpen={debugOpen}
        memoryOpen={memoryOpen}
        handsFreeEnabled={handsFreeEnabled}
        voiceState={voiceChat.voiceState}
        voicePermissionWarning={voicePermissionWarning}
      />

      {/* Chat History Overlay - hidden during awakening */}
      {!isAwakening && <ChatPanel />}

      {/* Floating Input Bar - hidden during awakening */}
      {!isAwakening && <InputControls />}

      {/* Side Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenUserSettings={() => setUserSettingsOpen(true)}
      />

      {/* Debug Panel */}
      <DebugPanel
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        handsFreeEnabled={handsFreeEnabled}
        voiceState={voiceChat.voiceState}
        voiceTranscript={voiceTranscript}
        voiceDebugEvents={voiceDebugEvents}
        onClearVoiceDebug={clearVoiceDebugEvents}
      />

      {/* Memory Modal */}
      <MemoryModal open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* User Settings Modal */}
      <UserSettingsModal open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />
    </div>
  );
}

export default App;
