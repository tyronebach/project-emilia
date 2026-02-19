import { useCallback, useRef, useEffect } from 'react';
import { fetchWithAuth, streamChat, streamRoomChat, getRoomHistory, stripAvatarTags, stripAvatarTagsStreaming } from '../utils/api';
import type { StreamResponse, CompactionInfo, EmotionDebug } from '../utils/api';
import { base64ToAudioBlob } from '../utils/helpers';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import type { AvatarRenderer } from '../avatar/AvatarRenderer';
import { avatarRegistry } from '../avatar/AvatarRendererRegistry';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { useGame } from './useGame';
import { roomMessageToChatMessage } from '../types/chat';

const LIP_SYNC_WAIT_MS = 4000;
const LIP_SYNC_POLL_MS = 50;

async function waitForLipSyncRenderer(timeoutMs: number = LIP_SYNC_WAIT_MS): Promise<AvatarRenderer | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const renderer = useAppStore.getState().avatarRenderer;
    if (renderer?.lipSyncEngine) return renderer;
    await new Promise(resolve => setTimeout(resolve, LIP_SYNC_POLL_MS));
  }

  return null;
}

/**
 * Unified chat hook — handles both DM (single-agent) and room (multi-agent) modes.
 *
 * @param mode  'dm' for DM/single-agent SSE, 'room' for multi-agent SSE.
 *              Auto-detects from `chatStore.agents.length` if not specified.
 */
