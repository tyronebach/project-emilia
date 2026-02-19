import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { getRooms, getRoom, getRoomHistory, deleteRoom as deleteRoomApi, updateRoom as updateRoomApi } from '../utils/api';
import type { Room, RoomMessage } from '../utils/api';
import type { Message, MessageOrigin } from '../types';

export function useSession() {
  const roomId = useAppStore((state) => state.roomId);
  const setRoomId = useAppStore((state) => state.setRoomId);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const setMessages = useChatStore((state) => state.setMessages);

  const currentUser = useUserStore((state) => state.currentUser);
  const currentAgent = useUserStore((state) => state.currentAgent);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef<string | null>(null);
  const fetchHistoryIdRef = useRef(0);

  /**
   * Fetch rooms for current user
   */
  const fetchRooms = useCallback(async (): Promise<Room[]> => {
    if (!currentUser?.id) return [];

    try {
      setIsLoading(true);
      // Filter server-side by agent if one is selected
      const data = await getRooms(currentAgent?.id);
      setRooms(data);
      return data;
    } catch (error) {
      console.error('fetchRooms error:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, currentAgent?.id]);

  /**
   * Fetch history for a room
   */
  const fetchHistory = useCallback(async (rid: string): Promise<Message[]> => {
    if (!rid || !currentUser?.id) return [];

    // Guard against duplicate fetches for same room
    if (fetchingRef.current === rid) return [];

    const requestId = ++fetchHistoryIdRef.current;
    try {
      fetchingRef.current = rid;
      setIsLoading(true);

      // Validate room exists
      try {
        await getRoom(rid);
      } catch {
        console.warn('[useSession] Room not found:', rid);
        setMessages([]);
        return [];
      }

      const roomMessages = await getRoomHistory(rid);

      // Only apply if this is the latest request
      if (requestId !== fetchHistoryIdRef.current) {
        return [];
      }

      const messages: Message[] = roomMessages.map((msg: RoomMessage) => ({
        id: msg.id,
        role: msg.sender_type === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
        timestamp: new Date(msg.timestamp * 1000),
        meta: {
          origin: (msg.origin ?? (msg.sender_type === 'user' ? 'user' : 'assistant')) as MessageOrigin,
          agent_id: msg.sender_type === 'agent' ? msg.sender_id : undefined,
          processing_ms: msg.processing_ms ?? undefined,
        },
      }));

      // Don't overwrite if chatStore already has MORE messages than backend
      // (e.g. streaming added new messages since fetch started) — but only
      // if we're still on the same room.
      const currentStoreRoomId = useAppStore.getState().roomId;
      if (currentStoreRoomId === rid) {
        const currentMessages = useChatStore.getState().messages;
        if (currentMessages.length > messages.length) {
          return currentMessages;
        }
      }

      setMessages(messages);
      return messages;
    } catch (error) {
      console.error('fetchHistory error:', error);
      return [];
    } finally {
      if (requestId === fetchHistoryIdRef.current) {
        setIsLoading(false);
        fetchingRef.current = null;
      }
    }
  }, [setMessages, currentUser?.id]);

  /**
   * Switch to a different room
   */
  const switchRoom = useCallback(async (newRoomId: string): Promise<void> => {
    if (newRoomId === roomId) return;

    clearMessages();
    setRoomId(newRoomId);
    await fetchHistory(newRoomId);

    console.log('Switched to room:', newRoomId);
  }, [roomId, setRoomId, clearMessages, fetchHistory]);

  /**
   * Delete a room
   */
  const deleteRoom = useCallback(async (rid: string): Promise<boolean> => {
    try {
      await deleteRoomApi(rid);

      if (rid === roomId) {
        clearMessages();
        setRoomId('');
      }

      await fetchRooms();
      return true;
    } catch (error) {
      console.error('deleteRoom error:', error);
      return false;
    }
  }, [roomId, setRoomId, clearMessages, fetchRooms]);

  /**
   * Rename a room
   */
  const renameRoom = useCallback(async (rid: string, name: string): Promise<void> => {
    await updateRoomApi(rid, { name });
    await fetchRooms();
  }, [fetchRooms]);

  // Load rooms when user/agent changes
  useEffect(() => {
    if (currentUser?.id) {
      fetchRooms();
    } else {
      setRooms([]);
    }
  }, [currentUser?.id, currentAgent?.id, fetchRooms]);

  // Load history when roomId or user changes
  useEffect(() => {
    if (roomId && roomId !== '' && currentUser?.id) {
      fetchHistory(roomId);
    }
  }, [roomId, currentUser?.id, fetchHistory]);

  return {
    rooms,
    roomId,
    isLoading,
    fetchRooms,
    fetchHistory,
    switchRoom,
    deleteRoom,
    renameRoom,
  };
}

export default useSession;
