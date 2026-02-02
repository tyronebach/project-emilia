import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useUserStore } from '../store/userStore';
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
  const { createSession } = useSession();

  const [isCreating, setIsCreating] = useState(false);

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
    <div className="h-screen w-screen bg-bg-primary text-text-primary flex items-center justify-center overflow-hidden">
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
