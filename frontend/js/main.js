/**
 * Emilia Web App - Main Entry Point
 * Version 4.0 - ES6 Modular Architecture
 * 
 * Initializes all modules and wires up event handlers
 */

import { DEFAULT_SESSION_ID } from './config.js';
import * as state from './state.js';
import { 
    initElements, 
    getElements, 
    log, 
    setState, 
    showSuccess, 
    showWarning,
    clearConversationUI
} from './ui.js';
import { 
    initMicrophone, 
    startRecording, 
    stopRecording, 
    checkHealth,
    setTranscriptionCallback
} from './audio.js';
import { 
    loadVoices, 
    applyTtsUiState, 
    stopGeneration, 
    replayMessage 
} from './tts.js';
import { 
    loadSessionHistory, 
    loadSessionsList, 
    getSessionDisplayName,
    setSessionName,
    hideSession,
    unhideSession,
    getHiddenSessions
} from './session.js';
import { getAgentResponse, sendTextMessage } from './chat.js';
import { initDashboard } from './dashboard.js';

// Wire up transcription callback
setTranscriptionCallback(getAgentResponse);

// Initialize on DOM ready
window.addEventListener('load', async () => {
    // Initialize DOM elements
    const elements = initElements();
    const {
        pttButton,
        textInput,
        sendButton,
        stopButton,
        voiceSelector,
        ttsToggle,
        sessionSelector,
        refreshSessionsButton,
        newSessionButton,
        deleteSessionButton,
        renameSessionButton,
        debugToggle,
        debugPanel,
        clearDebug,
        debugLog,
        conversationHistoryEl,
        conversationEmpty,
        sessionsHint
    } = elements;
    
    log('Emilia web app v4.0 (ES6 modules) initialized');
    log('Browser info', {
        userAgent: navigator.userAgent,
        mediaDevices: !!navigator.mediaDevices,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    });
    log('Session ID', { sessionId: state.sessionId });

    // Enable text input (works without mic)
    if (textInput) textInput.disabled = false;
    if (sendButton) sendButton.disabled = false;

    // Auto-focus text input
    if (textInput) {
        textInput.focus();
        log('Text input focused');
    }

    // Check API health
    await checkHealth();
    
    // Load sessions list
    await loadSessionsList({ sessionSelector, sessionsHint });
    
    // Load chat history for current session
    await loadSessionHistory(state.sessionId, { conversationHistoryEl, conversationEmpty });

    // Apply initial TTS state
    applyTtsUiState();

    // Load voices if TTS enabled
    if (state.ttsEnabled) {
        await loadVoices();
    } else {
        log('TTS disabled on load - skipping voice load');
    }

    // Initialize microphone
    await initMicrophone();

    // ========================================
    // EVENT HANDLERS
    // ========================================

    // PTT Button events
    if (pttButton) {
        pttButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (!state.micInitialized) {
                initMicrophone();
            } else {
                startRecording();
            }
        });

        pttButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            if (state.micInitialized) {
                stopRecording();
            }
        });

        pttButton.addEventListener('mouseleave', (e) => {
            if (state.isRecording) {
                stopRecording();
            }
        });

        // Touch support
        pttButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!state.micInitialized) {
                initMicrophone();
            } else {
                startRecording();
            }
        });

        pttButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (state.micInitialized) {
                stopRecording();
            }
        });
    }

    // Keyboard support (Spacebar) - but not when typing
    document.addEventListener('keydown', (e) => {
        if (e.target === textInput) return;
        if (e.code === 'Space' && !state.isRecording && !state.isProcessing && state.micInitialized) {
            e.preventDefault();
            startRecording();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.target === textInput) return;
        if (e.code === 'Space' && state.isRecording) {
            e.preventDefault();
            stopRecording();
        }
    });

    // Stop button
    if (stopButton) {
        stopButton.addEventListener('click', stopGeneration);
    }

    // Text input events
    if (sendButton) {
        sendButton.addEventListener('click', sendTextMessage);
    }

    if (textInput) {
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendTextMessage();
            }
        });

        textInput.addEventListener('focus', () => {
            if (sendButton) sendButton.disabled = false;
        });
    }

    // Voice selector
    if (voiceSelector) {
        voiceSelector.addEventListener('change', (e) => {
            state.setSelectedVoice(e.target.value);
            log('Voice changed', { voice: state.selectedVoice });
        });
    }

    // TTS toggle
    if (ttsToggle) {
        ttsToggle.addEventListener('change', async (e) => {
            state.setTtsEnabled(!!e.target.checked);
            log('TTS toggle changed', { ttsEnabled: state.ttsEnabled });
            applyTtsUiState();
            if (state.ttsEnabled) {
                await loadVoices();
            }
        });
    }

    // Session selector
    if (sessionSelector) {
        sessionSelector.addEventListener('change', async (e) => {
            const value = e.target.value;
            if (value) {
                state.setSessionId(value);
                log('Session switched', { sessionId: state.sessionId });
                await loadSessionHistory(state.sessionId, { conversationHistoryEl, conversationEmpty });
                showSuccess(`Switched to session: ${getSessionDisplayName(state.sessionId)}`);
            }
        });
    }

    // Refresh sessions
    if (refreshSessionsButton) {
        refreshSessionsButton.addEventListener('click', async () => {
            await loadSessionsList({ sessionSelector, sessionsHint });
        });
    }

    // New session
    if (newSessionButton) {
        newSessionButton.addEventListener('click', () => {
            if (confirm('Start new session? This will clear Emilia\'s memory of this conversation.')) {
                state.setSessionId('thai-' + Date.now());
                state.setConversationHistory([]);
                clearConversationUI();
                log('New session started', { sessionId: state.sessionId });
                loadSessionsList({ sessionSelector, sessionsHint });
                showSuccess(`New session started: ${state.sessionId}`);
            }
        });
    }

    // Delete session
    if (deleteSessionButton) {
        deleteSessionButton.addEventListener('click', () => {
            if (state.sessionId === DEFAULT_SESSION_ID) {
                showWarning('Cannot delete the default session');
                return;
            }
            if (confirm(`Hide session "${getSessionDisplayName(state.sessionId)}" from the list?\n\nNote: This hides the session locally but doesn't delete server data.`)) {
                hideSession(state.sessionId);
                state.setSessionId(DEFAULT_SESSION_ID);
                state.setConversationHistory([]);
                clearConversationUI();
                loadSessionsList({ sessionSelector, sessionsHint });
                showSuccess('Session hidden. Switched to default session.');
                log('Session hidden', { hidden: state.sessionId });
            }
        });
    }

    // Rename session
    if (renameSessionButton) {
        renameSessionButton.addEventListener('click', () => {
            const currentName = getSessionDisplayName(state.sessionId);
            const newName = prompt(`Rename session "${currentName}" to:`, currentName === state.sessionId ? '' : currentName);
            if (newName !== null) {
                setSessionName(state.sessionId, newName);
                loadSessionsList({ sessionSelector, sessionsHint });
                if (newName.trim()) {
                    showSuccess(`Session renamed to: ${newName}`);
                } else {
                    showSuccess('Session name reset to default');
                }
                log('Session renamed', { sessionId: state.sessionId, newName });
            }
        });
    }

    // Debug toggle
    if (debugToggle && debugPanel) {
        debugToggle.addEventListener('click', () => {
            const isHidden = debugPanel.style.display === 'none' || !debugPanel.style.display;
            debugPanel.style.display = isHidden ? 'block' : 'none';
            log(isHidden ? 'Debug panel opened' : 'Debug panel closed');
        });
    }

    // Clear debug log
    if (clearDebug && debugLog) {
        clearDebug.addEventListener('click', () => {
            debugLog.textContent = '';
            log('Debug log cleared');
        });
    }

    // Initialize dashboard mode if present
    initDashboard();
});

// Expose debug functions globally
window.retryMicrophone = initMicrophone;
window.hideSession = hideSession;
window.unhideSession = unhideSession;
window.setSessionName = setSessionName;
window.getHiddenSessions = getHiddenSessions;

log('Debug: window.retryMicrophone(), hideSession(), unhideSession(), setSessionName() available');
log('ES6 modules loaded');
