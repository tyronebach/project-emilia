import { useCallback, useRef, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useRoomStore } from '../store/roomStore';
import { useAppStore } from '../store';
import { getRoomHistory, streamRoomChat, type RoomMessage } from '../utils/api';

export function useRoomChat(roomId: string) {
  const currentUserId = useUserStore((state) => state.currentUser?.id);
  const currentUserName = useUserStore((state) => state.currentUser?.display_name);
  const addMessage = useRoomStore((state) => state.addMessage);
  const setMessages = useRoomStore((state) => state.setMessages);
  const appendStreamingContent = useRoomStore((state) => state.appendStreamingContent);
  const clearStreamingContent = useRoomStore((state) => state.clearStreamingContent);
  const resetStreaming = useRoomStore((state) => state.resetStreaming);
  const focusedAgentId = useRoomStore((state) => state.focusedAgentId);
  const setAgentAvatarCommand = useRoomStore((state) => state.setAgentAvatarCommand);
  const applyAvatarCommand = useAppStore((state) => state.applyAvatarCommand);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async (): Promise<RoomMessage[]> => {
    if (!roomId) return [];

    try {
      const messages = await getRoomHistory(roomId, 200);
      setMessages(messages);
      return messages;
    } catch (error) {
      console.error('Failed to load room history:', error);
      setMessages([]);
      return [];
    }
  }, [roomId, setMessages]);

  const sendMessage = useCallback(async (message: string, mentionAgents?: string[]) => {
    if (!roomId || !currentUserId || !currentUserName) return;
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const optimisticUserMessage: RoomMessage = {
      id: `local-user-${Date.now()}`,
      room_id: roomId,
      sender_type: 'user',
      sender_id: currentUserId,
      sender_name: currentUserName,
      content: trimmed,
      timestamp: Date.now() / 1000,
      origin: 'chat',
      behavior: {
        mood_intensity: 1,
      },
    };

    addMessage(optimisticUserMessage);

    await streamRoomChat(
      roomId,
      {
        message: trimmed,
        mention_agents: mentionAgents && mentionAgents.length > 0 ? mentionAgents : undefined,
      },
      (event) => {
        if (event.type === 'agent_start') {
          clearStreamingContent(event.agent_id);
          return;
        }

        if (event.type === 'content') {
          appendStreamingContent(event.agent_id, event.content);
          return;
        }

        if (event.type === 'agent_done') {
          clearStreamingContent(event.agent_id);
          addMessage(event.message);
          return;
        }

        if (event.type === 'avatar') {
          const command = {
            intent: event.intent,
            mood: event.mood,
            intensity: event.intensity,
            energy: event.energy,
            move: event.move,
            game_action: event.game_action,
          };
          setAgentAvatarCommand(event.agent_id, command);

          if (focusedAgentId && focusedAgentId === event.agent_id) {
            applyAvatarCommand(command);
          }
          return;
        }

        if (event.type === 'emotion') {
          return;
        }

        if (event.type === 'agent_error') {
          clearStreamingContent(event.agent_id);
          addMessage({
            id: `local-error-${Date.now()}-${event.agent_id}`,
            room_id: roomId,
            sender_type: 'agent',
            sender_id: event.agent_id,
            sender_name: event.agent_name,
            content: `⚠️ ${event.error}`,
            timestamp: Date.now() / 1000,
            origin: 'system',
            behavior: {
              mood_intensity: 1,
            },
          });
          return;
        }

        if (event.type === 'done') {
          resetStreaming();
        }
      },
      (error) => {
        console.error('streamRoomChat error:', error);
        resetStreaming();
        addMessage({
          id: `local-error-${Date.now()}`,
          room_id: roomId,
          sender_type: 'agent',
          sender_id: 'system',
          sender_name: 'System',
          content: `⚠️ ${error.message}`,
          timestamp: Date.now() / 1000,
          origin: 'system',
          behavior: {
            mood_intensity: 1,
          },
        });
      },
      { signal: abortController.signal },
    );

    setIsLoading(false);
    abortControllerRef.current = null;
  }, [
    roomId,
    currentUserId,
    currentUserName,
    addMessage,
    appendStreamingContent,
    clearStreamingContent,
    focusedAgentId,
    setAgentAvatarCommand,
    isLoading,
    resetStreaming,
    applyAvatarCommand,
  ]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    isLoading,
    loadHistory,
    sendMessage,
    abort,
  };
}

export default useRoomChat;
