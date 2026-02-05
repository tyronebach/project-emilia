import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AudioLines, Paperclip } from 'lucide-react';
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
  const { status, addMessage } = useApp();
  const { sendMessage, isLoading } = useChat();
  const handsFreeEnabled = useAppStore((state) => state.handsFreeEnabled);
  const setHandsFreeEnabled = useAppStore((state) => state.setHandsFreeEnabled);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const isListening = handsFreeEnabled && voiceState === 'ACTIVE';
  const isProcessing = handsFreeEnabled && voiceState === 'PROCESSING';
  const isSpeaking = handsFreeEnabled && voiceState === 'SPEAKING';

  let voiceButtonClasses = 'bg-bg-tertiary text-text-secondary';
  if (isListening) {
    voiceButtonClasses = 'bg-white text-gray-900';
  } else if (isProcessing) {
    voiceButtonClasses = 'bg-amber-500 text-white';
  } else if (isSpeaking) {
    voiceButtonClasses = 'bg-indigo-500 text-white';
  }

  const { ref: messageRef, ...messageField } = register('message');

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 rounded-3xl bg-bg-secondary p-4">
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
            className="h-10 w-10 rounded-full bg-bg-tertiary text-text-secondary transition-colors hover:bg-bg-tertiary/80
                       flex items-center justify-center
                       focus:outline-none focus:ring-0"
            aria-label="Add attachment"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleVoiceToggle}
            aria-pressed={handsFreeEnabled}
            aria-label={handsFreeEnabled ? 'Disable hands-free voice' : 'Enable hands-free voice'}
            className={`relative h-12 w-12 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-0 ${voiceButtonClasses}`}
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
      </form>

      {errors.message && (
        <div className="pt-2 text-xs text-error text-center">{errors.message.message}</div>
      )}
    </div>
  );
}

export default InputControls;
