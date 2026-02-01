import { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';
import type { Message, Session } from '../types';

export function useSession() {
  const { sessionId, setSessionId, setMessages, clearMessages } = useApp();
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef<string | null>(null);
  
  /**
   * Fetch list of sessions
   */
  const fetchSessions = useCallback(async (): Promise<Session[]> => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth('/api/sessions/list');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      
      const data = await response.json();
      setSessions(data.sessions || []);
      return data.sessions || [];
    } catch (error) {
      console.error('fetchSessions error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Fetch history for current session
   */
  const fetchHistory = useCallback(async (sid: string = sessionId): Promise<Message[]> => {
    // Prevent duplicate fetches
    if (fetchingRef.current === sid) {
      return [];
    }
    
    try {
      fetchingRef.current = sid;
      setIsLoading(true);
      const response = await fetchWithAuth(`/api/sessions/history/${encodeURIComponent(sid)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // New session - no history yet
          return [];
        }
        throw new Error(`Failed to fetch history: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Convert to message format
      const messages: Message[] = (data.messages || []).map((msg: { role: 'user' | 'assistant'; content: string; timestamp?: string; meta?: Message['meta'] }, idx: number) => ({
        id: idx,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        meta: msg.meta || {}
      }));
      
      setMessages(messages);
      return messages;
    } catch (error) {
      console.error('fetchHistory error:', error);
      return [];
    } finally {
      setIsLoading(false);
      fetchingRef.current = null;
    }
  }, [sessionId, setMessages]);
  
  /**
   * Switch to a different session
   */
  const switchSession = useCallback(async (newSessionId: string): Promise<void> => {
    if (newSessionId === sessionId) return;
    
    clearMessages();
    setSessionId(newSessionId);
    
    // Fetch history for new session
    await fetchHistory(newSessionId);
    
    console.log('Switched to session:', newSessionId);
  }, [sessionId, setSessionId, clearMessages, fetchHistory]);
  
  /**
   * Create a new session
   */
  const createSession = useCallback(async (name: string | null = null): Promise<string> => {
    const newSessionId = name || `session-${Date.now()}`;
    clearMessages();
    setSessionId(newSessionId);
    console.log('Created new session:', newSessionId);
    return newSessionId;
  }, [setSessionId, clearMessages]);
  
  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sid: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/api/sessions/${encodeURIComponent(sid)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.status}`);
      }
      
      // If deleted current session, create new one
      if (sid === sessionId) {
        await createSession();
      }
      
      // Refresh sessions list
      await fetchSessions();
      
      return true;
    } catch (error) {
      console.error('deleteSession error:', error);
      return false;
    }
  }, [sessionId, createSession, fetchSessions]);
  
  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Load history when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetchHistory(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  
  return {
    sessions,
    sessionId,
    isLoading,
    fetchSessions,
    fetchHistory,
    switchSession,
    createSession,
    deleteSession
  };
}

export default useSession;
