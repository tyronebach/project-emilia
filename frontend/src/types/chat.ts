/** Canonical agent status — shared across all chat stores and components. */
export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'speaking';

/**
 * Unified chat message — canonical type used in the store and all components.
 *
 * Closely mirrors the API `RoomMessage` format (sender_type, timestamp as
 * epoch seconds) with UI-only extras (`meta` for TTS audio, streaming flag).
 */
export interface ChatMessage {
  id: string;
  room_id: string;
  sender_type: 'user' | 'agent' | 'system';
  sender_id: string;
  sender_name: string;
  content: string;
  timestamp: number;         // epoch seconds (matches API)
  origin?: string | null;
  model?: string | null;
  processing_ms?: number | null;
  behavior?: ChatMessageBehavior;
  /** UI-only metadata — TTS audio, streaming flag, source indicator. */
  meta?: ChatMessageMeta;
}

export interface ChatMessageBehavior {
  intent?: string | null;
  mood?: string | null;
  mood_intensity?: number;
  energy?: string | null;
  move?: string | null;
  game_action?: string | null;
}

export interface ChatMessageMeta {
  streaming?: boolean;
  error?: boolean;
  source?: 'text' | 'voice';
  audio_base64?: string;
  /** Set on agent_error messages — allows UI to retry for the specific agent. */
  failedAgentId?: string;
}

/**
 * Convert an API RoomMessage into a ChatMessage.
 */
export function roomMessageToChatMessage(msg: {
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
  behavior?: ChatMessageBehavior | Record<string, unknown>;
}): ChatMessage {
  return {
    id: msg.id,
    room_id: msg.room_id,
    sender_type: msg.sender_type,
    sender_id: msg.sender_id,
    sender_name: msg.sender_name,
    content: msg.content,
    timestamp: msg.timestamp,
    origin: msg.origin,
    model: msg.model,
    processing_ms: msg.processing_ms,
    behavior: msg.behavior as ChatMessageBehavior | undefined,
  };
}

let _chatMessageNonce = 0;

/** Generate a locally-unique ID for optimistic messages. */
export function localMessageId(prefix = 'local'): string {
  _chatMessageNonce += 1;
  return `${prefix}-${Date.now()}-${_chatMessageNonce}`;
}
