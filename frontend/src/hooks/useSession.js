import { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchWithAuth } from '../utils/api';

export function useSession() {
  const { sessionId, setSessionId, setMessages, clearMessages } = useApp();
  
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  /**
   * Fetch list of sessions
   */
  const fetchSessions = useCallback(async () => {
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
  const fetchHistory = useCallback(async (sid = sessionId) => {
    try {
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
      const messages = (data.messages || []).map((msg, idx) => ({
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
    }
  }, [sessionId, setMessages]);
  
  /**
   * Switch to a different session
   */
  const switchSession = useCallback(async (newSessionId) => {
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
  const createSession = useCallback(async (name = null) => {
    const newSessionId = name || `session-${Date.now()}`;
    clearMessages();
    setSessionId(newSessionId);
    console.log('Created new session:', newSessionId);
    return newSessionId;
  }, [setSessionId, clearMessages]);
  
  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sid) => {
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
  }, [fetchSessions]);
  
  // Load history when sessionId changes
  useEffect(() => {
    if (sessionId) {
      fetchHistory();
    }
  }, [sessionId, fetchHistory]);
  
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
