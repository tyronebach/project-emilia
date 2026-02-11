import { useEffect, useState, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store';
import { useChat } from '../hooks/useChat';
import { getSession } from '../utils/api';
import { preloadVRM } from '../avatar/preloadVRM';
import AppTopNav from './AppTopNav';

interface InitializingPageProps {
  userId: string;
  sessionId: string;
}

/**
 * Loading page while initializing a new chat session
 * Verifies session exists, sends initial greeting, then navigates to chat
 */
function InitializingPage({ userId, sessionId }: InitializingPageProps) {
  const navigate = useNavigate();
  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);
  const addMessage = useChatStore((state) => state.addMessage);
  const setSessionId = useAppStore((state) => state.setSessionId);
  const { sendMessage } = useChat();

  const [status, setStatus] = useState<'verifying' | 'initializing' | 'preloading' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Track if we've already started initialization to prevent duplicate runs
  const hasStartedRef = useRef(false);

  // Preload avatar while waiting (fire-and-forget)
  useEffect(() => {
    // Start preloading immediately in parallel with session verification
    preloadVRM('/vrm/emilia.vrm').catch((err) => {
      console.warn('[InitializingPage] Avatar preload failed (non-critical):', err);
    });
  }, []);

  useEffect(() => {
    // Prevent duplicate initialization - this is critical!
    if (hasStartedRef.current) {
      console.log('[InitializingPage] Already started, skipping');
      return;
    }
    hasStartedRef.current = true;

    const initialize = async () => {
      console.log('[InitializingPage] Starting initialization for session:', sessionId);

      try {
        // Step 1: Verify session exists (with retries using direct session lookup)
        setStatus('verifying');
        let attempts = 0;
        let sessionExists = false;

        while (attempts < 10 && !sessionExists) {
          try {
            // Use direct session lookup - more efficient than fetching all sessions
            await getSession(sessionId);
            sessionExists = true;
            console.log(`[InitializingPage] Attempt ${attempts + 1}: session exists = true`);
          } catch {
            // Session not found yet, wait and retry
            console.log(`[InitializingPage] Attempt ${attempts + 1}: session not found, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            attempts++;
          }
        }

        if (!sessionExists) {
          console.log('[InitializingPage] Session not found after retries');
          setStatus('error');
          setErrorMessage('Failed to create session');
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
        console.log('[InitializingPage] Session verified, sending greeting');

        // Set sessionId in store so useChat hook can use it
        setSessionId(sessionId);

        const greeting = `hello${currentUser?.display_name ? ` ${currentUser.display_name}` : ''}`;
        addMessage('user', greeting, { source: 'text', origin: 'user' });

        // Fire and forget - don't block navigation on response/TTS
        sendMessage(greeting);
        
        // Small delay to ensure assistant placeholder is added before navigation
        await new Promise(resolve => setTimeout(resolve, 50));

        console.log('[InitializingPage] Greeting sent, navigating to chat');

        // Navigate immediately - chat page will show streaming response
        navigate({
          to: '/user/$userId/chat/$sessionId',
          params: { userId, sessionId },
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
  }, [sessionId]); // Only re-run if sessionId changes

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
                ? 'Creating your chat session'
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
