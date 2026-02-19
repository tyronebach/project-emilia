import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomAgent } from '../../utils/api';
import { useChatStore } from '../../store/chatStore';
import RoomAvatarStage from './RoomAvatarStage';

vi.mock('../../avatar/preloadVRM', () => ({
  preloadVRM: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./RoomAvatarTile', () => ({
  default: ({
    agentId,
    isFocused,
    isStreaming,
  }: {
    agentId: string;
    isFocused?: boolean;
    isStreaming?: boolean;
  }) => (
    <div
      data-testid={`avatar-tile-${agentId}`}
      data-focused={String(Boolean(isFocused))}
      data-streaming={String(Boolean(isStreaming))}
    />
  ),
}));

function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 1023px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeAgent(agentId: string, displayName: string): RoomAgent {
  return {
    room_id: 'room-1',
    agent_id: agentId,
    display_name: displayName,
    role: 'participant',
    response_mode: 'always',
    vrm_model: `${agentId}.vrm`,
    voice_id: null,
  };
}

describe('RoomAvatarStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    setMatchMedia(false);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn().mockReturnValue({}),
    });

    useChatStore.getState().clearRoomState();
  });

  it('enforces desktop renderer cap and shows overflow fallback cards', () => {
    useChatStore.setState({
      agents: [
        makeAgent('agent-1', 'Alpha'),
        makeAgent('agent-2', 'Beta'),
        makeAgent('agent-3', 'Gamma'),
        makeAgent('agent-4', 'Delta'),
        makeAgent('agent-5', 'Epsilon'),
        makeAgent('agent-6', 'Zeta'),
      ],
      streamingByAgent: {},
      focusedAgentId: null,
      avatarCommandByAgent: {},
      lastAvatarEventAtByAgent: {},
    });

    const { container } = render(<RoomAvatarStage />);

    expect(screen.getByText('Rendering 4 / 6')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="avatar-tile-"]')).toHaveLength(4);
    expect(screen.getAllByText('Renderer paused (performance cap).')).toHaveLength(2);
  });

  it('prioritizes focused agent into active renderers under cap', () => {
    useChatStore.setState({
      agents: [
        makeAgent('agent-1', 'Alpha'),
        makeAgent('agent-2', 'Beta'),
        makeAgent('agent-3', 'Gamma'),
        makeAgent('agent-4', 'Delta'),
        makeAgent('agent-5', 'Epsilon'),
      ],
      focusedAgentId: 'agent-5',
      streamingByAgent: {},
      avatarCommandByAgent: {},
      lastAvatarEventAtByAgent: {},
    });

    render(<RoomAvatarStage />);

    expect(screen.getByTestId('avatar-tile-agent-5')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-tile-agent-4')).not.toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
  });

  it('uses mobile cap and renders timestamped overflow fallback', () => {
    setMatchMedia(true);
    useChatStore.setState({
      agents: [
        makeAgent('agent-1', 'Alpha'),
        makeAgent('agent-2', 'Beta'),
        makeAgent('agent-3', 'Gamma'),
        makeAgent('agent-4', 'Delta'),
      ],
      focusedAgentId: 'agent-1',
      streamingByAgent: {},
      avatarCommandByAgent: {},
      lastAvatarEventAtByAgent: {
        'agent-4': 200,
        'agent-3': 150,
        'agent-2': 100,
      },
    });

    const { container } = render(<RoomAvatarStage />);

    expect(screen.getByText('Rendering 2 / 4')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="avatar-tile-"]')).toHaveLength(2);
    expect(screen.getAllByText('Renderer paused (performance cap).')).toHaveLength(2);
    expect(screen.getAllByText(/Last avatar cue at/i).length).toBeGreaterThan(0);
  });
});
