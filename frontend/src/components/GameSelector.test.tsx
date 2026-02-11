import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameSelector from './GameSelector';
import { useGameCatalogStore } from '../store/gameCatalogStore';
import { useUserStore } from '../store/userStore';

const {
  mockStartGame,
  mockPreloadGame,
  mockHasGameLoader,
} = vi.hoisted(() => ({
  mockStartGame: vi.fn().mockResolvedValue(undefined),
  mockPreloadGame: vi.fn().mockResolvedValue(undefined),
  mockHasGameLoader: vi.fn(() => true),
}));

vi.mock('../hooks/useGame', () => ({
  useGame: () => ({
    startGame: mockStartGame,
  }),
}));

vi.mock('../games/registry', () => ({
  hasGameLoader: mockHasGameLoader,
  preloadGame: mockPreloadGame,
}));

const CATALOG_GAME = {
  id: 'tic-tac-toe',
  display_name: 'Tic-Tac-Toe',
  category: 'board',
  description: 'Classic 3x3 strategy game.',
  module_key: 'tic_tac_toe',
  move_provider_default: 'llm',
  rule_mode: 'strict',
  version: '1.0.0',
};

const CATALOG_GAME_WITHOUT_LOADER = {
  id: 'word-duel',
  display_name: 'Word Duel',
  category: 'word',
  description: 'Not wired into loader manifest yet.',
  module_key: 'word-duel',
  move_provider_default: 'llm',
  rule_mode: 'strict',
  version: '1.0.0',
};

describe('GameSelector preload behavior', () => {
  beforeEach(() => {
    mockStartGame.mockClear();
    mockPreloadGame.mockClear();
    mockHasGameLoader.mockClear();
    mockHasGameLoader.mockReturnValue(true);

    useUserStore.setState({
      currentUser: {
        id: 'user-1',
        display_name: 'User 1',
        preferences: '{}',
      },
      currentAgent: {
        id: 'agent-1',
        display_name: 'Agent 1',
        clawdbot_agent_id: 'agent-1-claw',
        vrm_model: 'emilia.vrm',
        voice_id: null,
      },
    });

    const refresh = vi.fn().mockResolvedValue(undefined);
    useGameCatalogStore.setState({
      games: [CATALOG_GAME],
      loadedForAgentId: 'agent-1',
      loading: false,
      hasFetched: true,
      error: null,
      refresh,
    });
  });

  it('preloads the game module on hover and focus', () => {
    render(<GameSelector open onClose={vi.fn()} />);

    const gameButton = screen.getByRole('button', { name: /tic-tac-toe/i });
    const beforeHoverCalls = mockPreloadGame.mock.calls.length;
    fireEvent.mouseEnter(gameButton);
    fireEvent.focus(gameButton);

    const newCalls = mockPreloadGame.mock.calls.slice(beforeHoverCalls);
    expect(newCalls.length).toBeGreaterThanOrEqual(2);
    expect(newCalls).toEqual(expect.arrayContaining([['tic-tac-toe'], ['tic-tac-toe']]));
  });

  it('starts the game when selected', () => {
    const onClose = vi.fn();
    render(<GameSelector open onClose={onClose} />);

    const gameButton = screen.getByRole('button', { name: /tic-tac-toe/i });
    fireEvent.click(gameButton);

    expect(mockStartGame).toHaveBeenCalledWith('tic-tac-toe');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters out catalog entries that have no frontend loader', () => {
    mockHasGameLoader.mockImplementation((gameId: string) => gameId !== 'word-duel');
    useGameCatalogStore.setState({
      games: [CATALOG_GAME, CATALOG_GAME_WITHOUT_LOADER],
      loadedForAgentId: 'agent-1',
      loading: false,
      hasFetched: true,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    render(<GameSelector open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /tic-tac-toe/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /word duel/i })).not.toBeInTheDocument();
  });

  it('refreshes catalog when switching agents', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    useGameCatalogStore.setState({
      games: [CATALOG_GAME],
      loadedForAgentId: 'agent-1',
      loading: false,
      hasFetched: true,
      error: null,
      refresh,
    });

    render(<GameSelector open onClose={vi.fn()} />);
    await waitFor(() => expect(refresh).toHaveBeenCalledWith('agent-1'));

    act(() => {
      useUserStore.setState({
        currentUser: {
          id: 'user-1',
          display_name: 'User 1',
          preferences: '{}',
        },
        currentAgent: {
          id: 'agent-2',
          display_name: 'Agent 2',
          clawdbot_agent_id: 'agent-2-claw',
          vrm_model: 'emilia.vrm',
          voice_id: null,
        },
      });
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledWith('agent-2'));
  });
});
