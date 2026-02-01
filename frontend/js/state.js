/**
 * Emilia Web App - Global State Management
 * Centralized state with getters/setters
 */

import { SESSION_STORAGE_KEY, DEFAULT_SESSION_ID, TTS_STORAGE_KEY } from './config.js';

// Recording state
export let mediaRecorder = null;
export let audioChunks = [];
export let isRecording = false;
export let isProcessing = false;
export let stream = null;
export let micInitialized = false;

// Conversation state
export let conversationHistory = [];

// Voice state
export let selectedVoice = 'rachel';

// TTS state (load from localStorage)
export let ttsEnabled = false;
try {
    ttsEnabled = localStorage.getItem(TTS_STORAGE_KEY) === 'true';
} catch (e) {
    // ignore
}

// Session ID (load from localStorage or use default)
export let sessionId = (function() {
    try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored && stored.trim()) {
            return stored;
        }
    } catch (e) {
        // ignore
    }
    return DEFAULT_SESSION_ID;
})();

// Persist initial session ID
try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
} catch (e) {
    // ignore
}

// Abort controller for cancelling requests
export let currentAbortController = null;
export let currentAudio = null;

// Audio cache - stores generated audio URLs by message text hash
export const audioCache = new Map();

// Dashboard state
export let dashboardStats = {
    messageCount: 0,
    totalTokens: 0,
    totalLatency: 0,
    latencyCount: 0,
};

// Avatar state (last mood/animation for display)
export let lastAvatarState = null;

export let memoryRefreshInterval = null;
export let currentMemoryTab = 'main';
export let currentMemoryFile = null;

// State setters
export function setMediaRecorder(val) { mediaRecorder = val; }
export function setAudioChunks(val) { audioChunks = val; }
export function setIsRecording(val) { isRecording = val; }
export function setIsProcessing(val) { isProcessing = val; }
export function setStream(val) { stream = val; }
export function setMicInitialized(val) { micInitialized = val; }
export function setConversationHistory(val) { conversationHistory = val; }
export function setSelectedVoice(val) { selectedVoice = val; }
export function setTtsEnabled(val) { 
    ttsEnabled = val;
    try {
        localStorage.setItem(TTS_STORAGE_KEY, val ? 'true' : 'false');
    } catch (e) {
        // ignore
    }
}
export function setSessionId(val) { 
    sessionId = val;
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, val);
    } catch (e) {
        // ignore
    }
}
export function setCurrentAbortController(val) { currentAbortController = val; }
export function setCurrentAudio(val) { currentAudio = val; }
export function setMemoryRefreshInterval(val) { memoryRefreshInterval = val; }
export function setCurrentMemoryTab(val) { currentMemoryTab = val; }
export function setCurrentMemoryFile(val) { currentMemoryFile = val; }
export function setLastAvatarState(val) { lastAvatarState = val; }

// Clear audio chunks
export function clearAudioChunks() { audioChunks = []; }
export function pushAudioChunk(chunk) { audioChunks.push(chunk); }
