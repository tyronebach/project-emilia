/**
 * Emilia Web App - Configuration
 * API URLs, auth tokens, storage keys, constants
 */

// API Configuration
export const API_URL = '';  // Empty string = relative to current origin
export const AUTH_TOKEN = 'emilia-dev-token-2026';

// Session storage keys
export const SESSION_STORAGE_KEY = 'emilia-session-id';
export const HIDDEN_SESSIONS_KEY = 'emilia-hidden-sessions';
export const SESSION_NAMES_KEY = 'emilia-session-names';
export const DEFAULT_SESSION_ID = 'thai-emilia-main';

// TTS storage key
export const TTS_STORAGE_KEY = 'emilia_tts_enabled';

// Feature flags
export const STREAMING_ENABLED = true;

// Avatar command patterns
export const MOOD_PATTERN = /\[MOOD:[^\]]+\]/g;
export const ANIM_PATTERN = /\[ANIM:[^\]]+\]/g;