export function useChat(mode?: 'dm' | 'room') {
  const agents = useChatStore((s) => s.agents);
  const effectiveMode = mode ?? (agents.length > 1 ? 'room' : 'dm');

  const setStatus = useAppStore((s) => s.setStatus);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const applyAvatarCommand = useAppStore((s) => s.applyAvatarCommand);

  const addMessage = useChatStore((s) => s.addMessage);
  const setMessages = useChatStore((s) => s.setMessages);
  const addAgentPlaceholder = useChatStore((s) => s.addAgentPlaceholder);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const updateMessageMeta = useChatStore((s) => s.updateMessageMeta);
  const appendStreamingContent = useChatStore((s) => s.appendStreamingContent);
  const clearStreamingContent = useChatStore((s) => s.clearStreamingContent);
  const resetStreaming = useChatStore((s) => s.resetStreaming);
  const setAgentAvatarCommand = useChatStore((s) => s.setAgentAvatarCommand);
  const setAgentEmotion = useChatStore((s) => s.setAgentEmotion);
  const setAgentStatus = useChatStore((s) => s.setAgentStatus);
  const clearAgentStatus = useChatStore((s) => s.clearAgentStatus);
  const resetAgentStatuses = useChatStore((s) => s.resetAgentStatuses);

  const { getGameContext, handleAvatarResponse } = useGame();
  const { updateStats, addStateEntry } = useStatsStore();
  const currentAgent = useUserStore((state) => state.currentAgent);
  const currentUserId = useUserStore((state) => state.currentUser?.id);
  const currentUserName = useUserStore((state) => state.currentUser?.display_name);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Log state changes
  const status = useAppStore((s) => s.status);
  useEffect(() => {
    addStateEntry(status, '');
  }, [status, addStateEntry]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  /**
   * Speak text using TTS — returns audio_base64 for storage in message meta.
   * @param voiceId  Optional per-agent voice override. Falls back to global ttsVoiceId.
   * @param agentId  Optional agent ID for routing lip-sync to the correct renderer.
   */
  const speakText = useCallback(async (text: string, voiceId?: string | null, agentId?: string): Promise<string | null> => {
    if (!text?.trim()) return null;

    try {
      cleanupAudio();
      setStatus('speaking');

      const effectiveVoice = (voiceId ?? ttsVoiceId)?.trim() || undefined;
      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice_id: effectiveVoice,
        })
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
      const result = await response.json();
      if (!result.audio_base64) throw new Error('No audio data');

      const blob = base64ToAudioBlob(result.audio_base64);
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      let activeLipSync: { stop: () => void } | null = null;
      let playbackFinished = false;

      await new Promise<void>((resolve) => {
        if (audio.duration && !isNaN(audio.duration)) {
          resolve();
        } else {
          audio.onloadedmetadata = () => resolve();
        }
      });

      const audioDurationMs = audio.duration * 1000;

      const startLipSync = async (): Promise<void> => {
        if (!result.alignment || playbackFinished) return;

        const tryStart = (renderer: AvatarRenderer | null): boolean => {
          if (!renderer?.lipSyncEngine || playbackFinished) return false;
          renderer.lipSyncEngine.setAlignment(result.alignment, audioDurationMs);
          renderer.lipSyncEngine.startSync(audio);
          activeLipSync = renderer.lipSyncEngine;
          return true;
        };

        // Per-agent renderer from registry (room mode)
        if (agentId) {
          const agentRenderer = avatarRegistry.get(agentId);
          if (tryStart(agentRenderer)) return;
        }

        // Fallback: global renderer (DM mode or registry miss)
        const immediate = useAppStore.getState().avatarRenderer;
        if (tryStart(immediate)) return;

        const waited = await waitForLipSyncRenderer();
        tryStart(waited);
      };

      void startLipSync();

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          playbackFinished = true;
          activeLipSync?.stop();
          cleanupAudio();
          resolve();
        };
        audio.onerror = () => {
          playbackFinished = true;
          activeLipSync?.stop();
          cleanupAudio();
          resolve();
        };
        audio.play().catch(() => {
          playbackFinished = true;
          activeLipSync?.stop();
          cleanupAudio();
          resolve();
        });
      });

      return result.audio_base64;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    } finally {
      setStatus('ready');
    }
  }, [setStatus, cleanupAudio, ttsVoiceId]);

  // ──────────────────────────────────────────
  // DM path: single-agent, legacy SSE facade
  // ──────────────────────────────────────────
  const sendDmMessage = useCallback(async (
    message: string,
    options?: { runtimeTrigger?: boolean },
  ): Promise<void> => {
    const currentStatus = useAppStore.getState().status;
    const busy = currentStatus === 'thinking' || currentStatus === 'speaking';
    if (busy || !currentAgent) return;

    setStatus('thinking');
    useChatStore.getState().setLastEmotionDebug(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const roomId = useAppStore.getState().roomId ?? '';
      const messageId = addAgentPlaceholder(currentAgent.id, currentAgent.display_name, roomId);
      let fullContent = '';
      let finalResponse: StreamResponse = {};
      let didAbort = false;
      let didHandleAvatarMove = false;
      const gameContext = getGameContext();
      let chunkCount = 0;

      addStateEntry('sse', 'SSE stream started');

      await streamChat(
        message,
        (chunk) => {
          chunkCount++;
          fullContent += chunk;
          updateMessage(messageId, { content: stripAvatarTagsStreaming(fullContent) });
          if (chunkCount === 1) {
            addStateEntry('sse', `First chunk received (${chunk.length} chars)`);
          }
        },
        (avatarData) => {
          addStateEntry('sse', `Avatar event: mood=${avatarData.mood}, move=${avatarData.move}`);
          applyAvatarCommand(avatarData);
          didHandleAvatarMove = true;
          handleAvatarResponse(avatarData.move);
        },
        (data) => {
          addStateEntry('sse', `Done event: ${chunkCount} chunks, ${data.processing_ms}ms`);
          const cleanedResponse = stripAvatarTags(data.response || fullContent);
          finalResponse = { ...data, response: cleanedResponse };
          updateMessage(messageId, {
            content: cleanedResponse,
            processing_ms: data.processing_ms,
            model: data.model,
            behavior: data.behavior,
            meta: { streaming: false },
          });
          updateStats({ processing_ms: data.processing_ms });
          if (!didHandleAvatarMove) {
            handleAvatarResponse(undefined);
          }
        },
        (error) => {
          addStateEntry('sse', `Error: ${error.name} - ${error.message}`);
          if (error.name === 'AbortError') {
            didAbort = true;
            updateMessageMeta(messageId, { streaming: false });
            setStatus('ready');
            return;
          }
          console.error('Chat error:', error);
          updateMessage(messageId, {
            content: `⚠️ Error: ${error.message}`,
            meta: { error: true, streaming: false },
          });
          setStatus('error');
          setTimeout(() => setStatus('ready'), 3000);
        },
        {
          signal: abortController.signal,
          roomId: useAppStore.getState().roomId || undefined,
          gameContext: gameContext ?? undefined,
          runtimeTrigger: options?.runtimeTrigger ?? false,
          onCompaction: (c: CompactionInfo) => {
            if (c.compacted) {
              addStateEntry('compact', `Compacted: ${c.messages_deleted} msgs deleted, kept ${c.messages_kept}, summary ${c.summary_chars} chars`);
            } else if (c.error) {
              addStateEntry('compact', `Compaction failed: ${c.error}`);
            }
          },
          onEmotion: (data: EmotionDebug) => {
            const store = useChatStore.getState();
            store.setLastEmotionDebug(data);
            if (data.snapshot) {
              store.setCurrentMood(data.snapshot);
            }
          },
        }
      );
      addStateEntry('sse', 'SSE stream ended');

      if (didAbort) return;

      // TTS if enabled
      if (ttsEnabled && finalResponse?.response) {
        const ttsTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
        const audio_base64 = await Promise.race([speakText(finalResponse.response), ttsTimeout]);
        if (audio_base64) {
          const { messages } = useChatStore.getState();
          for (const msg of messages) {
            if (msg.id !== messageId && msg.meta?.audio_base64) {
              updateMessageMeta(msg.id, { audio_base64: undefined });
            }
          }
          updateMessageMeta(messageId, { audio_base64, streaming: false });
        }
        setStatus('ready');
      } else {
        setStatus('ready');
      }
    } catch (error) {
      console.error('sendMessage error:', error);
      setStatus('error');
      setTimeout(() => setStatus('ready'), 3000);
    } finally {
      abortControllerRef.current = null;
      const currentStatus = useAppStore.getState().status;
      if (currentStatus === 'thinking' || currentStatus === 'speaking') {
        setStatus('ready');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- addStateEntry is stable
  }, [currentAgent, setStatus, addAgentPlaceholder, updateMessage, updateMessageMeta, applyAvatarCommand, handleAvatarResponse, getGameContext, ttsEnabled, speakText, updateStats]);

  // ──────────────────────────────────────────
  // Room path: multi-agent SSE
  // ──────────────────────────────────────────
  const sendRoomMessage = useCallback(async (
    message: string,
    mentionAgents?: string[],
  ): Promise<void> => {
    const roomId = useAppStore.getState().roomId;
    if (!roomId || !currentUserId || !currentUserName) return;
    const trimmed = message.trim();
    if (!trimmed) return;

    // Check loading
    const currentStatus = useAppStore.getState().status;
    if (currentStatus === 'thinking' || currentStatus === 'speaking') return;

    setStatus('thinking');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // NOTE: User message is already added by the caller (InputControls / voice handler)
    // via addUserMessage() — do NOT add it again here.

    // Collect agent responses for sequential TTS after streaming
    const ttsQueue: Array<{ agentId: string; text: string; messageId: string }> = [];
    const gameContext = getGameContext();

    await streamRoomChat(
      roomId,
      {
        message: trimmed,
        mention_agents: mentionAgents && mentionAgents.length > 0 ? mentionAgents : undefined,
        game_context: gameContext ?? undefined,
      },
      (event) => {
        if (event.type === 'agent_start') {
          clearStreamingContent(event.agent_id);
          setAgentStatus(event.agent_id, 'thinking');
          return;
        }

        if (event.type === 'content') {
          appendStreamingContent(event.agent_id, stripAvatarTagsStreaming(event.content));
          setAgentStatus(event.agent_id, 'streaming');
          return;
        }

        if (event.type === 'agent_done') {
          clearStreamingContent(event.agent_id);
          clearAgentStatus(event.agent_id);
          const chatMsg = roomMessageToChatMessage(event.message);
          addMessage(chatMsg);

          // Enqueue TTS if enabled
          if (ttsEnabled && chatMsg.content.trim()) {
            ttsQueue.push({
              agentId: event.agent_id,
              text: chatMsg.content,
              messageId: chatMsg.id,
            });
          }
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
          // Store updates avatarCommandByAgent; each RoomAvatarTile picks up
          // its own command reactively — no focusedAgentId guard needed.
          setAgentAvatarCommand(event.agent_id, command);
          // Route game move to game engine (same as DM path)
          handleAvatarResponse(event.move);
          return;
        }

        if (event.type === 'emotion') {
          if (event.snapshot) {
            setAgentEmotion(event.agent_id, event.snapshot);
          }
          return;
        }

        if (event.type === 'agent_error') {
          clearStreamingContent(event.agent_id);
          clearAgentStatus(event.agent_id);
          addMessage({
            id: `local-error-${Date.now()}-${event.agent_id}`,
            room_id: roomId,
            sender_type: 'system',
            sender_id: 'system',
            sender_name: event.agent_name,
            content: `⚠️ ${event.error}`,
            timestamp: Date.now() / 1000,
            origin: 'system',
            meta: { error: true, failedAgentId: event.agent_id },
          });
          return;
        }

        if (event.type === 'done') {
          resetStreaming();
          resetAgentStatuses();
        }
      },
      (error) => {
        console.error('streamRoomChat error:', error);
        resetStreaming();
        resetAgentStatuses();
        addMessage({
          id: `local-error-${Date.now()}`,
          room_id: roomId,
          sender_type: 'system',
          sender_id: 'system',
          sender_name: 'System',
          content: `⚠️ ${error.message}`,
          timestamp: Date.now() / 1000,
          origin: 'system',
          meta: { error: true },
        });
      },
      { signal: abortController.signal },
    );

    // Drain TTS queue sequentially — each agent speaks in order
    if (ttsQueue.length > 0) {
      const storeAgents = useChatStore.getState().agents;
      for (const { agentId, text, messageId } of ttsQueue) {
        if (abortControllerRef.current?.signal.aborted) break;

        const agent = storeAgents.find(a => a.agent_id === agentId);
        setAgentStatus(agentId, 'speaking');

        const ttsTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
        const audio_base64 = await Promise.race([
          speakText(text, agent?.voice_id, agentId),
          ttsTimeout,
        ]);

        if (audio_base64) {
          updateMessageMeta(messageId, { audio_base64 });
        }
        clearAgentStatus(agentId);
      }
    }

    setStatus('ready');
    abortControllerRef.current = null;
  }, [
    currentUserId,
    currentUserName,
    setStatus,
    addMessage,
    appendStreamingContent,
    clearStreamingContent,
    setAgentAvatarCommand,
    setAgentEmotion,
    setAgentStatus,
    clearAgentStatus,
    resetAgentStatuses,
    resetStreaming,
    speakText,
    ttsEnabled,
    updateMessageMeta,
    getGameContext,
    handleAvatarResponse,
  ]);

  // ──────────────────────────────────────────
  // Unified sendMessage
  // ──────────────────────────────────────────
  const sendMessage = useCallback(async (
    message: string,
    options?: { mentionAgents?: string[]; runtimeTrigger?: boolean },
  ): Promise<void> => {
    if (effectiveMode === 'room') {
      return sendRoomMessage(message, options?.mentionAgents);
    }
    return sendDmMessage(message, options);
  }, [effectiveMode, sendDmMessage, sendRoomMessage]);

  /**
   * Load history for current room (room mode).
   * DM mode uses useSession for history loading — this is a no-op.
   */
  const loadHistory = useCallback(async () => {
    const roomId = useAppStore.getState().roomId;
    if (!roomId) return [];

    try {
      const roomMessages = await getRoomHistory(roomId, 200);
      const messages = roomMessages.map(roomMessageToChatMessage);
      setMessages(messages);
      return messages;
    } catch (error) {
      console.error('Failed to load room history:', error);
      setMessages([]);
      return [];
    }
  }, [setMessages]);

  // Reactive isLoading for consumers
  const isLoading = useAppStore((s) => s.status === 'thinking' || s.status === 'speaking');

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, isLoading, abort, loadHistory };
}

export default useChat;
