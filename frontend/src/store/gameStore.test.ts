import { beforeEach, describe, expect, test } from 'vitest';
import { useAppStore } from './index';
import { useGameStore } from './gameStore';
import { useUserStore } from './userStore';

const DEFAULT_STATUS = {
  isOver: false,
  winner: null,
  displayText: 'Not started',
} as const;

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

function setContext(userId: string, agentId: string, sessionId: string) {
  useUserStore.setState({
    currentUser: {
      id: userId,
      display_name: userId,
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
  useAppStore.getState().setSessionId(sessionId);
  useGameStore.getState().hydrateForContext();
}

describe('gameStore context hydration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetStores();
  });

  test('does not leak game state across sessions', () => {
    setContext('user-a', 'agent-a', 'session-1');
    useGameStore.getState().startGame('tic-tac-toe');
    expect(useGameStore.getState().activeGameId).toBe('tic-tac-toe');

    useAppStore.getState().setSessionId('session-2');
    useGameStore.getState().hydrateForContext();
    expect(useGameStore.getState().activeGameId).toBeNull();

    useAppStore.getState().setSessionId('session-1');
    useGameStore.getState().hydrateForContext();
    expect(useGameStore.getState().activeGameId).toBe('tic-tac-toe');
  });
});
