import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AtSign, Send, UserCircle2, Users } from 'lucide-react';
import AmbientBackground from '../AmbientBackground';
import AppTopNav from '../AppTopNav';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import RoomAvatarStage from './RoomAvatarStage';
import { useUserStore } from '../../store/userStore';
import { useRoomStore } from '../../store/roomStore';
import { getRoom, getUser } from '../../utils/api';
import { useRoomChat } from '../../hooks/useRoomChat';

interface RoomChatPageProps {
  userId: string;
  roomId: string;
}

function formatTime(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RoomChatPage({ userId, roomId }: RoomChatPageProps) {
  const navigate = useNavigate();
  const currentUser = useUserStore((state) => state.currentUser);
  const setUser = useUserStore((state) => state.setUser);

  const messages = useRoomStore((state) => state.messages);
  const agents = useRoomStore((state) => state.agents);
  const streamingByAgent = useRoomStore((state) => state.streamingByAgent);
  const focusedAgentId = useRoomStore((state) => state.focusedAgentId);
  const setCurrentRoom = useRoomStore((state) => state.setCurrentRoom);
  const setAgents = useRoomStore((state) => state.setAgents);
  const setFocusedAgent = useRoomStore((state) => state.setFocusedAgent);
  const clearRoomState = useRoomStore((state) => state.clearRoomState);

  const [input, setInput] = useState('');
  const [mentionAgents, setMentionAgents] = useState<string[]>([]);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
  });

  useEffect(() => {
    const user = userQuery.data;
    if (!user) return;
    if (currentUser?.id === user.id && currentUser.display_name === user.display_name) return;

    setUser({
      id: user.id,
      display_name: user.display_name,
      preferences: user.preferences,
    });
  }, [currentUser?.display_name, currentUser?.id, setUser, userQuery.data]);

  const userReady = currentUser?.id === userId;

  const roomQuery = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: userReady,
    retry: false,
  });

  const { isLoading, sendMessage, loadHistory } = useRoomChat(roomId);

  useEffect(() => {
    if (!roomQuery.data) return;
    setCurrentRoom(roomQuery.data);
    setAgents(roomQuery.data.agents || []);
  }, [roomQuery.data, setAgents, setCurrentRoom]);

  useEffect(() => {
    if (!userReady) return;
    void loadHistory();
  }, [loadHistory, userReady]);

  useEffect(() => {
    return () => {
      clearRoomState();
    };
  }, [clearRoomState]);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages, streamingByAgent]);

  const focusedAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === focusedAgentId) || null,
    [agents, focusedAgentId],
  );

  const toggleMention = (agentId: string) => {
    setMentionAgents((prev) => (
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    ));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    const mentions = mentionAgents;
    setMentionAgents([]);
    await sendMessage(trimmed, mentions.length ? mentions : undefined);
  };

  const unavailable = roomQuery.isError || !roomQuery.data;

  return (
    <div className="min-h-[100svh] bg-bg-primary text-text-primary relative overflow-hidden">
      <AmbientBackground variant="newChat" />

      <div className="relative z-10 flex min-h-[100svh] flex-col">
        <AppTopNav
          onBack={() => navigate({ to: '/user/$userId/rooms', params: { userId } })}
          subtitle={roomQuery.data?.name || 'Room Chat'}
          rightSlot={(
            <div className="rounded-xl border border-white/10 bg-bg-secondary/70 px-3 py-1.5 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {(roomQuery.data?.agents || []).length} agents
              </span>
            </div>
          )}
        />

        {unavailable ? (
          <div className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-white/10 bg-bg-secondary/70 p-6 text-sm text-text-secondary">
            This room is unavailable or you no longer have access.
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-4">
            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="rounded-3xl border border-white/10 bg-bg-secondary/70 backdrop-blur-sm">
                <ScrollArea className="h-[60svh] lg:h-[68svh]">
                  <div className="space-y-3 p-4">
                    {messages.length === 0 && Object.keys(streamingByAgent).length === 0 ? (
                      <p className="rounded-xl border border-white/10 bg-bg-tertiary/40 px-3 py-2 text-sm text-text-secondary">
                        Start the conversation. Use <code>@name</code> or select mention chips below.
                      </p>
                    ) : null}

                    {messages.map((message) => {
                      const isUser = message.sender_type === 'user';
                      const isAgent = message.sender_type === 'agent';

                      return (
                        <button
                          key={message.id}
                          type="button"
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isUser
                              ? 'border-accent/30 bg-accent/10'
                              : 'border-white/10 bg-bg-tertiary/50 hover:border-accent/35'
                          }`}
                          onClick={() => {
                            if (isAgent) {
                              setFocusedAgent(message.sender_id);
                            }
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-text-secondary">
                              <UserCircle2 className="h-3.5 w-3.5" />
                              {isUser ? 'You' : message.sender_name}
                            </span>
                            <span className="text-xs text-text-secondary/80">{formatTime(message.timestamp)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-text-primary">{message.content}</p>
                        </button>
                      );
                    })}

                    {Object.entries(streamingByAgent).map(([agentId, partial]) => {
                      const agent = agents.find((a) => a.agent_id === agentId);
                      if (!partial.trim()) return null;
                      return (
                        <div key={`stream-${agentId}`} className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
                          <div className="mb-2 text-xs uppercase tracking-wide text-text-secondary">
                            {agent?.display_name || agentId} is typing...
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-text-primary">{partial}</p>
                        </div>
                      );
                    })}
                    <div ref={bottomAnchorRef} />
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-3">
                <div className="rounded-3xl border border-white/10 bg-bg-secondary/70 p-4">
                  <RoomAvatarStage />
                  {focusedAgent ? (
                    <Button className="mt-3 w-full" variant="ghost" onClick={() => setFocusedAgent(null)}>
                      Clear Focus ({focusedAgent.display_name})
                    </Button>
                  ) : (
                    <p className="mt-3 text-xs text-text-secondary">
                      Click an agent message to focus their avatar.
                    </p>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-bg-secondary/70 p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-text-secondary">Quick Mention</p>
                  <div className="flex flex-wrap gap-2">
                    {agents.map((agent) => {
                      const selected = mentionAgents.includes(agent.agent_id);
                      return (
                        <button
                          key={agent.agent_id}
                          type="button"
                          onClick={() => toggleMention(agent.agent_id)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            selected
                              ? 'border-accent/40 bg-accent/20 text-text-primary'
                              : 'border-white/10 bg-bg-tertiary/60 text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            <AtSign className="h-3 w-3" />
                            {agent.display_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                void onSubmit(event);
              }}
              className="rounded-2xl border border-white/10 bg-bg-secondary/80 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                      e.preventDefault();
                      if (input.trim() && !isLoading) {
                        void onSubmit(e as unknown as FormEvent<HTMLFormElement>);
                      }
                    }
                  }}
                  rows={2}
                  placeholder="Send a message to the room"
                  className="min-h-[3.5rem] flex-1 resize-none rounded-xl border border-white/10 bg-bg-tertiary/70 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
                  disabled={isLoading}
                />
                <Button type="submit" disabled={isLoading || !input.trim()} className="h-11 gap-2">
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default RoomChatPage;
