import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useChat } from '../hooks/useChat';
import { useAudio } from '../hooks/useAudio';

function InputControls() {
  const { status, addMessage } = useApp();
  const { sendMessage, isLoading } = useChat();
  const { startRecording, stopRecording, isRecording } = useAudio();
  
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Disable input when processing
  const isDisabled = status === 'thinking' || status === 'speaking' || isLoading;
  
  // Focus input on mount and after sending
  useEffect(() => {
    if (!isDisabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isDisabled]);
  
  // Handle send
  const handleSend = async () => {
    const trimmedText = text.trim();
    if (!trimmedText || isDisabled) return;
    
    setText('');
    
    // Add user message
    addMessage('user', trimmedText, { source: 'text' });
    
    // Send to API
    await sendMessage(trimmedText);
  };
  
  // Handle Enter key
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
  
  // Handle textarea auto-resize
  const handleInput = (e: FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 128) + 'px';
  };
  
  return (
    <div className="bg-bg-secondary rounded-xl p-3 md:p-4 shrink-0">
      <div className="flex items-end gap-2">
        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message..."
            disabled={isDisabled}
            rows={1}
            className="w-full bg-bg-tertiary text-text-primary placeholder-text-secondary 
                       rounded-lg px-3 py-2 pr-12 resize-none
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-accent
                       min-h-[40px] max-h-32"
            style={{ height: 'auto' }}
          />
          
          {/* Send button (inside input on desktop) */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || isDisabled}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg
                       bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed
                       hover:bg-accent-hover transition-colors
                       hidden md:block"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        
        {/* Send button (mobile) */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || isDisabled}
          className="p-3 rounded-lg bg-accent text-white 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:bg-accent-hover transition-colors
                     md:hidden shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        
        {/* PTT button */}
        <button
          onMouseDown={handlePTTStart}
          onMouseUp={handlePTTEnd}
          onMouseLeave={() => isRecording && handlePTTEnd()}
          onTouchStart={handlePTTStart}
          onTouchEnd={handlePTTEnd}
          disabled={isDisabled}
          className={`p-3 rounded-lg transition-colors shrink-0
                     disabled:opacity-50 disabled:cursor-not-allowed
                     ${isRecording 
                       ? 'bg-error text-white animate-pulse' 
                       : 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-primary'
                     }`}
          title="Hold to speak"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
      </div>
      
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
