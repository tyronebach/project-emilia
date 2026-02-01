/**
 * Shared type definitions for Emilia frontend
 */

export type AppStatus = 'ready' | 'recording' | 'thinking' | 'speaking' | 'error';

export interface MessageMeta {
  processing_ms?: number;
  model?: string;
  streaming?: boolean;
  error?: boolean;
  source?: 'text' | 'voice';
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

export interface Session {
  session_id: string;
  [key: string]: unknown;
}

export interface Memory {
  content: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface AvatarCommand {
  mood?: string;
  intensity?: number;
  animation?: string;
}
