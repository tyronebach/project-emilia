/**
 * Shared type definitions for Emilia frontend
 */

export type AppStatus = 'initializing' | 'ready' | 'recording' | 'processing' | 'thinking' | 'speaking' | 'error';

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface MessageMeta {
  processing_ms?: number;
  model?: string;
  streaming?: boolean;
  error?: boolean;
  source?: 'text' | 'voice';
  moods?: Array<{ mood: string; intensity: number }>;
  animations?: string[];
  usage?: TokenUsage;
}

export interface Message {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  meta: MessageMeta;
}

export interface AvatarState {
  mood?: string;
  intensity?: number;
  animation?: string;
}

export interface AvatarCommand {
  mood?: string;
  intensity?: number;
  animation?: string;
}

// Re-export from api.ts for convenience
export type { User, Agent, Session } from '../utils/api';
