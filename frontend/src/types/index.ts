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

export interface MessageMeta {
  processing_ms?: number;
  model?: string;
  streaming?: boolean;
  error?: boolean;
  source?: 'text' | 'voice';
  behavior?: BehaviorData;
  usage?: TokenUsage;
  audio_base64?: string;  // Stored TTS audio for replay
}

export interface Message {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  meta: MessageMeta;
}

export interface AvatarState {
  intent?: string;
  mood?: string;
  intensity?: number;
  energy?: string;
}

export interface AvatarCommand {
  intent?: string;
  mood?: string;
  intensity?: number;
  energy?: string;
}

// Re-export from api.ts for convenience
export type { User, Agent, Session } from '../utils/api';
