/**
 * Emilia API Utilities
 * Handles authenticated requests and SSE streaming
 */

import type { AvatarCommand } from '../types';
import type { GameContext } from '../games/types';
import type { SoulMoodSnapshot } from '../types/soulWindow';
import { useUserStore } from '../store/userStore';
import { useAppStore } from '../store';

const API_URL = '';
const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || 'emilia-dev-token-2026';

// ============ TYPES ============

export interface Agent {
  id: string;
  display_name: string;
  clawdbot_agent_id: string;
  vrm_model: string;
  voice_id: string | null;
  owners?: string[];
  workspace?: string | null;
  created_at?: number;
}

export interface User {
  id: string;
  display_name: string;
  preferences?: string;
  agents?: Agent[];
  avatar_count?: number;
}

export interface Session {
  id: string;
  agent_id: string;
  name: string | null;
  created_at: number;
  last_used: number;
  message_count: number;
  participants: string[];
}

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'system';
  origin?: 'user' | 'assistant' | 'game_runtime' | 'system' | null;
  content: string;
  timestamp?: string;
}

export interface RoomAgent {
  room_id: string;
  agent_id: string;
  display_name: string;
  vrm_model?: string | null;
  voice_id?: string | null;
  role: 'participant' | 'moderator' | 'observer';
  response_mode: 'mention' | 'always' | 'manual';
  added_at?: number | null;
  added_by?: string | null;
}

export interface RoomParticipant {
  room_id: string;
  user_id: string;
  display_name: string;
  role: 'member' | 'admin' | 'owner' | string;
  joined_at?: number | null;
}

export interface Room {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
  last_activity: number;
  message_count: number;
  room_type: 'group' | 'game_lobby' | 'debate' | string;
  settings: Record<string, unknown>;
  agents?: RoomAgent[];
  participants?: RoomParticipant[];
}

export interface RoomMessageBehavior {
  intent?: string | null;
  mood?: string | null;
  mood_intensity?: number;
  energy?: string | null;
  move?: string | null;
  game_action?: string | null;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  sender_type: 'user' | 'agent';
  sender_id: string;
  sender_name: string;
  content: string;
  timestamp: number;
  origin?: string | null;
  model?: string | null;
  processing_ms?: number | null;
  usage_prompt_tokens?: number | null;
  usage_completion_tokens?: number | null;
  behavior?: RoomMessageBehavior;
}

export interface RoomChatAgentReply {
  agent_id: string;
  agent_name: string;
  message: RoomMessage;
  processing_ms: number;
  model?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface RoomChatResponsePayload {
  room_id: string;
  responses: RoomChatAgentReply[];
  count: number;
}

export interface GameCatalogItem {
  id: string;
  display_name: string;
  category: 'board' | 'card' | 'word' | 'creative' | string;
  description: string;
  module_key: string;
  move_provider_default: 'llm' | 'engine' | 'random' | string;
  rule_mode: 'strict' | 'narrative' | 'spectator' | string;
  prompt_instructions?: string | null;
  effective_mode?: string | null;
  effective_difficulty?: number | null;
  version: string;
}

export interface ManageGame {
  id: string;
  display_name: string;
  category: 'board' | 'card' | 'word' | 'creative' | string;
  description: string;
  module_key: string;
  active: boolean;
  move_provider_default: 'llm' | 'engine' | 'random' | string;
  rule_mode: 'strict' | 'narrative' | 'spectator' | string;
  prompt_instructions?: string | null;
  version: string;
  created_at?: number | null;
  updated_at?: number | null;
}

export interface ManageAgentGame extends ManageGame {
  config_enabled?: boolean | number | null;
  config_mode?: string | null;
  config_difficulty?: number | null;
  config_prompt_override?: string | null;
  config_workspace_required?: boolean | number | null;
  effective_enabled?: boolean | number;
  effective_mode?: string | null;
}

export interface AgentGameConfig {
  agent_id: string;
  game_id: string;
  enabled: boolean;
  mode?: string | null;
  difficulty?: number | null;
  prompt_override?: string | null;
  workspace_required?: boolean;
}


// ============ HELPERS ============

function getHeaders(): Record<string, string> {
  const { currentUser, currentAgent } = useUserStore.getState();
  const { sessionId } = useAppStore.getState();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (currentUser?.id) {
    headers['X-User-Id'] = currentUser.id;
  }
  if (currentAgent?.id) {
    headers['X-Agent-Id'] = currentAgent.id;
  }
  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }

  return headers;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  return fetch(url, { ...options, headers });
}


