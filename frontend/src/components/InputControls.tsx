import { useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../hooks/useChat';
import { useAudio } from '../hooks/useAudio';
import { chatInputSchema, ChatInput } from '../schemas/chat';
import { Button } from './ui/button';
import { Input } from './ui/input';

function InputControls() {
  const { status, addMessage } = useApp();
  const { sendMessage, isLoading } = useChat();
  const { startRecording, stopRecording, isRecording } = useAudio();
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChatInput>({
    resolver: zodResolver(chatInputSchema),
    defaultValues: { message: '' }
  });
  
  // Disable input when processing
  const isDisabled = status === 'thinking' || status === 'speaking' || isLoading;
  
  // Focus input on mount and after sending
  useEffect(() => {
    if (!isDisabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isDisabled]);
  
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
    <div className="bg-bg-secondary rounded-xl p-3 md:p-4 shrink-0">
      <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2">
        {/* Text input */}
        <div className="flex-1 relative">
          <Input
            {...register('message')}
            ref={inputRef}
            placeholder="Type a message..."
            disabled={isDisabled}
            className="bg-bg-tertiary text-text-primary placeholder-text-secondary 
                       pr-12 disabled:opacity-50 disabled:cursor-not-allowed
                       focus:ring-2 focus:ring-accent
                       min-h-[40px]"
          />
          
          {/* Send button (inside input on desktop) */}
          <Button
            type="submit"
            size="icon"
            disabled={isDisabled}
            className="absolute right-1 top-1/2 -translate-y-1/2 hidden md:flex
                       h-8 w-8"
          >
            <Send className="w-4 h-4" />
          </Button>
          
          {errors.message && (
            <span className="text-xs text-error absolute -bottom-5 left-0">
              {errors.message.message}
            </span>
          )}
        </div>
        
        {/* Send button (mobile) */}
        <Button
          type="submit"
          size="icon"
          disabled={isDisabled}
          className="md:hidden shrink-0 h-10 w-10"
        >
          <Send className="w-5 h-5" />
        </Button>
        
        {/* PTT button */}
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'secondary'}
          size="icon"
          onMouseDown={handlePTTStart}
          onMouseUp={handlePTTEnd}
          onMouseLeave={() => isRecording && handlePTTEnd()}
          onTouchStart={handlePTTStart}
          onTouchEnd={handlePTTEnd}
          disabled={isDisabled}
          className={`shrink-0 h-10 w-10 ${isRecording ? 'animate-pulse' : ''}`}
          title="Hold to speak"
        >
          <Mic className="w-5 h-5" />
        </Button>
      </form>
      
      {/* Status bar */}
      {(isRecording || status === 'thinking' || status === 'speaking') && (
        <div className="mt-2 text-xs text-text-secondary flex items-center gap-2">
          {isRecording && (
            <>
              <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
              <span>Recording... release to send</span>
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
    </div>
  );
}

export default InputControls;
