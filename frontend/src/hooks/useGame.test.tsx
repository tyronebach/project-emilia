import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './useGame';
import { useAppStore } from '../store';
import { useGameCatalogStore } from '../store/gameCatalogStore';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';

const DEFAULT_STATUS = {
  isOver: false,
  winner: null,
  displayText: 'Not started',
} as const;

function setAgent(agentId: string) {
  useUserStore.setState({
    currentUser: {
      id: 'user-1',
      display_name: 'User 1',
      preferences: '{}',
    },
    currentAgent: {
      id: agentId,
      display_name: agentId,
      clawdbot_agent_id: `${agentId}-claw`,
      vrm_model: 'emilia.vrm',
      voice_id: null,
    },
  });
}

function resetStores() {
  useAppStore.setState({
    sessionId: '',
    status: 'ready',
    errors: [],
    ttsEnabled: false,
    ttsVoiceId: '',
    handsFreeEnabled: false,
    avatarState: null,
    avatarRenderer: null,
  });

  useUserStore.setState({ currentUser: null, currentAgent: null });

  useGameCatalogStore.setState({
    games: [],
    loadedForAgentId: null,
    loading: false,
    hasFetched: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });

  useGameStore.setState({
    activeGameId: null,
    gameState: null,
    currentTurn: null,
    gameStatus: { ...DEFAULT_STATUS },
    moveHistory: [],
    gameConfig: { firstPlayer: 'user' },
    isAvatarThinking: false,
    hydratedContextKey: null,
  });
}

describe('useGame catalog gating', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetStores();
    useAppStore.getState().setSessionId('session-1');
    setAgent('agent-1');
  });

  it('blocks startGame when game is not enabled for current agent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    useGameCatalogStore.setState({
      games: [{
        id: 'tic-tac-toe',
        display_name: 'Tic-Tac-Toe',
        category: 'board',
        description: 'Classic 3x3 strategy game.',
        module_key: 'tic-tac-toe',
        move_provider_default: 'llm',
        rule_mode: 'strict',
        version: '1',
      }],
      loadedForAgentId: 'agent-1',
      loading: false,
      hasFetched: true,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startGame('chess');
    });

    expect(useGameStore.getState().activeGameId).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[useGame] Game is not enabled for this agent:', 'chess');
    warnSpy.mockRestore();
  });

  it('refreshes catalog when active agent changes', async () => {
    const refreshCatalog = vi.fn().mockResolvedValue(undefined);
    useGameCatalogStore.setState({
      games: [],
      loadedForAgentId: 'agent-1',
      loading: false,
      hasFetched: true,
      error: null,
      refresh: refreshCatalog,
    });

    renderHook(() => useGame());
    expect(refreshCatalog).not.toHaveBeenCalled();

    act(() => {
      setAgent('agent-2');
    });

    await waitFor(() => {
      expect(refreshCatalog).toHaveBeenCalledWith('agent-2');
    });
  });
});
