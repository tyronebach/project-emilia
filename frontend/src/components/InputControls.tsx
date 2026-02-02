import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mic, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../hooks/useChat';
import { useAudio } from '../hooks/useAudio';
import { chatInputSchema, ChatInput } from '../schemas/chat';
import { Button } from './ui/button';

/**
 * ChatGPT-style floating input bar
 * Only shown on active chat sessions (not on new chat page)
 */
function InputControls() {
  const { status, addMessage } = useApp();
  const { sendMessage, isLoading } = useChat();
  const { startRecording, stopRecording, isRecording } = useAudio();

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<ChatInput>({
    resolver: zodResolver(chatInputSchema),
    defaultValues: { message: '' },
  });

  // Disable input when processing
  const isDisabled = status === 'thinking' || status === 'speaking' || isLoading;

  // Focus input on mount and after sending
  useEffect(() => {
    if (!isDisabled && !isRecording) {
      setFocus('message');
    }
  }, [isDisabled, isRecording, setFocus]);

  // Handle send
  const onSubmit = async (data: ChatInput) => {
    const trimmedText = data.message.trim();
    if (!trimmedText || isDisabled) return;

    reset();

    // Add user message
    addMessage('user', trimmedText, { source: 'text' });

    // Send to API
    await sendMessage(trimmedText);
  };

  // Handle PTT (push-to-talk)
  const handlePTTStart = () => {
    if (isDisabled) return;
    startRecording();
  };

  const handlePTTEnd = async () => {
    if (!isRecording) return;

    const transcription = await stopRecording();

    if (transcription && transcription.trim()) {
      // Add user message with voice source
      addMessage('user', transcription, { source: 'voice' });

      // Send to chat API
      await sendMessage(transcription);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-bg-primary border-t border-bg-tertiary">
      {/* Status indicator above input */}
      {(isRecording || status === 'processing' || status === 'thinking' || status === 'speaking') && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-text-secondary border-b border-bg-tertiary/50">
          {isRecording && (
            <>
              <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
              <span>Recording... release to send</span>
            </>
          )}
          {status === 'processing' && !isRecording && (
            <>
              <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
              <span>Transcribing...</span>
            </>
          )}
          {status === 'thinking' && !isRecording && (
            <>
              <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
              <span>Thinking...</span>
            </>
          )}
          {status === 'speaking' && (
            <>
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              <span>Speaking...</span>
            </>
          )}
        </div>
      )}

      {/* Full-width input bar */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex items-center gap-2 px-4 py-3"
      >
        {/* Mic button (first) */}
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'ghost'}
          size="icon"
          onMouseDown={handlePTTStart}
          onMouseUp={handlePTTEnd}
          onMouseLeave={() => isRecording && handlePTTEnd()}
          onTouchStart={handlePTTStart}
          onTouchEnd={handlePTTEnd}
          disabled={isDisabled}
          className={`shrink-0 h-10 w-10 rounded-full ${isRecording ? 'animate-pulse' : ''}`}
          title="Hold to speak"
        >
          <Mic className="w-5 h-5" />
        </Button>

        {/* Text input */}
        <div className="flex-1 bg-bg-tertiary rounded-full px-4 py-2">
          <input
            {...register('message')}
            placeholder="Message..."
            disabled={isDisabled}
            className="w-full bg-transparent text-text-primary placeholder-text-secondary/50
                       text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
          />
        </div>

        {/* Send button */}
        <Button
          type="submit"
          size="icon"
          disabled={isDisabled}
          className="shrink-0 h-10 w-10 rounded-full"
        >
          <Send className="w-5 h-5" />
        </Button>
      </form>

      {/* Error display */}
      {errors.message && (
        <div className="text-xs text-error text-center pb-2">
          {errors.message.message}
        </div>
      )}
    </div>
  );
}

export default InputControls;
