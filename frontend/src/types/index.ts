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

export interface Session {
  session_id?: string;
  session_key?: string;
  display_id?: string;
  updated_at?: number;
  model?: string;
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

export interface User {
  id: string;
  display_name: string;
  avatars?: string[];
  avatar_count?: number;
  default_avatar?: string;
}

export interface Avatar {
  id: string;
  display_name: string;
  agent_id: string;
  owner: string;
  vrm_model: string;
  voice_id: string;
}

export interface SessionInfo {
  session_id: string;
  agent_id: string;
}