// ============ USER API ============

export async function getUsers(): Promise<User[]> {
  const response = await fetchWithAuth(`${API_URL}/api/users`);
  if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
  const data = await response.json();
  return data.users || [];
}

export async function getUser(userId: string): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error(`Failed to fetch user: ${response.status}`);
  return response.json();
}

export async function updateUserPreferences(
  userId: string,
  preferences: Record<string, unknown>
): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}/preferences`, {
    method: 'PATCH',
    body: JSON.stringify({ preferences }),
  });
  if (!response.ok) throw new Error(`Failed to update preferences: ${response.status}`);
  return response.json();
}

export async function getUserAgents(userId: string): Promise<Agent[]> {
  const response = await fetchWithAuth(`${API_URL}/api/users/${encodeURIComponent(userId)}/agents`);
  if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
  const data = await response.json();
  return data.agents || [];
}


// ============ GAMES API ============

export async function getGameCatalog(): Promise<GameCatalogItem[]> {
  const response = await fetchWithAuth(`${API_URL}/api/games/catalog`);
  if (!response.ok) throw new Error(`Failed to fetch game catalog: ${response.status}`);
  const data = await response.json();
  return data.games || [];
}

export async function getGameCatalogItem(gameId: string): Promise<GameCatalogItem> {
  const response = await fetchWithAuth(`${API_URL}/api/games/catalog/${encodeURIComponent(gameId)}`);
  if (!response.ok) throw new Error(`Failed to fetch game catalog item: ${response.status}`);
  return response.json();
}


// ============ ADMIN API ============

export async function fetchUsers(): Promise<User[]> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/users`);
  if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
  const data = await response.json();
  return data.users || [];
}

export async function createUser(data: { id: string; display_name: string }): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/users`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to create user: ${response.status}`);
  return response.json();
}

export async function updateUser(userId: string, data: { display_name: string }): Promise<User> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to update user: ${response.status}`);
  return response.json();
}

export async function deleteUser(userId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete user: ${response.status}`);
}

export async function createAgent(data: {
  id: string;
  display_name: string;
  clawdbot_agent_id: string;
  vrm_model?: string;
  voice_id?: string | null;
  workspace?: string | null;
}): Promise<Agent> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/agents`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to create agent: ${response.status}`);
  return response.json();
}

export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete agent: ${response.status}`);
}

export async function fetchUserAgents(userId: string): Promise<Agent[]> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/users/${encodeURIComponent(userId)}/agents`);
  if (!response.ok) throw new Error(`Failed to fetch user agents: ${response.status}`);
  const data = await response.json();
  return data.agents || [];
}

export async function addUserAgent(userId: string, agentId: string): Promise<void> {
  const response = await fetchWithAuth(
    `${API_URL}/api/manage/users/${encodeURIComponent(userId)}/agents/${encodeURIComponent(agentId)}`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error(`Failed to add mapping: ${response.status}`);
}

export async function removeUserAgent(userId: string, agentId: string): Promise<void> {
  const response = await fetchWithAuth(
    `${API_URL}/api/manage/users/${encodeURIComponent(userId)}/agents/${encodeURIComponent(agentId)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error(`Failed to remove mapping: ${response.status}`);
}

export async function fetchManageGames(): Promise<ManageGame[]> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/games`);
  if (!response.ok) throw new Error(`Failed to fetch games: ${response.status}`);
  const data = await response.json();
  return data.games || [];
}

export async function createManageGame(data: {
  id: string;
  display_name: string;
  category: 'board' | 'card' | 'word' | 'creative';
  description: string;
  module_key: string;
  active?: boolean;
  move_provider_default?: 'llm' | 'engine' | 'random';
  rule_mode?: 'strict' | 'narrative' | 'spectator';
  prompt_instructions?: string | null;
  version?: string;
}): Promise<ManageGame> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/games`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to create game: ${response.status}`);
  return response.json();
}

export async function updateManageGame(gameId: string, data: {
  display_name?: string;
  category?: 'board' | 'card' | 'word' | 'creative';
  description?: string;
  module_key?: string;
  active?: boolean;
  move_provider_default?: 'llm' | 'engine' | 'random';
  rule_mode?: 'strict' | 'narrative' | 'spectator';
  prompt_instructions?: string | null;
  version?: string;
}): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/games/${encodeURIComponent(gameId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to update game: ${response.status}`);
}

export async function deactivateManageGame(gameId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/games/${encodeURIComponent(gameId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to deactivate game: ${response.status}`);
}

