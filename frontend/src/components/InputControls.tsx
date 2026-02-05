import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AudioLines, Paperclip, ArrowUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../hooks/useChat';
import { chatInputSchema, ChatInput } from '../schemas/chat';
import { useAppStore } from '../store';
import type { VoiceState } from '../services/VoiceService';

/**
 * ChatGPT-style floating input bar
 * Only shown on active chat sessions (not on new chat page)
 */
interface InputControlsProps {
  voiceState?: VoiceState;
}

function InputControls({ voiceState = 'PASSIVE' }: InputControlsProps) {
  const { status, addMessage, ttsEnabled } = useApp();
  const { sendMessage, isLoading } = useChat();
  const handsFreeEnabled = useAppStore((state) => state.handsFreeEnabled);
  const setHandsFreeEnabled = useAppStore((state) => state.setHandsFreeEnabled);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<ChatInput>({
    resolver: zodResolver(chatInputSchema),
    defaultValues: { message: '' },
  });

  // Disable input when thinking (LLM processing) - NOT during speaking (TTS playback)
  const isDisabled = status === 'thinking' || isLoading;

  // Focus input on mount and after sending
  useEffect(() => {
    if (!isDisabled && !handsFreeEnabled) {
      setFocus('message');
    }
  }, [isDisabled, handsFreeEnabled, setFocus]);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isDisabled) return;
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void handleSubmit(onSubmit)();
  };

  const handleVoiceToggle = () => {
    const nextEnabled = !handsFreeEnabled;
    setHandsFreeEnabled(nextEnabled);
    if (nextEnabled) {
      inputRef.current?.blur();
    }
  };

  const messageValue = watch('message') || '';
  const canSend = Boolean(messageValue.trim()) && !isDisabled;

  const isListening = handsFreeEnabled && voiceState === 'ACTIVE';
  const isProcessing = handsFreeEnabled && voiceState === 'PROCESSING';
  const isSpeaking = handsFreeEnabled && voiceState === 'SPEAKING';
  const immersiveMode = handsFreeEnabled && ttsEnabled;

  let voiceButtonClasses = 'bg-bg-tertiary text-text-secondary';
  if (isListening) {
    voiceButtonClasses = 'bg-success/20 text-success';
  } else if (isProcessing) {
    voiceButtonClasses = 'bg-warning/20 text-warning';
  } else if (isSpeaking) {
    voiceButtonClasses = 'bg-accent/20 text-accent';
  }

  const { ref: messageRef, ...messageField } = register('message');

  return (
    <>
      <div
        className={`absolute left-4 right-4 z-20 rounded-[28px] bg-bg-secondary/80 border border-white/10 p-4 backdrop-blur-md shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)] transition-all duration-300 focus-within:shadow-[0_35px_70px_-40px_rgba(0,0,0,0.9)] ${
          immersiveMode ? 'translate-y-20 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          {/* Row 1: Message input */}
          <textarea
            {...messageField}
            ref={(node) => {
              messageRef(node);
              inputRef.current = node;
            }}
            placeholder="Ask anything"
            disabled={isDisabled}
            rows={1}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-text-primary placeholder-text-secondary/50 text-base leading-6
                       border-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 
                       resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: 'none' }}
            autoComplete="off"
          />

          {/* Row 2: Attachments + Voice */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="h-10 w-10 rounded-full bg-bg-tertiary/80 border border-white/10 text-text-secondary transition-colors hover:bg-bg-tertiary
                         flex items-center justify-center
                         focus:outline-none focus:ring-0"
              aria-label="Add attachment"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSubmit(onSubmit)()}
                disabled={!canSend}
                aria-label="Send message"
                className={`h-11 w-11 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-0 border ${
                  canSend
                    ? 'bg-accent text-accent-foreground border-accent/60 hover:bg-accent-hover'
                    : 'bg-bg-tertiary/70 text-text-secondary border-white/10'
                }`}
              >
                <ArrowUp className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={handleVoiceToggle}
                aria-pressed={handsFreeEnabled}
                aria-label={handsFreeEnabled ? 'Disable hands-free voice' : 'Enable hands-free voice'}
                className={`relative h-12 w-12 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-0 border border-white/10 ${voiceButtonClasses}`}
              >
                {isListening && (
                  <span
                    aria-hidden="true"
                    className="absolute -inset-1 rounded-full bg-white/40 animate-ping"
                  />
                )}
                <AudioLines className="relative h-6 w-6" />
              </button>
            </div>
          </div>
        </form>

        {errors.message && (
          <div className="pt-2 text-xs text-error text-center">{errors.message.message}</div>
        )}
      </div>

      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${
          immersiveMode ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ bottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={handleVoiceToggle}
          aria-pressed={handsFreeEnabled}
          aria-label="Disable hands-free voice"
          className={`relative h-20 w-20 md:h-24 md:w-24 rounded-full flex items-center justify-center transition-all duration-300 border border-white/10 shadow-[0_25px_60px_-40px_rgba(0,0,0,0.9)] ${voiceButtonClasses} ${
            immersiveMode ? 'translate-y-0 scale-100' : 'translate-y-8 scale-90'
          }`}
        >
          {isListening && (
            <span
              aria-hidden="true"
              className="absolute -inset-2 rounded-full bg-white/30 animate-ping"
            />
          )}
          <AudioLines className="relative h-9 w-9 md:h-10 md:w-10" />
        </button>
      </div>
    </>
  );
}

export default InputControls;
