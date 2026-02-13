import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import RoomChatPage from './RoomChatPage';
import { useRoomStore } from '../../store/roomStore';
import { useUserStore } from '../../store/userStore';

const navigateMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock('../../hooks/useRoomChat', () => ({
  useRoomChat: () => ({
    isLoading: false,
    sendMessage: vi.fn(),
    loadHistory: vi.fn().mockResolvedValue([]),
    abort: vi.fn(),
  }),
}));

vi.mock('../AmbientBackground', () => ({
  default: () => <div data-testid="ambient-bg" />,
}));

vi.mock('../AppTopNav', () => ({
  default: ({ rightSlot }: { rightSlot?: ReactNode }) => (
    <div>
      <div>TopNav</div>
      {rightSlot}
    </div>
  ),
}));

vi.mock('../ui/button', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}));

vi.mock('../ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('RoomChatPage auto-scroll', () => {
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

    useRoomStore.getState().clearRoomState();

    const userQueryData = {
      id: 'user-1',
      display_name: 'User One',
      preferences: '{}',
    };
    const roomQueryData = {
      id: 'room-1',
      name: 'Room One',
      created_by: 'user-1',
      created_at: 1,
      last_activity: 1,
      message_count: 0,
      room_type: 'group',
      settings: {},
      agents: [
        {
          room_id: 'room-1',
          agent_id: 'agent-1',
          display_name: 'Alpha',
          role: 'participant',
          response_mode: 'always',
        },
      ],
      participants: [],
    };

    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'user') {
        return {
          data: userQueryData,
          isError: false,
        };
      }

      return {
        data: roomQueryData,
        isError: false,
      };
    });

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('scrolls to bottom when messages update', async () => {
    render(<RoomChatPage userId="user-1" roomId="room-1" />);
    const scrollSpy = vi.mocked(Element.prototype.scrollIntoView);
    const initialCalls = scrollSpy.mock.calls.length;

    act(() => {
      useRoomStore.getState().addMessage({
        id: 'm1',
        room_id: 'room-1',
        sender_type: 'agent',
        sender_id: 'agent-1',
        sender_name: 'Alpha',
        content: 'Hello there',
        timestamp: Date.now() / 1000,
        origin: 'chat',
        behavior: { mood_intensity: 1 },
      });
    });

    await waitFor(() => {
      expect(scrollSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });
});