export async function fetchAgentGames(agentId: string): Promise<ManageAgentGame[]> {
  const response = await fetchWithAuth(`${API_URL}/api/manage/agents/${encodeURIComponent(agentId)}/games`);
  if (!response.ok) throw new Error(`Failed to fetch agent games: ${response.status}`);
  const data = await response.json();
  return data.games || [];
}

export async function updateAgentGameConfig(
  agentId: string,
  gameId: string,
  data: {
    enabled?: boolean;
    mode?: 'strict' | 'narrative' | 'spectator';
    difficulty?: number;
    prompt_override?: string | null;
    workspace_required?: boolean;
  }
): Promise<AgentGameConfig> {
  const response = await fetchWithAuth(
    `${API_URL}/api/manage/agents/${encodeURIComponent(agentId)}/games/${encodeURIComponent(gameId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
  if (!response.ok) throw new Error(`Failed to update agent game config: ${response.status}`);
  return response.json();
}

export async function deleteAgentGameConfig(agentId: string, gameId: string): Promise<void> {
  const response = await fetchWithAuth(
    `${API_URL}/api/manage/agents/${encodeURIComponent(agentId)}/games/${encodeURIComponent(gameId)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) throw new Error(`Failed to delete agent game config: ${response.status}`);
}


// ============ SESSION API ============

export async function getSessions(agentId?: string): Promise<Session[]> {
  const headers = getHeaders();
  if (agentId) {
    headers['X-Agent-Id'] = agentId;
  }

  const response = await fetch(`${API_URL}/api/sessions`, { headers });
  if (!response.ok) throw new Error(`Failed to fetch sessions: ${response.status}`);
  const data = await response.json();
  return data.sessions || [];
}

export async function createSession(agentId: string, name?: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, name }),
  });
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`);
  return response.json();
}

export async function getSession(sessionId: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(`Failed to fetch session: ${response.status}`);
  return response.json();
}

export async function getSessionHistory(
  sessionId: string,
  limit = 50,
  includeRuntime = false,
): Promise<HistoryMessage[]> {
  const response = await fetchWithAuth(
    `${API_URL}/api/sessions/${encodeURIComponent(sessionId)}/history?limit=${limit}&includeRuntime=${includeRuntime ? 'true' : 'false'}`
  );
  // Return empty array for 403/404 instead of throwing (session doesn't exist or not accessible)
  if (response.status === 403 || response.status === 404) {
    return [];
  }
  if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
  const data = await response.json();
  return data.messages || [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete session: ${response.status}`);
}


export async function renameSession(sessionId: string, name: string): Promise<Session> {
  const response = await fetchWithAuth(`${API_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Failed to rename session: ${response.status}`);
  return response.json();
}


// ============ ROOM API ============

export async function getRooms(): Promise<Room[]> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms`);
  if (!response.ok) throw new Error(`Failed to fetch rooms: ${response.status}`);
  const data = await response.json();
  return data.rooms || [];
}

export async function createRoom(data: {
  name: string;
  agent_ids: string[];
  settings?: Record<string, unknown>;
}): Promise<Room> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to create room: ${response.status}`);
  return response.json();
}

export async function getRoom(roomId: string): Promise<Room> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}`);
  if (!response.ok) throw new Error(`Failed to fetch room: ${response.status}`);
  return response.json();
}

export async function updateRoom(
  roomId: string,
  data: { name?: string; settings?: Record<string, unknown> },
): Promise<Room> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to update room: ${response.status}`);
  return response.json();
}

export async function deleteRoom(roomId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Failed to delete room: ${response.status}`);
}

export async function getRoomAgents(roomId: string): Promise<RoomAgent[]> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/agents`);
  if (!response.ok) throw new Error(`Failed to fetch room agents: ${response.status}`);
  const data = await response.json();
  return data.agents || [];
}

export async function addRoomAgent(
  roomId: string,
  data: {
    agent_id: string;
    response_mode?: 'mention' | 'always' | 'manual';
    role?: 'participant' | 'moderator' | 'observer';
  },
): Promise<RoomAgent> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/agents`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to add room agent: ${response.status}`);
  return response.json();
}

export async function updateRoomAgent(
  roomId: string,
  agentId: string,
  data: {
    response_mode?: 'mention' | 'always' | 'manual';
    role?: 'participant' | 'moderator' | 'observer';
  },
): Promise<RoomAgent> {
  const response = await fetchWithAuth(
    `${API_URL}/api/rooms/${encodeURIComponent(roomId)}/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) throw new Error(`Failed to update room agent: ${response.status}`);
  return response.json();
}

export async function removeRoomAgent(roomId: string, agentId: string): Promise<void> {
  const response = await fetchWithAuth(
    `${API_URL}/api/rooms/${encodeURIComponent(roomId)}/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'DELETE',
    },
  );
  if (!response.ok) throw new Error(`Failed to remove room agent: ${response.status}`);
}

