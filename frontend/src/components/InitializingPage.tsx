import { useEffect, useState, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store';
import { useChat } from '../hooks/useChat';
import { getRoom } from '../utils/api';
import { preloadVRM } from '../avatar/preloadVRM';
import AppTopNav from './AppTopNav';

interface InitializingPageProps {
  userId: string;
  roomId: string;
}

/**
 * Loading page while initializing a new chat room
 * Verifies room exists, sends initial greeting, then navigates to chat
 */
function InitializingPage({ userId, roomId }: InitializingPageProps) {
  const navigate = useNavigate();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const addMessage = useChatStore((state) => state.addMessage);
  const setRoomId = useAppStore((state) => state.setRoomId);
  const { sendMessage } = useChat();

  const [status, setStatus] = useState<'verifying' | 'initializing' | 'preloading' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Track if we've already started initialization to prevent duplicate runs
  const hasStartedRef = useRef(false);

  // Preload avatar while waiting (fire-and-forget)
  useEffect(() => {
    preloadVRM('/vrm/emilia.vrm').catch((err) => {
      console.warn('[InitializingPage] Avatar preload failed (non-critical):', err);
    });
  }, []);

  useEffect(() => {
    if (hasStartedRef.current) {
      console.log('[InitializingPage] Already started, skipping');
      return;
    }
    hasStartedRef.current = true;

    const initialize = async () => {
      console.log('[InitializingPage] Starting initialization for room:', roomId);

      try {
        // Step 1: Verify room exists (with retries)
        setStatus('verifying');
        let attempts = 0;
        let roomExists = false;

        while (attempts < 10 && !roomExists) {
          try {
            await getRoom(roomId);
            roomExists = true;
            console.log(`[InitializingPage] Attempt ${attempts + 1}: room exists = true`);
          } catch {
            console.log(`[InitializingPage] Attempt ${attempts + 1}: room not found, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            attempts++;
          }
        }

        if (!roomExists) {
          console.log('[InitializingPage] Room not found after retries');
          setStatus('error');
          setErrorMessage('Failed to create chat');
          setTimeout(() => {
            navigate({
              to: '/user/$userId/chat/new',
              params: { userId }
            });
          }, 2000);
          return;
        }

        // Step 2: Initialize agent with greeting
        setStatus('initializing');
        console.log('[InitializingPage] Room verified, sending greeting');

        // Set roomId in store so useChat hook can use it
        setRoomId(roomId);

        const greeting = `*${currentUser?.display_name} is bringing you to life...* hi there`;
        addMessage('user', greeting, { source: 'text', origin: 'user' });

        // Fire and forget - don't block navigation on response/TTS
        sendMessage(greeting);

        // Small delay to ensure assistant placeholder is added before navigation
        await new Promise(resolve => setTimeout(resolve, 50));

        console.log('[InitializingPage] Greeting sent, navigating to chat');

        // Navigate immediately - chat page will show streaming response
        navigate({
          to: '/user/$userId/chat/$roomId',
          params: { userId, roomId },
          replace: true
        });
      } catch (error) {
        console.error('[InitializingPage] Initialization error:', error);
        setStatus('error');
        setErrorMessage('Something went wrong');
        setTimeout(() => {
          navigate({
            to: '/user/$userId/chat/new',
            params: { userId }
          });
        }, 2000);
      }
    };

    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]); // Only re-run if roomId changes

  return (
    <div className="min-h-[100svh] w-full bg-bg-primary text-text-primary flex flex-col overflow-hidden">
      <AppTopNav
        onBack={() => navigate({ to: '/user/$userId/chat/new', params: { userId } })}
        className="relative z-10"
        subtitle="Initializing"
      />

      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 max-w-md px-6">
        {status === 'error' ? (
          <>
            <div className="text-error text-6xl">⚠️</div>
            <h2 className="text-2xl font-bold text-error">Error</h2>
            <p className="text-text-secondary text-center">{errorMessage}</p>
            <p className="text-sm text-text-secondary/70">Redirecting...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <h2 className="font-display text-2xl text-center">
              {status === 'verifying' ? 'Setting up...' : 'Bringing to life...'}
            </h2>
            <p className="text-text-secondary text-center">
              {status === 'verifying'
                ? 'Creating your chat'
                : `Waking up ${currentAgent?.display_name || 'your AI companion'}`
              }
            </p>
            <p className="text-xs text-text-secondary/70 text-center">
              Preloading avatar in background...
            </p>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default InitializingPage;
