import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from './store';
import { useUserStore } from './store/userStore';
import { useChatStore } from './store/chatStore';
import { useRenderStore } from './store/renderStore';
import { fetchWithAuth } from './utils/api';
import { useVoiceChat } from './hooks/useVoiceChat';
import { useChat } from './hooks/useChat';
import { useLogout } from './hooks/useLogout';
import type { VoiceDebugEntry } from './components/VoiceDebugTimeline';
import Header from './components/Header';
import Drawer from './components/Drawer';
import AvatarPanel from './components/AvatarPanel';
import { AvatarStage } from './components/chat';
import ChatPanel from './components/ChatPanel';
import InputControls from './components/InputControls';
import DebugPanel from './components/DebugPanel';
import MemoryModal from './components/MemoryModal';
import UserSettingsModal from './components/UserSettingsModal';
import BondModal from './components/BondModal';
import AboutModal from './components/AboutModal';
import AwakeningOverlay from './components/AwakeningOverlay';
import GamePanel from './components/GamePanel';
import ParticipantsDrawer from './components/ParticipantsDrawer';
import { STATUS_COLORS } from './types';
import type { AppStatus } from './types';
import { isGamesV2EnabledForAgent } from './config/features';

interface AppProps {
  userId: string;
  roomId: string;
}

/**
 * Main App Layout - Only for existing chat rooms
 *
 * Structure:
 * - Full-screen avatar background
 * - Header overlay at top (with drawer toggle + debug/memory buttons)
 * - Chat history overlay on bottom half (semi-transparent)
 * - Floating input bar at bottom
 * - Side drawer for rooms/settings
 * - Debug panel (right side modal)
 * - Memory modal (top half modal)
 */
