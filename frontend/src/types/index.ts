/**
 * Shared type definitions for Emilia frontend
 */

export type AppStatus = 'initializing' | 'ready' | 'recording' | 'processing' | 'thinking' | 'speaking' | 'error';

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface BehaviorData {
  intent?: string | null;
  mood?: string | null;
  mood_intensity?: number;
  energy?: string | null;
}

export type MessageOrigin = 'user' | 'assistant' | 'game_runtime' | 'system';

export interface MessageMeta {
  processing_ms?: number;
  model?: string;
  streaming?: boolean;
  error?: boolean;
  source?: 'text' | 'voice';
  origin?: MessageOrigin;
  behavior?: BehaviorData;
  usage?: TokenUsage;
  audio_base64?: string;  // Stored TTS audio for replay
}

export interface Message {
  id: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  meta: MessageMeta;
}

export interface AvatarCommand {
  intent?: string;
  mood?: string;
  intensity?: number;
  energy?: string;
  move?: string;
  game_action?: string;
}

export type AvatarState = AvatarCommand;

export const STATUS_COLORS: Record<AppStatus, string> = {
  initializing: 'bg-warning animate-pulse',
  ready: 'bg-success',
  recording: 'bg-error animate-pulse',
  processing: 'bg-warning animate-pulse',
  thinking: 'bg-warning animate-pulse',
  speaking: 'bg-accent animate-pulse',
  error: 'bg-error',
};

// Re-export from api.ts for convenience
export type { User, Agent, Session, HistoryMessage } from '../utils/api';
