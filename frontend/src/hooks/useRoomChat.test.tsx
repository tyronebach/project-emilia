import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomChat } from './useRoomChat';
import { useUserStore } from '../store/userStore';
import { useRoomStore } from '../store/roomStore';
import { useAppStore } from '../store';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return {
    ...actual,
    getRoomHistory: vi.fn().mockResolvedValue([]),
    streamRoomChat: vi.fn(),
  };
});

import { streamRoomChat } from '../utils/api';

describe('useRoomChat avatar events', () => {
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

    useRoomStore.setState({
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

  it('applies avatar commands for the focused room agent', async () => {
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

    const { result } = renderHook(() => useRoomChat('room-1'));

    await act(async () => {
      await result.current.sendMessage('hello room');
    });

    expect(applyAvatarCommand).toHaveBeenCalledTimes(1);
    expect(applyAvatarCommand).toHaveBeenCalledWith({
      intent: 'greeting',
      mood: 'happy',
      intensity: 0.7,
      energy: 'high',
      move: undefined,
      game_action: undefined,
    });

    const state = useRoomStore.getState();
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

  it('ignores avatar commands for non-focused agents', async () => {
    const applyAvatarCommand = vi.fn();
    useAppStore.setState({ applyAvatarCommand });
    useRoomStore.setState({ focusedAgentId: 'agent-2' });

    vi.mocked(streamRoomChat).mockImplementation(async (_roomId, _data, onEvent) => {
      onEvent({
        type: 'avatar',
        agent_id: 'agent-1',
        agent_name: 'Alpha',
        intent: 'greeting',
      });
      onEvent({ type: 'done', room_id: 'room-1' });
    });

    const { result } = renderHook(() => useRoomChat('room-1'));

    await act(async () => {
      await result.current.sendMessage('hello room');
    });

    expect(applyAvatarCommand).not.toHaveBeenCalled();

    const state = useRoomStore.getState();
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
