import { useCallback, useRef, useEffect } from 'react';
import { fetchWithAuth, streamChat, stripAvatarTags, stripAvatarTagsStreaming } from '../utils/api';
import type { StreamResponse, CompactionInfo, EmotionDebug } from '../utils/api';
import { base64ToAudioBlob } from '../utils/helpers';
import { useAppStore } from '../store';
import { useChatStore } from '../store/chatStore';
import type { AvatarRenderer } from '../avatar/AvatarRenderer';
import { useStatsStore } from '../store/statsStore';
import { useUserStore } from '../store/userStore';
import { useGame } from './useGame';

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

export function useChat() {
  const status = useAppStore((s) => s.status);
  const setStatus = useAppStore((s) => s.setStatus);
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);
  const ttsVoiceId = useAppStore((s) => s.ttsVoiceId);
  const applyAvatarCommand = useAppStore((s) => s.applyAvatarCommand);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const { getGameContext, handleAvatarResponse } = useGame();

  const { updateStats, addStateEntry } = useStatsStore();
  const currentAgent = useUserStore((state) => state.currentAgent);

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
   * Speak text using TTS
   * Returns audio_base64 for storage in message meta
   */
  const speakText = useCallback(async (text: string): Promise<string | null> => {
    if (!text?.trim()) return null;

    try {
      cleanupAudio();
      setStatus('speaking');

      const response = await fetchWithAuth('/api/speak', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice_id: ttsVoiceId?.trim() || undefined,
        })
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
      const result = await response.json();
      if (!result.audio_base64) throw new Error('No audio data');

      // Decode audio
      const blob = base64ToAudioBlob(result.audio_base64);
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      let activeLipSync: { stop: () => void } | null = null;
      let playbackFinished = false;

      // Wait for audio metadata to get duration
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

        const immediate = useAppStore.getState().avatarRenderer;
        if (tryStart(immediate)) return;

        const waited = await waitForLipSyncRenderer();
        tryStart(waited);
      };

      void startLipSync();

      // Play and wait
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

      // Return the base64 for storage
      return result.audio_base64;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    } finally {
      setStatus('ready');
    }
  }, [setStatus, cleanupAudio, ttsVoiceId]);

  /**
   * Send message and handle streaming response
   */
  const sendMessage = useCallback(async (
    message: string,
    options?: { runtimeTrigger?: boolean }
  ): Promise<void> => {
    // Read isLoading fresh from store to avoid stale closure (M11 fix)
    const currentStatus = useAppStore.getState().status;
    const isLoading = currentStatus === 'thinking' || currentStatus === 'speaking';
    if (isLoading || !currentAgent) return;

    setStatus('thinking');
    useChatStore.getState().setLastEmotionDebug(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const messageId = addMessage('assistant', '', { 
        streaming: true, 
        origin: 'assistant',
        agent_id: currentAgent?.id,  // Multi-agent support
      });
      let fullContent = '';
      let finalResponse: StreamResponse = {};
      let didAbort = false;
      let didHandleAvatarMove = false;

      const gameContext = getGameContext();

      let chunkCount = 0;
      addStateEntry('sse', 'SSE stream started');

      await streamChat(
        message,
        // onChunk
        (chunk) => {
          chunkCount++;
          fullContent += chunk;
          updateMessage(messageId, { content: stripAvatarTagsStreaming(fullContent) });
          if (chunkCount === 1) {
            addStateEntry('sse', `First chunk received (${chunk.length} chars)`);
          }
        },
        // onAvatar
        (avatarData) => {
          addStateEntry('sse', `Avatar event: mood=${avatarData.mood}, move=${avatarData.move}`);
          applyAvatarCommand(avatarData);
          didHandleAvatarMove = true;
          handleAvatarResponse(avatarData.move);
        },
        // onDone
        (data) => {
          addStateEntry('sse', `Done event: ${chunkCount} chunks, ${data.processing_ms}ms`);
          const cleanedResponse = stripAvatarTags(data.response || fullContent);
          finalResponse = { ...data, response: cleanedResponse };
          updateMessage(messageId, {
            content: cleanedResponse,
            meta: {
              processing_ms: data.processing_ms,
              model: data.model,
              behavior: data.behavior,
              usage: data.usage,
              streaming: false,
              origin: 'assistant',
            }
          });
          updateStats({ processing_ms: data.processing_ms });

          if (!didHandleAvatarMove) {
            handleAvatarResponse(undefined);
          }
        },
        // onError
        (error) => {
          addStateEntry('sse', `Error: ${error.name} - ${error.message}`);
          if (error.name === 'AbortError') {
            didAbort = true;
            updateMessage(messageId, {
              meta: { streaming: false, origin: 'assistant' }
            });
            setStatus('ready');
            return;
          }
          console.error('Chat error:', error);
          updateMessage(messageId, {
            content: `⚠️ Error: ${error.message}`,
            meta: { error: true, origin: 'assistant' }
          });
          setStatus('error');
          setTimeout(() => setStatus('ready'), 3000);
        },
        {
          signal: abortController.signal,
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

      // TTS if enabled - store audio in message meta for replay
      if (ttsEnabled && finalResponse?.response) {
        // Timeout TTS to prevent hanging forever
        const ttsTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
        const audio_base64 = await Promise.race([speakText(finalResponse.response), ttsTimeout]);
        if (audio_base64) {
          // Clear audio from previous messages to prevent unbounded memory growth (M10 fix)
          const { messages } = useChatStore.getState();
          for (const msg of messages) {
            if (msg.id !== messageId && msg.meta?.audio_base64) {
              updateMessage(msg.id, { meta: { ...msg.meta, audio_base64: undefined } });
            }
          }
          updateMessage(messageId, {
            meta: {
              processing_ms: finalResponse.processing_ms,
              model: finalResponse.model,
              behavior: finalResponse.behavior,
              usage: finalResponse.usage,
              streaming: false,
              origin: 'assistant',
              audio_base64,
            }
          });
        }
        // Ensure ready status after TTS (speakText's finally should do this, but be safe)
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
      // Ensure status is ready even if something went wrong
      const currentStatus = useAppStore.getState().status;
      if (currentStatus === 'thinking' || currentStatus === 'speaking') {
        setStatus('ready');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- addStateEntry is stable (defined in same module)
  }, [currentAgent, setStatus, addMessage, updateMessage, applyAvatarCommand, handleAvatarResponse, getGameContext, ttsEnabled, speakText, updateStats]);

  // Reactive isLoading for consumers (re-renders on status change)
  const isLoading = useAppStore((s) => s.status === 'thinking' || s.status === 'speaking');

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, isLoading, abort };
}

export default useChat;
