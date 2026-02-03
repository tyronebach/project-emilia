import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import { useSession } from '../hooks/useSession';
import { Button } from './ui/button';

interface NewChatPageProps {
  userId: string;
}

/**
 * Dedicated page for starting a new chat
 * Simple UI without VRM avatar - just the agent image and start button
 */
function NewChatPage({ userId: _userId }: NewChatPageProps) {
  const navigate = useNavigate();
  const currentAgent = useUserStore((state) => state.currentAgent);
  const currentUser = useUserStore((state) => state.currentUser);
  const setSessionId = useAppStore((state) => state.setSessionId);
  const { createSession, sessions } = useSession();

  const [isCreating, setIsCreating] = useState(false);

  // Clear any stale session ID when on new chat page
  useEffect(() => {
    setSessionId('');
    // Also clean up any old localStorage entries from previous versions
    localStorage.removeItem('emilia-session-id');
  }, [setSessionId]);

  const handleBack = () => {
    // Go back to most recent session if exists, otherwise to agent selection
    if (sessions.length > 0 && currentUser?.id) {
      navigate({
        to: '/user/$userId/chat/$sessionId',
        params: { userId: currentUser.id, sessionId: sessions[0].id }
      });
    } else if (currentUser?.id) {
      navigate({ to: '/user/$userId', params: { userId: currentUser.id } });
    }
  };

  const handleStartChat = async () => {
    if (!currentAgent?.id || !currentUser?.id || isCreating) return;

    setIsCreating(true);
    try {
      // Create a new session
      const newSessionId = await createSession();

      if (newSessionId) {
        // Navigate to initializing page
        navigate({
          to: '/user/$userId/chat/initializing/$sessionId',
          params: { userId: currentUser.id, sessionId: newSessionId }
        });
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      setIsCreating(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary flex items-center justify-center overflow-hidden relative">
      {/* Back button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-4 left-4 text-text-primary hover:bg-white/10"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="flex flex-col items-center gap-8 max-w-md px-6">
        {/* Agent Avatar Placeholder */}
        <div className="w-48 h-48 rounded-full bg-bg-tertiary flex items-center justify-center text-6xl">
          {currentAgent?.display_name?.[0] || '✨'}
        </div>

        {/* Agent Name */}
        <h1 className="text-3xl font-bold text-center">
          {currentAgent?.display_name || 'Agent'}
        </h1>

        {/* Description */}
        <p className="text-text-secondary text-center text-lg">
          Start a new conversation and bring your AI companion to life
        </p>

        {/* Start Chat Button */}
        {isCreating ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-text-secondary">
              Creating session...
            </span>
          </div>
        ) : (
          <Button
            onClick={handleStartChat}
            disabled={!currentAgent}
            size="lg"
            className="px-12 py-8 text-xl gap-3 shadow-lg hover:shadow-xl transition-shadow"
          >
            <Sparkles className="w-6 h-6" />
            Chat with {currentAgent?.display_name || 'Agent'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default NewChatPage;