export async function getRoomHistory(
  roomId: string,
  limit = 100,
  includeRuntime = false,
): Promise<RoomMessage[]> {
  const response = await fetchWithAuth(
    `${API_URL}/api/rooms/${encodeURIComponent(roomId)}/history?limit=${limit}&includeRuntime=${includeRuntime ? 'true' : 'false'}`,
  );
  if (response.status === 403 || response.status === 404) {
    return [];
  }
  if (!response.ok) throw new Error(`Failed to fetch room history: ${response.status}`);
  const data = await response.json();
  return data.messages || [];
}

export async function sendRoomMessage(
  roomId: string,
  data: { message: string; mention_agents?: string[]; game_context?: GameContext | undefined },
): Promise<RoomChatResponsePayload> {
  const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/chat?stream=0`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Failed to send room message: ${response.status}`);
  return response.json();
}


// ============ CHAT API ============

const AVATAR_TAG_REGEX = /\[(?:mood|intent|energy|move|game):[^\]]*\]/gi;

function stripAvatarTagsRaw(text: string): string {
  return text.replace(AVATAR_TAG_REGEX, '');
}

function stripTrailingPartialTag(text: string): string {
  return text.replace(/\[(?:mood|intent|energy|move|game):[^\]]*$/i, '');
}

export function stripAvatarTagsStreaming(text: string): string {
  if (!text) return '';
  const cleaned = stripAvatarTagsRaw(text);
  return stripTrailingPartialTag(cleaned);
}

export function stripAvatarTags(text: string): string {
  if (!text) return '';
  return stripAvatarTagsStreaming(text).trim();
}

interface CompactionInfo {
  compacted: boolean;
  messages_before?: number;
  messages_deleted?: number;
  messages_kept?: number;
  summary_chars?: number;
  error?: string;
}

interface StreamResponse {
  response?: string;
  session_id?: string;
  processing_ms?: number;
  model?: string;
  behavior?: {
    intent?: string | null;
    mood?: string | null;
    mood_intensity?: number;
    energy?: string | null;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface EmotionDebug {
  triggers: [string, number][];
  context_block: string | null;
  snapshot?: SoulMoodSnapshot | null;
}

export type { CompactionInfo, StreamResponse };

export async function streamChat(
  message: string,
  onChunk: (chunk: string) => void,
  onAvatar: (data: AvatarCommand) => void,
  onDone: (data: StreamResponse) => void,
  onError: (error: Error) => void,
  options?: {
    signal?: AbortSignal;
    gameContext?: GameContext;
    runtimeTrigger?: boolean;
    onCompaction?: (data: CompactionInfo) => void;
    onEmotion?: (data: EmotionDebug) => void;
  }
): Promise<void> {
  try {
    const response = await fetchWithAuth(`${API_URL}/api/chat?stream=1`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        game_context: options?.gameContext ?? undefined,
        runtime_trigger: options?.runtimeTrigger ?? undefined,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType: string | null = null;
    let fullContent = '';
    let receivedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === '[DONE]') {
            currentEventType = null;
            continue;
          }

          try {
            const data = JSON.parse(dataStr);

            if (currentEventType === 'avatar') {
              onAvatar(data);
              currentEventType = null;
              continue;
            }

            if (currentEventType === 'compaction') {
              options?.onCompaction?.(data);
              currentEventType = null;
              continue;
            }

            if (currentEventType === 'emotion') {
              options?.onEmotion?.(data);
              currentEventType = null;
              continue;
            }

            if (data.error) throw new Error(data.error);

            if (data.content) {
              fullContent += data.content;
              onChunk(data.content);
            }

            if (data.done) {
              receivedDone = true;
              onDone({
                response: data.response || stripAvatarTags(fullContent),
                session_id: data.session_id,
                processing_ms: data.processing_ms,
                model: data.model,
                behavior: data.behavior,
                usage: data.usage,
              });
            }
          } catch (e) {
            if ((e as Error).message !== 'Unexpected end of JSON input') {
              console.error('SSE parse error:', e);
            }
          }
          currentEventType = null;
        }
      }
    }

