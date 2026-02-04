import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { getSessions, createSession, getSession, getSessionHistory, deleteSession as deleteSessionApi } from '../utils/api';
import type { Session, Message } from '../types';

export function useSession() {
  const sessionId = useAppStore((state) => state.sessionId);
  const setSessionId = useAppStore((state) => state.setSessionId);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setMessages = useChatStore((state) => state.setMessages);

  const currentAgent = useUserStore((state) => state.currentAgent);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef<string | null>(null);
  const fetchHistoryIdRef = useRef(0);

  /**
   * Fetch sessions for current agent
   */
  const fetchSessions = useCallback(async (): Promise<Session[]> => {
    if (!currentAgent?.id) return [];

    try {
      setIsLoading(true);
      const data = await getSessions(currentAgent.id);
      setSessions(data);
      return data;
    } catch (error) {
      console.error('fetchSessions error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [currentAgent?.id]);

  /**
   * Fetch history for a session
   */
  const fetchHistory = useCallback(async (sid: string): Promise<Message[]> => {
    // Don't fetch if no session or agent not loaded yet
    if (!sid || !currentAgent?.id) return [];
    
    // Guard against duplicate fetches for same session
    if (fetchingRef.current === sid) return [];

    const requestId = ++fetchHistoryIdRef.current;
    try {
      fetchingRef.current = sid;
      setIsLoading(true);

      // Validate session belongs to current agent
      try {
        const session = await getSession(sid);
        if (session.agent_id !== currentAgent.id) {
          console.warn('[useSession] Session agent mismatch, clearing messages');
          setMessages([]);
          return [];
        }
      } catch (e) {
        console.warn('[useSession] Session not found:', sid);
        setMessages([]);
        return [];
      }

      const rawMessages = await getSessionHistory(sid);

      // Only apply if this is the latest request
      if (requestId !== fetchHistoryIdRef.current) {
        return [];
      }

      const messages: Message[] = rawMessages.map((msg, idx) => ({
        id: idx,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        meta: {},
      }));

      setMessages(messages);
      return messages;
    } catch (error) {
      console.error('fetchHistory error:', error);
      return [];
    } finally {
      // Only clear loading state for the latest request
      if (requestId === fetchHistoryIdRef.current) {
        setIsLoading(false);
        fetchingRef.current = null;
      }
    }
  }, [setMessages, currentAgent?.id]);

  /**
   * Switch to a different session
   */
  const switchSession = useCallback(async (newSessionId: string): Promise<void> => {
    if (newSessionId === sessionId) return;

    clearMessages();
    setSessionId(newSessionId);
    await fetchHistory(newSessionId);

    console.log('Switched to session:', newSessionId);
  }, [sessionId, setSessionId, clearMessages, fetchHistory]);

  /**
   * Create a new session
   */
  const newSession = useCallback(async (name?: string): Promise<string | null> => {
    if (!currentAgent?.id) {
      console.error('No agent selected');
      return null;
    }

    try {
      setIsLoading(true);
      const session = await createSession(currentAgent.id, name);

      clearMessages();
      setSessionId(session.id);

      // Refresh sessions list
      await fetchSessions();

      console.log('Created new session:', session.id);
      return session.id;
    } catch (error) {
      console.error('createSession error:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [currentAgent?.id, setSessionId, clearMessages, fetchSessions]);

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sid: string): Promise<boolean> => {
    try {
      await deleteSessionApi(sid);

      // If deleted current session, clear state
      if (sid === sessionId) {
        clearMessages();
        setSessionId('');
      }

      // Refresh sessions list
      await fetchSessions();
      return true;
    } catch (error) {
      console.error('deleteSession error:', error);
      return false;
    }
  }, [sessionId, setSessionId, clearMessages, fetchSessions]);

  // Load sessions when agent changes
  useEffect(() => {
    if (currentAgent?.id) {
      fetchSessions();
    } else {
      setSessions([]);
    }
  }, [currentAgent?.id, fetchSessions]);

  // Load history when sessionId or agent changes (but not for empty/new sessions)
  // Always fetch - don't skip based on existing messages (they may be stale from another agent)
  // Also re-fetch when currentAgent loads (handles refresh scenario where agent hydrates after sessionId)
  useEffect(() => {
    if (sessionId && sessionId !== '' && currentAgent?.id) {
      fetchHistory(sessionId);
    }
  }, [sessionId, currentAgent?.id, fetchHistory]);

  return {
    sessions,
    sessionId,
    isLoading,
    fetchSessions,
    fetchHistory,
    switchSession,
    createSession: newSession,
    deleteSession,
  };
}

export default useSession;
