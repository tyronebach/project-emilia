import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';
import { useSession } from '../hooks/useSession';
import { Button } from './ui/button';
import agentPlaceholder from '../assets/placeholder-agent.jpg';
import AmbientBackground from './AmbientBackground';

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
    <div className="min-h-[100svh] w-full bg-bg-primary text-text-primary flex items-center justify-center overflow-hidden relative">
      <AmbientBackground variant="newChat" />

      {/* Back button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-4 left-4 text-text-primary hover:bg-white/10 bg-bg-secondary/70 border border-white/10"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="relative z-10 w-full max-w-lg px-6">
        <div className="rounded-[32px] border border-white/10 bg-bg-secondary/70 backdrop-blur-md shadow-[0_30px_70px_-50px_rgba(0,0,0,0.8)] overflow-hidden">
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <img
              src={agentPlaceholder}
              alt={`${currentAgent?.display_name || 'Agent'} avatar`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg-primary/90 via-bg-primary/50 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-text-secondary">
                  New
                </div>
                <h1 className="font-display text-3xl md:text-4xl text-balance">
                  {currentAgent?.display_name || 'Agent'}
                </h1>
              </div>
              <div className="h-11 w-11 rounded-full bg-bg-secondary/80 border border-white/10 flex items-center justify-center text-sm font-semibold text-text-primary">
                <Sparkles className="h-4 w-4 text-text-secondary/70 absolute" />
                <span className="relative">1</span>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5 text-center">
            <p className="text-text-secondary text-base md:text-lg text-balance">
              Start a fresh conversation and bring your companion to life.
            </p>

            {isCreating ? (
              <div className="mt-6 flex flex-col items-center gap-4">
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
                className="mt-6 px-10 py-7 text-lg gap-3 shadow-lg hover:shadow-xl transition-shadow"
              >
                <Sparkles className="w-6 h-6" />
                Chat with {currentAgent?.display_name || 'Agent'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewChatPage;