    // Stream ended without a done event — flush partial content so UI isn't stuck
    if (!receivedDone && fullContent) {
      onDone({
        response: stripAvatarTags(fullContent),
        session_id: '',
        processing_ms: 0,
        model: '',
        behavior: undefined,
        usage: undefined,
      });
    }
  } catch (error) {
    onError(error as Error);
  }
}


export type RoomStreamEvent =
  | { type: 'agent_start'; agent_id: string; agent_name: string }
  | { type: 'content'; agent_id: string; content: string }
  | {
      type: 'agent_done';
      agent_id: string;
      agent_name: string;
      behavior?: RoomMessageBehavior;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
      processing_ms?: number;
      message: RoomMessage;
    }
  | { type: 'agent_error'; agent_id: string; agent_name: string; error: string }
  | { type: 'done'; room_id: string };

export async function streamRoomChat(
  roomId: string,
  data: { message: string; mention_agents?: string[]; game_context?: GameContext | undefined },
  onEvent: (event: RoomStreamEvent) => void,
  onError: (error: Error) => void,
  options?: {
    signal?: AbortSignal;
  },
): Promise<void> {
  try {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/chat?stream=1`, {
      method: 'POST',
      body: JSON.stringify(data),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Room chat API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr || dataStr === '[DONE]') {
          currentEventType = null;
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error && currentEventType !== 'agent_error') {
            throw new Error(parsed.error);
          }

          if (currentEventType === 'agent_start') {
            onEvent({
              type: 'agent_start',
              agent_id: parsed.agent_id,
              agent_name: parsed.agent_name,
            });
            currentEventType = null;
            continue;
          }

          if (currentEventType === 'agent_done') {
            onEvent({
              type: 'agent_done',
              agent_id: parsed.agent_id,
              agent_name: parsed.agent_name,
              behavior: parsed.behavior,
              usage: parsed.usage,
              processing_ms: parsed.processing_ms,
              message: parsed.message,
            });
            currentEventType = null;
            continue;
          }

          if (currentEventType === 'agent_error') {
            onEvent({
              type: 'agent_error',
              agent_id: parsed.agent_id,
              agent_name: parsed.agent_name,
              error: parsed.error || 'Room chat failed',
            });
            currentEventType = null;
            continue;
          }

          if (parsed.done) {
            onEvent({ type: 'done', room_id: parsed.room_id });
            currentEventType = null;
            continue;
          }

          if (parsed.content && parsed.agent_id) {
            onEvent({
              type: 'content',
              agent_id: parsed.agent_id,
              content: parsed.content,
            });
          }
        } catch (e) {
          if ((e as Error).message !== 'Unexpected end of JSON input') {
            onError(e as Error);
          }
        }
        currentEventType = null;
      }
    }
  } catch (error) {
    onError(error as Error);
  }
}


// ============ MEMORY API ============

export async function getMemory(): Promise<string> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    if (response.status === 404) return '';
    throw new Error(`Failed to fetch memory: ${response.status}`);
  }
  return response.text();
}


export interface MemoryListResponse {
  workspace: string;
  files: string[];
}


export async function listMemoryFiles(): Promise<string[]> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory/list?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    throw new Error(`Failed to list memory files: ${response.status}`);
  }
  const data: MemoryListResponse = await response.json();
  return data.files || [];
}


export async function getMemoryFile(filename: string): Promise<string> {
  const { currentAgent } = useUserStore.getState();
  if (!currentAgent?.id) {
    throw new Error('No agent selected');
  }
  const response = await fetchWithAuth(`${API_URL}/api/memory/${encodeURIComponent(filename)}?agent_id=${encodeURIComponent(currentAgent.id)}`);
  if (!response.ok) {
    if (response.status === 404) return '';
    throw new Error(`Failed to fetch memory file: ${response.status}`);
  }
  const data = await response.json();
  return data.content || '';
}


export default {
  fetchWithAuth,
  getUsers,
  getUser,
  getUserAgents,
  getGameCatalog,
  getGameCatalogItem,
  fetchManageGames,
  createManageGame,
  updateManageGame,
  deactivateManageGame,
  fetchAgentGames,
  updateAgentGameConfig,
  deleteAgentGameConfig,
  getSessions,
  createSession,
  getSession,
  getSessionHistory,
  deleteSession,
  renameSession,
  getRooms,
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
  getRoomAgents,
  addRoomAgent,
  updateRoomAgent,
  removeRoomAgent,
  getRoomHistory,
  sendRoomMessage,
  streamChat,
  streamRoomChat,
  stripAvatarTags,
  stripAvatarTagsStreaming,
  getMemory,
  listMemoryFiles,
  getMemoryFile,
};
