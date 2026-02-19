import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from './useChat';
import { useUserStore } from '../store/userStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return {
    ...actual,
    getRoomHistory: vi.fn().mockResolvedValue([]),
    streamRoomChat: vi.fn(),
  };
});

vi.mock('./useGame', () => ({
  useGame: () => ({
    getGameContext: () => null,
    handleAvatarResponse: vi.fn(),
  }),
}));

import { streamRoomChat } from '../utils/api';

describe('useChat room-mode avatar events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    useUserStore.setState({
      currentUser: {
        id: 'user-1',
        display_name: 'User One',
        preferences: '{}',
      },
      currentAgent: null,
    });

    useAppStore.setState({
      roomId: 'room-1',
      status: 'ready',
    });

    useChatStore.setState({
      currentRoomId: 'room-1',
      currentRoom: null,
      agents: [],
      messages: [],
      streamingByAgent: {},
      focusedAgentId: 'agent-1',
      avatarCommandByAgent: {},
      lastAvatarEventAtByAgent: {},
    });
  });

  it('stores avatar commands for all agents via chatStore (no global applyAvatarCommand)', async () => {
    const applyAvatarCommand = vi.fn();
    useAppStore.setState({ applyAvatarCommand });

    vi.mocked(streamRoomChat).mockImplementation(async (_roomId, _data, onEvent) => {
      onEvent({
        type: 'avatar',
        agent_id: 'agent-1',
        agent_name: 'Alpha',
        intent: 'greeting',
        mood: 'happy',
        intensity: 0.7,
        energy: 'high',
      });
      onEvent({ type: 'done', room_id: 'room-1' });
    });

    const { result } = renderHook(() => useChat('room'));

    await act(async () => {
      await result.current.sendMessage('hello room');
    });

    // Room mode no longer calls the global applyAvatarCommand —
    // each RoomAvatarTile picks up commands from the store.
    expect(applyAvatarCommand).not.toHaveBeenCalled();

    const state = useChatStore.getState();
    expect(state.avatarCommandByAgent['agent-1']).toEqual({
      intent: 'greeting',
      mood: 'happy',
      intensity: 0.7,
      energy: 'high',
      move: undefined,
      game_action: undefined,
    });
    expect(state.lastAvatarEventAtByAgent['agent-1']).toBeTypeOf('number');
  });

  it('stores avatar commands for non-focused agents too', async () => {
    const applyAvatarCommand = vi.fn();
    useAppStore.setState({ applyAvatarCommand });
    useChatStore.setState({ focusedAgentId: 'agent-2' });

    vi.mocked(streamRoomChat).mockImplementation(async (_roomId, _data, onEvent) => {
      onEvent({
        type: 'avatar',
        agent_id: 'agent-1',
        agent_name: 'Alpha',
        intent: 'greeting',
      });
      onEvent({ type: 'done', room_id: 'room-1' });
    });

    const { result } = renderHook(() => useChat('room'));

    await act(async () => {
      await result.current.sendMessage('hello room');
    });

    expect(applyAvatarCommand).not.toHaveBeenCalled();

    const state = useChatStore.getState();
    expect(state.avatarCommandByAgent['agent-1']).toEqual({
      intent: 'greeting',
      mood: undefined,
      intensity: undefined,
      energy: undefined,
      move: undefined,
      game_action: undefined,
    });
    expect(state.lastAvatarEventAtByAgent['agent-1']).toBeTypeOf('number');
  });
});