function App({ userId, roomId }: AppProps) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [bondOpen, setBondOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const hasValidatedRef = useRef(false);

  const setRoomId = useAppStore((state) => state.setRoomId);
  const currentUser = useUserStore((state) => state.currentUser);
  const logout = useLogout();

  // Sync render settings with current user on mount (handles page refresh with persisted user)
  useEffect(() => {
    if (currentUser?.id) {
      useRenderStore.getState().setCurrentUser(currentUser.id);
    }
  }, [currentUser?.id]);

  // Sync roomId from route to store
  useEffect(() => {
    const currentStoreRoomId = useAppStore.getState().roomId;
    // Only clear messages if roomId actually changed (not on initial mount with same ID)
    if (currentStoreRoomId && currentStoreRoomId !== roomId) {
      useChatStore.getState().clearMessages();
    }
    setRoomId(roomId);
  }, [roomId, setRoomId]);

  // Reset validation flag when roomId changes
  useEffect(() => {
    hasValidatedRef.current = false;
  }, [roomId]);

  // Validate roomId exists - redirect to /chat/new if not found
  // Also populates agents for multi-agent support
  useEffect(() => {
    if (!currentUser || hasValidatedRef.current || !roomId) return;

    hasValidatedRef.current = true;

    console.log('[App] Validating room:', roomId);

    const validateRoom = async () => {
      try {
        const response = await fetchWithAuth(`/api/rooms/${encodeURIComponent(roomId)}`);
        if (response.status === 404 || response.status === 403) {
          console.log('[App] Room not found, redirecting to /chat/new');
          navigate({
            to: '/user/$userId/chat/new',
            params: { userId: currentUser.id },
            replace: true
          });
          return;
        }
        if (!response.ok) {
          console.warn('[App] Room validation failed:', response.status);
          return;
        }

        // Extract room data and populate agents (multi-agent support)
        const room = await response.json();
        if (room.agents && Array.isArray(room.agents)) {
          console.log('[App] Room has %d agents', room.agents.length);
          useChatStore.getState().setAgents(room.agents);
        }
      } catch (error) {
        console.warn('[App] Room validation error:', error);
      }
    };

    validateRoom();
  }, [roomId, currentUser, navigate]);

  // Verify user matches route
  useEffect(() => {
    if (currentUser && currentUser.id !== userId) {
      logout();
    }
  }, [userId, currentUser, logout]);

  return (
    <AppContent
      drawerOpen={drawerOpen}
      setDrawerOpen={setDrawerOpen}
      debugOpen={debugOpen}
      setDebugOpen={setDebugOpen}
      memoryOpen={memoryOpen}
      setMemoryOpen={setMemoryOpen}
      bondOpen={bondOpen}
      setBondOpen={setBondOpen}
      aboutOpen={aboutOpen}
      setAboutOpen={setAboutOpen}
      userSettingsOpen={userSettingsOpen}
      setUserSettingsOpen={setUserSettingsOpen}
      participantsOpen={participantsOpen}
      setParticipantsOpen={setParticipantsOpen}
    />
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
  bondOpen,
  setBondOpen,
  aboutOpen,
  setAboutOpen,
  userSettingsOpen,
  setUserSettingsOpen,
  participantsOpen,
  setParticipantsOpen,
}: {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  debugOpen: boolean;
  setDebugOpen: (open: boolean) => void;
  memoryOpen: boolean;
  setMemoryOpen: (open: boolean) => void;
  bondOpen: boolean;
  setBondOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  userSettingsOpen: boolean;
  setUserSettingsOpen: (open: boolean) => void;
  participantsOpen: boolean;
  setParticipantsOpen: (open: boolean) => void;
}) {
  const messages = useChatStore((s) => s.messages);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const currentMood = useChatStore((s) => s.currentMood);
  const agents = useChatStore((s) => s.agents);
  const status = useAppStore((s) => s.status);
  const roomId = useAppStore((s) => s.roomId);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const setTtsEnabled = useAppStore((s) => s.setTtsEnabled);
  const addError = useAppStore((s) => s.addError);
  const { sendMessage } = useChat();
  const handsFreeEnabled = useAppStore((s) => s.handsFreeEnabled);
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgentId = useUserStore((state) => state.currentAgent?.id ?? null);
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
      addUserMessage(currentUser?.id ?? '', currentUser?.display_name ?? '', text, roomId ?? '', { source: 'voice' });
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
  const hasAssistantMessage = messages.some(m => m.sender_type === 'agent' && m.content.trim() !== '');

  // Awakening mode: no assistant messages AND thinking
  const isAwakening = !hasAwakened && !hasAssistantMessage && status === 'thinking';
  const immersiveMode = handsFreeEnabled && ttsEnabled;
  const gamesEnabledForAgent = isGamesV2EnabledForAgent(currentAgentId);

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
      setTtsEnabled(false);
      return;
    }
    try {
      const parsed = JSON.parse(currentUser.preferences);
      setTtsEnabled(Boolean(parsed?.tts_enabled));
    } catch {
      setTtsEnabled(false);
    }
  }, [currentUser?.preferences, setTtsEnabled]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omitting voiceChat object
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omitting voiceChat object
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

  // Multi-agent: use AvatarStage for adaptive layouts
  const isMultiAgent = agents.length > 1;

  return (
    <div className="min-h-[100svh] w-full bg-bg-primary text-text-primary overflow-hidden relative flex flex-col">
      {/* Full-screen Avatar Background - use AvatarStage for multi-agent */}
      {isMultiAgent && currentUser?.id && roomId ? (
        <AvatarStage
          userId={currentUser.id}
          roomId={roomId}
        />
      ) : (
        <AvatarPanel />
      )}

      {/* Awakening overlay - shows during first message */}
      {isAwakening && <AwakeningOverlay />}

      {/* Header Overlay - always visible */}
      <Header
        onMenuClick={() => setDrawerOpen(true)}
        onDebugClick={() => setDebugOpen(!debugOpen)}
        onMemoryClick={() => setMemoryOpen(!memoryOpen)}
        onBondClick={() => setBondOpen(!bondOpen)}
        onAboutClick={() => setAboutOpen(!aboutOpen)}
        onParticipantsClick={() => setParticipantsOpen(!participantsOpen)}
        debugOpen={debugOpen}
        memoryOpen={memoryOpen}
        bondOpen={bondOpen}
        aboutOpen={aboutOpen}
        participantsOpen={participantsOpen}
        currentMood={currentMood}
        handsFreeEnabled={handsFreeEnabled}
        voicePermissionWarning={voicePermissionWarning}
      />

      {/* Status pill - left side */}
      <StatusPill status={status} immersive={immersiveMode} />

      {/* Game Panel — single-agent only; games are not supported in group rooms */}
      {!isAwakening && !isMultiAgent && gamesEnabledForAgent && <GamePanel />}

      {/* Chat History Overlay - hidden during awakening */}
      {!isAwakening && <ChatPanel />}

      {/* Floating Input Bar - hidden during awakening */}
      {!isAwakening && <InputControls voiceState={voiceChat.voiceState} />}

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

      {/* Bond Modal */}
      <BondModal open={bondOpen} onClose={() => setBondOpen(false)} />

      {/* About Modal */}
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* User Settings Modal */}
      <UserSettingsModal open={userSettingsOpen} onClose={() => setUserSettingsOpen(false)} />

      {/* Participants Drawer (right side) */}
      <ParticipantsDrawer
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
      />
    </div>
  );
}

function StatusPill({ status, immersive }: { status: AppStatus; immersive: boolean }) {
  const getStatusText = () => {
    if (status === 'processing') return 'Transcribing...';
    if (status === 'thinking') return 'Thinking...';
    if (status === 'speaking') return 'Speaking...';
    return null;
  };

  const statusText = getStatusText();
  if (!statusText) return null;

  const panelHeight = immersive ? 0 : 26;

  return (
    <div
      className="fixed left-4 z-20"
      style={{ bottom: `calc(${panelHeight}svh + 9rem + 0.5rem + env(safe-area-inset-bottom))` }}
    >
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bg-secondary/35 border border-white/5 backdrop-blur-sm text-text-secondary text-sm">
        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
        <span>{statusText}</span>
      </div>
    </div>
  );
}

export default App;
