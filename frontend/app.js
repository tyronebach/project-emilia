/**
 * Emilia Web App - Frontend Logic v3.0
 * Push-to-talk + text input with conversation history
 * TTS integration with auto-play voice responses
 * Avatar display preparation (VRM/Live2D)
 */

// Configuration
const API_URL = '';  // Empty string = relative to current origin

const AUTH_TOKEN = 'emilia-dev-token-2026';

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isProcessing = false;
let stream = null;
let micInitialized = false;
let conversationHistory = [];
let selectedVoice = 'rachel';
let sessionId = 'web-user-' + Date.now();

// Streaming configuration
const STREAMING_ENABLED = true;  // Set to false to disable streaming

// Abort controller for cancelling requests
let currentAbortController = null;
let currentAudio = null;  // Track currently playing audio

// TTS toggle (default OFF)
const TTS_STORAGE_KEY = 'emilia_tts_enabled';
let ttsEnabled = false;
try {
    ttsEnabled = localStorage.getItem(TTS_STORAGE_KEY) === 'true';
} catch (e) {
    // ignore
}


// DOM elements
const pttButton = document.getElementById('pttButton');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const conversationContainer = document.getElementById('conversationContainer');
const conversationEmpty = document.getElementById('conversationEmpty');
const conversationHistoryEl = document.getElementById('conversationHistory');
const debugPanel = document.getElementById('debugPanel');
const debugLog = document.getElementById('debugLog');
const clearButton = document.getElementById('clearButton');
const debugToggle = document.getElementById('debugToggle');
const clearDebug = document.getElementById('clearDebug');
const textInput = document.getElementById('textInput');
const sendButton = document.getElementById('sendButton');
const voiceSelector = document.getElementById('voiceSelector');
const ttsToggle = document.getElementById('ttsToggle');
const sessionSelector = document.getElementById('sessionSelector');
const sessionsHint = document.getElementById('sessionsHint');
const refreshSessionsButton = document.getElementById('refreshSessions');
const newSessionButton = document.getElementById('newSessionButton');
const stopButton = document.getElementById('stopButton');

// ========================================
// NON-BLOCKING NOTIFICATION SYSTEM
// ========================================

/**
 * Show a non-blocking toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'error' | 'warning' | 'success' | 'info'
 * @param {number} duration - Auto-dismiss after ms (0 = no auto-dismiss)
 */
function showNotification(message, type = 'info', duration = 5000) {
    // Create container if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 360px;
        `;
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const colors = {
        error: { bg: '#dc2626', border: '#ef4444' },
        warning: { bg: '#d97706', border: '#f59e0b' },
        success: { bg: '#059669', border: '#10b981' },
        info: { bg: '#4f46e5', border: '#6366f1' }
    };
    const { bg, border } = colors[type] || colors.info;

    notification.style.cssText = `
        background: ${bg};
        border: 1px solid ${border};
        border-radius: 8px;
        padding: 12px 16px;
        color: white;
        font-size: 0.9rem;
        line-height: 1.4;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease-out;
        cursor: pointer;
        word-wrap: break-word;
    `;

    notification.textContent = message;

    // Click to dismiss
    notification.onclick = () => {
        notification.style.animation = 'slideOut 0.2s ease-in forwards';
        setTimeout(() => notification.remove(), 200);
    };

    container.appendChild(notification);

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.2s ease-in forwards';
                setTimeout(() => notification.remove(), 200);
            }
        }, duration);
    }

    // Add animation styles if not present
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    log(`Notification [${type}]: ${message}`);
}

/**
 * Show error notification (for user-facing errors)
 */
function showError(message) {
    showNotification(message, 'error', 8000);
}

/**
 * Show warning notification
 */
function showWarning(message) {
    showNotification(message, 'warning', 6000);
}

/**
 * Show success notification
 */
function showSuccess(message) {
    showNotification(message, 'success', 4000);
}

async function loadSessionsList() {
    if (!sessionSelector) return;
    try {
        const response = await fetch(`${API_URL}/api/sessions/list`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to load sessions: ${response.status}`);
        }
        const data = await response.json();
        const sessions = data.sessions || [];

        if (sessionsHint) {
            const err = data.error;
            if (err) {
                sessionsHint.style.display = '';
                sessionsHint.textContent = `Sessions limited: ${err}`;
            } else {
                sessionsHint.style.display = 'none';
                sessionsHint.textContent = '';
            }
        }

        // Always include current session
        const existing = new Set(sessions.map(s => s.display_id));
        if (!existing.has(sessionId)) {
            sessions.unshift({ display_id: sessionId, session_key: sessionId });
        }

        sessionSelector.innerHTML = sessions
            .map(s => {
                const value = s.display_id;
                const selected = value === sessionId ? 'selected' : '';
                return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(value)}</option>`;
            })
            .join('');

        log('Sessions loaded', { count: sessions.length });
    } catch (e) {
        log('Failed to load sessions', { error: e.message });
        if (sessionsHint) {
            sessionsHint.style.display = '';
            sessionsHint.textContent = 'Sessions list unavailable';
        }
        sessionSelector.innerHTML = `<option value="${escapeHtml(sessionId)}" selected>${escapeHtml(sessionId)}</option>`;
    }
}

if (refreshSessionsButton) {
    refreshSessionsButton.addEventListener('click', async () => {
        await loadSessionsList();
    });
}

if (sessionSelector) {
    sessionSelector.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value) {
            sessionId = value;
            log('Session switched', { sessionId });
        }
    });
}


// Logging
function log(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    let logEntry = `[${timestamp}] ${message}`;
    if (data) {
        logEntry += '\n' + JSON.stringify(data, null, 2);
    }
    if (debugLog) {
        debugLog.textContent = logEntry + '\n\n' + debugLog.textContent;
    }
    console.log(message, data);
}

// State management
function setState(state) {
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${state}`;
    }

    // Helper to safely set PTT text (only if element exists)
    const setPttText = (text) => {
        const pttText = pttButton?.querySelector('.ptt-text');
        if (pttText) {
            pttText.textContent = text;
        }
    };

    // Helper to safely set status text
    const setStatusText = (text) => {
        if (statusText) {
            statusText.textContent = text;
        }
    };

    // Show/hide stop button based on state
    const showStopButton = (state === 'thinking' || state === 'speaking');
    if (stopButton) {
        stopButton.style.display = showStopButton ? 'flex' : 'none';
    }
    // Hide PTT button when stop button is shown
    if (pttButton) {
        pttButton.style.display = showStopButton ? 'none' : 'flex';
    }

    switch(state) {
        case 'initializing':
            setStatusText('Initializing microphone...');
            if (pttButton) pttButton.className = 'ptt-button-compact';
            setPttText('Initializing...');
            if (pttButton) pttButton.disabled = true;
            break;
        case 'ready':
            setStatusText('Ready');
            if (pttButton) pttButton.className = 'ptt-button-compact';
            setPttText('Hold to Talk');
            if (pttButton) pttButton.disabled = false;
            break;
        case 'recording':
            setStatusText('Recording...');
            if (pttButton) pttButton.className = 'ptt-button-compact recording';
            setPttText('Recording');
            break;
        case 'processing':
            setStatusText('Transcribing...');
            if (pttButton) pttButton.className = 'ptt-button-compact processing';
            setPttText('Processing');
            if (pttButton) pttButton.disabled = true;
            break;
        case 'thinking':
            setStatusText('Thinking...');
            if (pttButton) pttButton.className = 'ptt-button-compact thinking';
            setPttText('Thinking');
            if (pttButton) pttButton.disabled = true;
            break;
        case 'speaking':
            setStatusText('Speaking...');
            if (pttButton) pttButton.className = 'ptt-button-compact speaking';
            setPttText('Speaking');
            if (pttButton) pttButton.disabled = true;
            break;
        case 'error':
            setStatusText('Error - Click to retry');
            if (pttButton) pttButton.className = 'ptt-button-compact error';
            setPttText('Retry Microphone');
            if (pttButton) pttButton.disabled = false;
            break;
        case 'permission-denied':
            setStatusText('Microphone access denied');
            if (pttButton) pttButton.className = 'ptt-button-compact error';
            setPttText('Enable Microphone');
            if (pttButton) pttButton.disabled = false;
            break;
    }
}

// Stop generation function
function stopGeneration() {
    log('Stop button clicked');

    // Abort any pending fetch request
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
        log('Fetch request aborted');
    }

    // Stop any playing audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentAudio.src) {
            URL.revokeObjectURL(currentAudio.src);
        }
        currentAudio = null;
        log('Audio playback stopped');
    }

    // Reset state
    setState('ready');

    // Re-enable input controls
    if (textInput) textInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
}

// Stop button event listener
if (stopButton) {
    stopButton.addEventListener('click', stopGeneration);
}

// Add message to conversation history
function addMessage(role, content, meta = {}) {
    // Defensive check for required DOM elements
    if (!conversationHistoryEl) {
        console.error('conversationHistoryEl is null - cannot add message');
        log('Error: conversationHistoryEl is null');
        return;
    }

    const timestamp = new Date().toLocaleTimeString();

    const message = {
        role,
        content,
        timestamp,
        meta
    };

    conversationHistory.push(message);

    // Hide empty state if this is the first message
    if (conversationHistory.length === 1 && conversationEmpty) {
        conversationEmpty.style.display = 'none';
    }

    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const roleLabel = role === 'user' ? '👤 You' : '🤖 Emilia';

    let metaHtml = '';
    if (Object.keys(meta).length > 0) {
        const metaItems = [];
        if (meta.language) metaItems.push(`🌍 ${meta.language}`);
        if (meta.duration_ms) metaItems.push(`⏱️ ${meta.duration_ms}ms`);
        if (meta.processing_ms) metaItems.push(`🔄 ${meta.processing_ms}ms`);

        if (metaItems.length > 0) {
            metaHtml = `<div class="message-meta">${metaItems.join(' • ')}</div>`;
        }
    }

    // Add replay button for assistant messages
    let replayButtonHtml = '';
    if (role === 'assistant' && content && !content.startsWith('⚠️')) {
        replayButtonHtml = `
            <button class="replay-button" title="Replay voice" data-text="${escapeHtml(content).replace(/"/g, '&quot;')}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </button>
        `;
    }

    // Use container for assistant messages with replay button
    if (role === 'assistant' && replayButtonHtml) {
        messageEl.innerHTML = `
            <div class="message-header">
                <span class="message-role">${roleLabel}</span>
                <span class="message-timestamp">${timestamp}</span>
            </div>
            <div class="message-bubble-container">
                <div class="message-bubble">${escapeHtml(content || '')}</div>
                ${replayButtonHtml}
            </div>
            ${metaHtml}
        `;

        // Add click handler for replay button
        const replayBtn = messageEl.querySelector('.replay-button');
        if (replayBtn) {
            replayBtn.addEventListener('click', () => replayMessage(replayBtn, content));
        }
    } else {
        messageEl.innerHTML = `
            <div class="message-header">
                <span class="message-role">${roleLabel}</span>
                <span class="message-timestamp">${timestamp}</span>
            </div>
            <div class="message-bubble">${escapeHtml(content || '')}</div>
            ${metaHtml}
        `;
    }

    conversationHistoryEl.appendChild(messageEl);

    // Auto-scroll to bottom
    conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
}

// Replay message audio
async function replayMessage(buttonEl, text) {
    if (!text || !text.trim()) return;

    // Disable button and show playing state
    buttonEl.disabled = true;
    buttonEl.classList.add('playing');

    log('Replaying message', { textLength: text.length });

    try {
        const response = await fetch(`${API_URL}/api/speak`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_id: selectedVoice
            })
        });

        if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            buttonEl.disabled = false;
            buttonEl.classList.remove('playing');
            log('Replay complete');
        };

        audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            buttonEl.disabled = false;
            buttonEl.classList.remove('playing');
            log('Replay error');
        };

        await audio.play();

    } catch (error) {
        log('Replay error', { error: error.message });
        buttonEl.disabled = false;
        buttonEl.classList.remove('playing');
    }
}

// Clear conversation
function clearConversation() {
    if (conversationHistory.length === 0) return;
    
    if (confirm('Clear conversation history?')) {
        conversationHistory = [];
        conversationHistoryEl.innerHTML = '';
        conversationEmpty.style.display = 'flex';
        log('Conversation cleared');
    }
}

// HTML escape for safety
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Initialize microphone
async function initMicrophone() {
    setState('initializing');
    
    // Clean up existing stream if any
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    try {
        log('Requesting microphone access...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia not supported in this browser');
        }
        
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            } 
        });
        
        log('Microphone stream acquired', {
            tracks: stream.getTracks().length,
            active: stream.active
        });
        
        const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        
        let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        
        if (!selectedMimeType) {
            throw new Error('No supported audio MIME type found');
        }
        
        log('Creating MediaRecorder', { mimeType: selectedMimeType });
        
        mediaRecorder = new MediaRecorder(stream, { 
            mimeType: selectedMimeType,
            audioBitsPerSecond: 128000
        });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = handleRecordingStop;
        
        mediaRecorder.onerror = (event) => {
            log('MediaRecorder error', { error: event.error });
            setState('error');
        };
        
        micInitialized = true;
        setState('ready');
        log('Microphone ready ✓');
        
    } catch (error) {
        micInitialized = false;
        log('Microphone initialization failed', { 
            error: error.name,
            message: error.message
        });
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            setState('permission-denied');
            showError('Microphone access denied. Please allow microphone access in browser settings.');
        } else if (error.name === 'NotFoundError') {
            setState('error');
            showWarning('No microphone found. Please connect a microphone.');
        } else {
            setState('error');
            showError(`Microphone error: ${error.message}`);
        }
    }
}

// Start recording
function startRecording() {
    if (!micInitialized) {
        log('Cannot record: microphone not initialized');
        return;
    }
    
    if (isRecording || isProcessing) {
        log('Cannot record: already recording or processing');
        return;
    }
    
    audioChunks = [];
    
    try {
        mediaRecorder.start();
        isRecording = true;
        setState('recording');
        log('Recording started');
    } catch (error) {
        log('Recording start error', { error: error.message });
        isRecording = false;
        setState('error');
        showError(`Failed to start recording: ${error.message}`);
    }
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;
    
    try {
        mediaRecorder.stop();
        isRecording = false;
        log('Recording stopped');
    } catch (error) {
        log('Recording stop error', { error: error.message });
        isRecording = false;
        setState('error');
    }
}

// Handle recording completion
async function handleRecordingStop() {
    setState('processing');
    
    if (audioChunks.length === 0) {
        log('No audio data captured');
        setState('error');
        showWarning('No audio captured. Please try again.');
        return;
    }
    
    const mimeType = mediaRecorder.mimeType;
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const audioSize = (audioBlob.size / 1024).toFixed(1);
    
    log('Audio captured', { 
        size: `${audioSize}KB`, 
        type: mimeType,
        chunks: audioChunks.length
    });
    
    if (audioBlob.size === 0) {
        log('Audio blob is empty');
        setState('error');
        showWarning('Audio capture is empty. Please try again.');
        return;
    }
    
    try {
        await transcribeAudio(audioBlob);
    } catch (error) {
        log('Transcription error', { error: error.message });
        setState('error');
        showError(`Transcription failed: ${error.message}`);
    }
}

// Transcribe audio via API
async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    
    const extension = audioBlob.type.includes('webm') ? 'webm' : 
                     audioBlob.type.includes('ogg') ? 'ogg' : 
                     audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    
    formData.append('audio', audioBlob, `recording.${extension}`);
    
    log('Sending to API...', { 
        url: `${API_URL}/api/transcribe`,
        size: audioBlob.size
    });
    
    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/api/transcribe`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    const totalTime = Date.now() - startTime;
    
    log('Transcription complete', result);
    
    // Add user message to conversation
    const userMeta = {
        language: result.language,
        duration_ms: result.duration_ms,
        processing_ms: result.processing_ms
    };
    
    addMessage('user', result.text || '(no speech detected)', userMeta);
    
    // Get AI response
    if (result.text && result.text.trim()) {
        await getAgentResponse(result.text);
    } else {
        setState('ready');
    }
}

// Get agent response from chat API (with optional streaming)
async function getAgentResponse(message) {
    setState('thinking');

    log('Calling chat API...', { message, streaming: STREAMING_ENABLED });

    const startTime = Date.now();

    try {
        if (STREAMING_ENABLED) {
            // Streaming mode using SSE
            await getAgentResponseStreaming(message, startTime);
        } else {
            // Non-streaming mode (original behavior)
            await getAgentResponseNonStreaming(message, startTime);
        }
    } catch (error) {
        // Handle abort errors gracefully
        if (error.name === 'AbortError') {
            log('Request aborted by user');
            return;
        }

        log('Chat error', { error: error.message });

        addMessage('assistant', `⚠️ Error: ${error.message}`, {});

        setState('error');
        showError(`Chat failed: ${error.message}`);
    }
}

// Non-streaming response handler (original behavior)
async function getAgentResponseNonStreaming(message, startTime) {
    // Create abort controller for this request
    currentAbortController = new AbortController();

    const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            session_id: sessionId
        }),
        signal: currentAbortController.signal
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const totalTime = Date.now() - startTime;

    log('Agent response received', result);

    // Add assistant message to conversation
    const assistantMeta = {
        processing_ms: result.processing_ms
    };

    addMessage('assistant', result.response || '(no response)', assistantMeta);

    // Generate and play TTS audio (optional)
    if (result.response && result.response.trim()) {
        if (ttsEnabled) {
            await speakText(result.response);
        } else {
            log('TTS disabled - skipping /api/speak');
            setState('ready');
        }
    } else {
        setState('ready');
    }
}

// Streaming response handler using SSE
async function getAgentResponseStreaming(message, startTime) {
    // Create abort controller for this request
    currentAbortController = new AbortController();

    const response = await fetch(`${API_URL}/api/chat?stream=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            session_id: sessionId
        }),
        signal: currentAbortController.signal
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    // Create a placeholder message element for streaming
    const timestamp = new Date().toLocaleTimeString();
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-role">🤖 Emilia</span>
            <span class="message-timestamp">${timestamp}</span>
        </div>
        <div class="message-bubble-container">
            <div class="message-bubble"></div>
        </div>
    `;

    // Hide empty state if needed
    if (conversationHistory.length === 0 && conversationEmpty) {
        conversationEmpty.style.display = 'none';
    }

    conversationHistoryEl.appendChild(messageEl);
    const bubbleEl = messageEl.querySelector('.message-bubble');
    const bubbleContainer = messageEl.querySelector('.message-bubble-container');

    let fullContent = '';
    let processingMs = 0;
    let finalData = null;

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr || dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    if (data.content) {
                        fullContent += data.content;
                        // Strip avatar tags for display during streaming
                        bubbleEl.textContent = stripAvatarTags(fullContent);
                        // Auto-scroll
                        conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
                    }

                    if (data.done) {
                        finalData = data;
                        processingMs = data.processing_ms || (Date.now() - startTime);
                        
                        // Use clean response from server if available
                        if (data.response) {
                            bubbleEl.textContent = data.response;
                            fullContent = data.response;
                        }
                        
                        // Handle avatar commands
                        handleAvatarCommands(data.moods, data.animations);
                        
                        log('Streaming complete', {
                            response: data.response,
                            processing_ms: processingMs,
                            model: data.model
                        });
                    }
                } catch (e) {
                    if (e.message !== 'Unexpected end of JSON input') {
                        log('SSE parse error', { error: e.message, data: dataStr });
                    }
                }
            }
        }
    }

    // Use clean content (tags stripped)
    const cleanContent = finalData?.response || stripAvatarTags(fullContent);

    // Add replay button after streaming completes (if we have content)
    if (cleanContent && !cleanContent.startsWith('⚠️')) {
        const replayBtn = document.createElement('button');
        replayBtn.className = 'replay-button';
        replayBtn.title = 'Replay voice';
        replayBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        replayBtn.addEventListener('click', () => replayMessage(replayBtn, cleanContent));
        bubbleContainer.appendChild(replayBtn);
    }

    // Add to conversation history
    conversationHistory.push({
        role: 'assistant',
        content: cleanContent,
        timestamp: timestamp,
        meta: { processing_ms: processingMs }
    });

    // Add metadata display
    if (processingMs > 0) {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        metaEl.textContent = `🔄 ${processingMs}ms`;
        messageEl.appendChild(metaEl);
    }

    log('Agent response received (streaming)', {
        response: cleanContent.substring(0, 100) + '...',
        processing_ms: processingMs
    });

    // Generate and play TTS audio (optional)
    if (cleanContent && cleanContent.trim()) {
        if (ttsEnabled) {
            await speakText(cleanContent);
        } else {
            log('TTS disabled - skipping /api/speak');
            setState('ready');
        }
    } else {
        setState('ready');
    }
}

// Text-to-speech playback
async function speakText(text) {
    setState('speaking');

    if (!ttsEnabled) {
        log('TTS disabled - speakText() skipped');
        setState('ready');
        return;
    }

    log('Generating TTS...', { textLength: text.length, voice: selectedVoice });

    const startTime = Date.now();

    try {
        // Create abort controller for TTS request
        currentAbortController = new AbortController();

        const response = await fetch(`${API_URL}/api/speak`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_id: selectedVoice
            }),
            signal: currentAbortController.signal
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`TTS API error: ${response.status} - ${error}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const generationTime = Date.now() - startTime;
        log('TTS generated', {
            generationMs: generationTime,
            size: (audioBlob.size / 1024).toFixed(1) + 'KB'
        });

        // Create and play audio element
        const audio = new Audio(audioUrl);

        // Track current audio for stop functionality
        currentAudio = audio;

        // When audio finishes, clean up and set state back to ready
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            setState('ready');
            log('TTS playback complete');
        };

        // Handle audio errors
        audio.onerror = (e) => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            setState('ready');
            log('TTS playback error', { error: e });
        };

        // Play the audio
        await audio.play();

    } catch (error) {
        // Handle abort errors gracefully
        if (error.name === 'AbortError') {
            log('TTS request aborted');
            return;
        }
        log('TTS error', { error: error.message });
        setState('ready');
        // Don't alert for TTS errors - text is already shown
    }
}

// Check API health
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/api/health`);
        const health = await response.json();
        log('Health check', health);
        
        if (!health.stt_service.healthy) {
            log('Warning: STT service unhealthy');
        }
        if (!health.brain_service.healthy) {
            log('Warning: Brain service unhealthy (expected - health endpoint returns HTML)');
        }
    } catch (error) {
        log('Health check failed', { error: error.message });
    }
}

// Load available voices
async function loadVoices() {
    log('loadVoices() called', { voiceSelectorExists: !!voiceSelector });
    
    try {
        log('Fetching voices from API...');
        const response = await fetch(`${API_URL}/api/voices`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        
        log('Voices API response', { status: response.status, ok: response.ok });
        
        if (!response.ok) {
            throw new Error(`Failed to load voices: ${response.status}`);
        }
        
        const data = await response.json();
        log('Voices loaded', { count: data.voices.length, default: data.default });
        
        // Populate dropdown
        if (voiceSelector) {
            const optionsHtml = data.voices.map(v => 
                `<option value="${v.key}" ${v.key === data.default ? 'selected' : ''}>${v.name} - ${v.desc}</option>`
            ).join('');
            log('Setting voiceSelector innerHTML', { length: optionsHtml.length });
            voiceSelector.innerHTML = optionsHtml;
            selectedVoice = data.default;
            log('Voice selector populated successfully');
        } else {
            log('ERROR: voiceSelector element is null!');
        }
    } catch (error) {
        log('Failed to load voices', { error: error.message, stack: error.stack });
        // Set a fallback option
        if (voiceSelector) {
            voiceSelector.innerHTML = '<option value="rachel">Rachel (default)</option>';
        }
    }
}

function applyTtsUiState() {
    if (ttsToggle) {
        ttsToggle.checked = !!ttsEnabled;
    }
    if (voiceSelector) {
        voiceSelector.disabled = !ttsEnabled;
        if (!ttsEnabled) {
            voiceSelector.innerHTML = '<option value="rachel">(Voice off)</option>';
        }
    }
}

// Voice selector change
if (voiceSelector) {
    voiceSelector.addEventListener('change', (e) => {
        selectedVoice = e.target.value;
        log('Voice changed', { voice: selectedVoice });
    });
}

// TTS toggle
if (ttsToggle) {
    ttsToggle.addEventListener('change', async (e) => {
        ttsEnabled = !!e.target.checked;
        try {
            localStorage.setItem(TTS_STORAGE_KEY, ttsEnabled ? 'true' : 'false');
        } catch (err) {
            // ignore
        }
        log('TTS toggle changed', { ttsEnabled });

        applyTtsUiState();

        // If enabling, load voices immediately
        if (ttsEnabled) {
            await loadVoices();
        }
    });
}

// Apply initial UI state
applyTtsUiState();

// New session button
if (newSessionButton) {
    newSessionButton.addEventListener('click', () => {
        if (confirm('Start new session? This will clear Emilia\'s memory of this conversation.')) {
            sessionId = 'web-user-' + Date.now();
            conversationHistory = [];
            if (conversationHistoryEl) conversationHistoryEl.innerHTML = '';
            if (conversationEmpty) conversationEmpty.style.display = 'flex';
            log('New session started', { sessionId });
            loadSessionsList();
            showSuccess(`New session started: ${sessionId}`);
        }
    });
}

// PTT Button events
if (pttButton) {
    pttButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!micInitialized) {
            initMicrophone();
        } else {
            startRecording();
        }
    });

    pttButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (micInitialized) {
            stopRecording();
        }
    });

    pttButton.addEventListener('mouseleave', (e) => {
        if (isRecording) {
            stopRecording();
        }
    });

    // Touch support
    pttButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!micInitialized) {
            initMicrophone();
        } else {
            startRecording();
        }
    });

    pttButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (micInitialized) {
            stopRecording();
        }
    });
}

// Keyboard support (Spacebar) - but not when typing in text input
document.addEventListener('keydown', (e) => {
    // Don't trigger PTT if user is typing in text input
    if (e.target === textInput) {
        return;
    }
    
    if (e.code === 'Space' && !isRecording && !isProcessing && micInitialized) {
        e.preventDefault();
        startRecording();
    }
});

document.addEventListener('keyup', (e) => {
    // Don't trigger PTT if user is typing in text input
    if (e.target === textInput) {
        return;
    }
    
    if (e.code === 'Space' && isRecording) {
        e.preventDefault();
        stopRecording();
    }
});

// Clear conversation button
clearButton.addEventListener('click', clearConversation);

// Debug toggle button
debugToggle.addEventListener('click', () => {
    const isHidden = debugPanel.style.display === 'none' || !debugPanel.style.display;
    if (isHidden) {
        debugPanel.style.display = 'block';
        log('Debug panel opened');
    } else {
        debugPanel.style.display = 'none';
        log('Debug panel closed');
    }
});

// Clear debug log button
clearDebug.addEventListener('click', () => {
    debugLog.textContent = '';
    log('Debug log cleared');
});

// Text input and send button
async function sendTextMessage() {
    const text = textInput.value.trim();
    
    if (!text) {
        return;
    }
    
    if (isProcessing) {
        log('Cannot send: already processing');
        return;
    }
    
    // Clear input
    textInput.value = '';
    textInput.disabled = true;
    sendButton.disabled = true;
    
    // Add user message to conversation
    const userMeta = {
        source: 'text'
    };
    
    addMessage('user', text, userMeta);
    
    // Get AI response
    try {
        await getAgentResponse(text);
    } catch (error) {
        log('Send text error', { error: error.message });
    } finally {
        textInput.disabled = false;
        sendButton.disabled = false;
        textInput.focus();
    }
}

// Send button click
if (sendButton) {
    sendButton.addEventListener('click', () => {
        sendTextMessage();
    });
}

// Text input enter key
if (textInput) {
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    // Enable text input on focus (independent of mic)
    textInput.addEventListener('focus', () => {
        if (sendButton) sendButton.disabled = false;
    });
}

// Initialize on load
window.addEventListener('load', async () => {
    log('Emilia web app v3.0 initialized');
    log('Browser info', {
        userAgent: navigator.userAgent,
        mediaDevices: !!navigator.mediaDevices,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    });
    log('Session ID', { sessionId });

    // Enable text input (works without mic)
    textInput.disabled = false;
    sendButton.disabled = false;

    // Auto-focus text input for immediate typing
    if (textInput) {
        textInput.focus();
        log('Text input focused');
    }

    await checkHealth();
    await loadSessionsList();

    if (ttsEnabled) {
        await loadVoices();
    } else {
        log('TTS disabled on load - skipping voice load');
    }

    await initMicrophone();
});

// Debug: expose retry function globally
window.retryMicrophone = initMicrophone;
window.clearConversation = clearConversation;
log('Debug: window.retryMicrophone() and window.clearConversation() available');

// ========================================
// DASHBOARD MODE EXTENSIONS
// ========================================

// Dashboard state
let dashboardStats = {
    messageCount: 0,
    totalTokens: 0,
    totalLatency: 0,
    latencyCount: 0,
    // Model removed - gateway API doesn't expose real model
};

let memoryRefreshInterval = null;
let currentMemoryTab = 'main';
let currentMemoryFile = null;

// Memory viewer functions
async function loadMemoryMain() {
    try {
        const response = await fetch(`${API_URL}/api/memory`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load MEMORY.md: ${response.status}`);
        }
        
        const content = await response.text();
        const memoryText = document.getElementById('memoryMainText');
        
        if (memoryText) {
            // Read-only for security
            memoryText.contentEditable = false;
            memoryText.textContent = content;
            memoryText.classList.remove('editable');
        }
        
        log('MEMORY.md loaded');
    } catch (error) {
        log('Failed to load MEMORY.md', { error: error.message });
        const memoryText = document.getElementById('memoryMainText');
        if (memoryText) {
            memoryText.textContent = `Error: ${error.message}`;
        }
    }
}

async function saveMemoryMain(content) {
    // Disabled for security: memory viewer is read-only
    log('saveMemoryMain disabled (read-only mode)');
}

async function loadMemoryFileList() {
    try {
        const response = await fetch(`${API_URL}/api/memory/list`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list memory files: ${response.status}`);
        }
        
        const result = await response.json();
        const fileList = document.getElementById('memoryFileList');
        
        if (!fileList) return;
        
        if (result.files.length === 0) {
            fileList.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No daily logs yet</p>';
            return;
        }
        
        fileList.innerHTML = result.files.map(filename => `
            <div class="memory-file-item" data-filename="${filename}">
                📄 ${filename}
            </div>
        `).join('');
        
        // Add click handlers
        fileList.querySelectorAll('.memory-file-item').forEach(item => {
            item.addEventListener('click', () => {
                const filename = item.dataset.filename;
                loadMemoryFile(filename);
                
                // Update active state
                fileList.querySelectorAll('.memory-file-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
        
        log('Memory file list loaded', { count: result.files.length });
    } catch (error) {
        log('Failed to load memory file list', { error: error.message });
    }
}

async function loadMemoryFile(filename) {
    try {
        const response = await fetch(`${API_URL}/api/memory/${filename}`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.status}`);
        }
        
        const content = await response.text();
        const memoryText = document.getElementById('memoryDailyText');
        
        if (memoryText) {
            currentMemoryFile = filename;
            
            // Read-only for security
            memoryText.contentEditable = false;
            memoryText.textContent = content;
            memoryText.classList.remove('editable');
        }
        
        log(`Loaded ${filename}`);
    } catch (error) {
        log(`Failed to load ${filename}`, { error: error.message });
        const memoryText = document.getElementById('memoryDailyText');
        if (memoryText) {
            memoryText.textContent = `Error: ${error.message}`;
        }
    }
}

async function saveMemoryFile(filename, content) {
    // Disabled for security: memory viewer is read-only
    log('saveMemoryFile disabled (read-only mode)', { filename });
}

// Memory tab switching
const memoryTabs = document.querySelectorAll('.memory-tab');
if (memoryTabs.length > 0) {
    memoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            memoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show appropriate view
            const mainView = document.getElementById('memoryMainView');
            const dailyView = document.getElementById('memoryDailyView');
            
            if (tabName === 'main') {
                mainView.style.display = 'block';
                dailyView.style.display = 'none';
                currentMemoryTab = 'main';
                loadMemoryMain();
            } else {
                mainView.style.display = 'none';
                dailyView.style.display = 'flex';
                currentMemoryTab = 'daily';
                loadMemoryFileList();
            }
        });
    });
}

// Refresh memory button
const refreshMemory = document.getElementById('refreshMemory');
if (refreshMemory) {
    refreshMemory.addEventListener('click', () => {
        if (currentMemoryTab === 'main') {
            loadMemoryMain();
        } else {
            loadMemoryFileList();
            if (currentMemoryFile) {
                loadMemoryFile(currentMemoryFile);
            }
        }
        addStateEntry('Memory refreshed');
    });
}

// Auto-refresh memory (poll every 5 seconds to see Emilia's updates)
function startMemoryAutoRefresh() {
    if (memoryRefreshInterval) {
        clearInterval(memoryRefreshInterval);
    }
    
    memoryRefreshInterval = setInterval(() => {
        // Only auto-refresh if not currently editing
        const memoryText = document.getElementById(currentMemoryTab === 'main' ? 'memoryMainText' : 'memoryDailyText');
        if (memoryText && document.activeElement !== memoryText) {
            if (currentMemoryTab === 'main') {
                loadMemoryMain();
            } else if (currentMemoryFile) {
                loadMemoryFile(currentMemoryFile);
            }
        }
    }, 5000); // 5 seconds
}

function stopMemoryAutoRefresh() {
    if (memoryRefreshInterval) {
        clearInterval(memoryRefreshInterval);
        memoryRefreshInterval = null;
    }
}

// Avatar command patterns for stripping from display
const MOOD_PATTERN = /\[MOOD:[^\]]+\]/g;
const ANIM_PATTERN = /\[ANIM:[^\]]+\]/g;

/**
 * Strip avatar control tags from text for display
 */
function stripAvatarTags(text) {
    if (!text) return text;
    let clean = text.replace(MOOD_PATTERN, '');
    clean = clean.replace(ANIM_PATTERN, '');
    return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Handle avatar commands from response
 * @param {Array} moods - Array of {mood: string, intensity: number}
 * @param {Array} animations - Array of animation names
 */
function handleAvatarCommands(moods, animations) {
    // Log for now - avatar integration can be added later
    if (moods && moods.length > 0) {
        log('Avatar moods', moods);
        // TODO: Send to avatar controller
        // e.g., avatarController.setMood(moods[0].mood, moods[0].intensity);
    }
    if (animations && animations.length > 0) {
        log('Avatar animations', animations);
        // TODO: Send to avatar controller
        // e.g., avatarController.playAnimation(animations[0]);
    }
}

// Stats functions
function updateStats(responseData) {
    dashboardStats.messageCount++;
    
    if (responseData.processing_ms) {
        dashboardStats.totalLatency += responseData.processing_ms;
        dashboardStats.latencyCount++;
    }
    
    if (responseData.usage && responseData.usage.total_tokens) {
        dashboardStats.totalTokens += responseData.usage.total_tokens;
    }
    
    // Model removed - gateway API doesn't expose real model
    
    // Update UI
    const statMessages = document.getElementById('statMessages');
    const statTokens = document.getElementById('statTokens');
    const statLatency = document.getElementById('statLatency');
    
    if (statMessages) statMessages.textContent = dashboardStats.messageCount;
    if (statTokens) statTokens.textContent = dashboardStats.totalTokens.toLocaleString();
    if (statLatency && dashboardStats.latencyCount > 0) {
        const avgLatency = Math.round(dashboardStats.totalLatency / dashboardStats.latencyCount);
        statLatency.textContent = `${avgLatency}ms`;
    }
}

// State logging
function addStateEntry(text) {
    const stateLog = document.getElementById('stateLog');
    if (!stateLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'state-entry';
    entry.innerHTML = `
        <span class="state-time">${timestamp}</span>
        <span class="state-text">${text}</span>
    `;
    
    stateLog.insertBefore(entry, stateLog.firstChild);
    
    // Keep only last 50 entries
    while (stateLog.children.length > 50) {
        stateLog.removeChild(stateLog.lastChild);
    }
}

// Override setState to also log to state panel
const originalSetState = setState;
setState = function(state) {
    originalSetState(state);
    
    const stateLabels = {
        'initializing': 'Initializing microphone',
        'ready': 'Ready',
        'recording': 'Recording audio',
        'processing': 'Transcribing',
        'thinking': 'LLM thinking',
        'speaking': 'Speaking (TTS)',
        'error': 'Error',
        'permission-denied': 'Microphone permission denied'
    };
    
    if (stateLabels[state]) {
        addStateEntry(stateLabels[state]);
    }
};

// Chat filter handling
const filterCheckboxes = {
    reasoning: document.getElementById('filterReasoning'),
    thinking: document.getElementById('filterThinking'),
    tokens: document.getElementById('filterTokens'),
    meta: document.getElementById('filterMeta')
};

function applyMetaFilterToMessage(messageEl, enabled) {
    if (!messageEl) return;
    const metaEl = messageEl.querySelector('.message-meta');
    if (metaEl) {
        metaEl.style.display = enabled ? '' : 'none';
    }
}

function getFilterStates() {
    return {
        reasoning: filterCheckboxes.reasoning?.checked ?? true,
        thinking: filterCheckboxes.thinking?.checked ?? true,
        tokens: filterCheckboxes.tokens?.checked ?? true,
        meta: filterCheckboxes.meta?.checked ?? true
    };
}

// Enhanced addMessage for dashboard mode
const originalAddMessage = addMessage;
addMessage = function(role, content, meta = {}) {
    // Call original function
    originalAddMessage(role, content, meta);
    
    // Get filters
    const filters = getFilterStates();
    
    // Find the last added message
    const messages = conversationHistoryEl.querySelectorAll('.message');
    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage) return;
    
    // Apply meta filter
    applyMetaFilterToMessage(lastMessage, filters.meta);

    // Add reasoning if present and filter enabled
    if (filters.reasoning && meta.reasoning) {
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'message-reasoning';
        reasoningDiv.innerHTML = `<strong>🧠 Reasoning:</strong><br/>${escapeHtml(meta.reasoning)}`;
        lastMessage.appendChild(reasoningDiv);
    }
    
    // Add thinking if present and filter enabled
    if (filters.thinking && meta.thinking) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message-thinking';
        thinkingDiv.innerHTML = `<strong>💭 Thinking:</strong><br/>${escapeHtml(meta.thinking)}`;
        lastMessage.appendChild(thinkingDiv);
    }
    
    // Add token usage if present and filter enabled
    if (filters.tokens && meta.usage) {
        const tokensDiv = document.createElement('div');
        tokensDiv.className = 'message-tokens';
        tokensDiv.textContent = `Tokens: ${meta.usage.prompt_tokens || 0} prompt + ${meta.usage.completion_tokens || 0} completion = ${meta.usage.total_tokens || 0} total`;
        lastMessage.appendChild(tokensDiv);
    }

    // Update stats if this is an assistant message
    if (role === 'assistant' && meta.processing_ms) {
        updateStats(meta);
    }
};

// Override getAgentResponse to pass full metadata (supports streaming)
const originalGetAgentResponse = getAgentResponse;
getAgentResponse = async function(message) {
    setState('thinking');
    addStateEntry('Sending to LLM');

    log('Calling chat API...', { message, streaming: STREAMING_ENABLED });

    const startTime = Date.now();

    try {
        if (STREAMING_ENABLED) {
            // Streaming mode
            await getAgentResponseStreamingDashboard(message, startTime);
        } else {
            // Non-streaming mode
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AUTH_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    session_id: sessionId
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Chat API error: ${response.status} - ${error}`);
            }

            const result = await response.json();
            const totalTime = Date.now() - startTime;

            log('Agent response received', result);
            addStateEntry('LLM response received');

            // Add assistant message to conversation with full metadata
            const assistantMeta = {
                processing_ms: result.processing_ms,
                model: result.model,
                finish_reason: result.finish_reason,
                reasoning: result.reasoning,
                thinking: result.thinking,
                usage: result.usage
            };

            addMessage('assistant', result.response || '(no response)', assistantMeta);

            // Generate and play TTS audio (optional)
            if (result.response && result.response.trim()) {
                if (ttsEnabled) {
                    await speakText(result.response);
                } else {
                    log('TTS disabled - skipping /api/speak');
                    setState('ready');
                }
            } else {
                setState('ready');
            }
        }
    } catch (error) {
        log('Chat error', { error: error.message });

        addMessage('assistant', `⚠️ Error: ${error.message}`, {});
        addStateEntry(`Error: ${error.message}`);

        setState('error');
        showError(`Chat failed: ${error.message}`);
    }
};

// Dashboard streaming response handler
async function getAgentResponseStreamingDashboard(message, startTime) {
    // Create abort controller for this request
    currentAbortController = new AbortController();

    const response = await fetch(`${API_URL}/api/chat?stream=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            session_id: sessionId
        }),
        signal: currentAbortController.signal
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    addStateEntry('Streaming response...');

    // Create a placeholder message element for streaming
    const timestamp = new Date().toLocaleTimeString();
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant';
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-role">🤖 Emilia</span>
            <span class="message-timestamp">${timestamp}</span>
        </div>
        <div class="message-bubble-container">
            <div class="message-bubble"></div>
        </div>
    `;

    // Hide empty state if needed
    if (conversationHistory.length === 0 && conversationEmpty) {
        conversationEmpty.style.display = 'none';
    }

    conversationHistoryEl.appendChild(messageEl);
    const bubbleEl = messageEl.querySelector('.message-bubble');
    const bubbleContainer = messageEl.querySelector('.message-bubble-container');

    let fullContent = '';
    let processingMs = 0;
    let finalData = null;

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr || dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    if (data.content) {
                        fullContent += data.content;
                        // Strip avatar tags for display during streaming
                        bubbleEl.textContent = stripAvatarTags(fullContent);
                        conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
                    }

                    if (data.done) {
                        finalData = data;
                        processingMs = data.processing_ms || (Date.now() - startTime);
                        addStateEntry('LLM response received');
                        
                        // Use clean response from server if available
                        if (data.response) {
                            bubbleEl.textContent = data.response;
                            fullContent = data.response;
                        }
                        
                        // Handle avatar commands
                        handleAvatarCommands(data.moods, data.animations);
                    }
                } catch (e) {
                    if (e.message !== 'Unexpected end of JSON input') {
                        log('SSE parse error', { error: e.message });
                    }
                }
            }
        }
    }

    // Use clean content (tags stripped)
    const cleanContent = finalData?.response || stripAvatarTags(fullContent);

    // Add replay button after streaming completes (if we have content)
    if (cleanContent && !cleanContent.startsWith('⚠️')) {
        const replayBtn = document.createElement('button');
        replayBtn.className = 'replay-button';
        replayBtn.title = 'Replay voice';
        replayBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        replayBtn.addEventListener('click', () => replayMessage(replayBtn, cleanContent));
        bubbleContainer.appendChild(replayBtn);
    }

    // Build metadata from final data
    const assistantMeta = {
        processing_ms: processingMs,
        model: finalData?.model,
        usage: finalData?.usage
    };

    // Add to conversation history
    conversationHistory.push({
        role: 'assistant',
        content: cleanContent,
        timestamp: timestamp,
        meta: assistantMeta
    });

    // Add metadata display
    if (processingMs > 0) {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        metaEl.textContent = `🔄 ${processingMs}ms`;
        messageEl.appendChild(metaEl);
    }
    
    // Update stats with model and usage from final event
    updateStats(assistantMeta);

    log('Agent response received (streaming)', {
        response: cleanContent.substring(0, 100) + '...',
        processing_ms: processingMs,
        model: finalData?.model,
        usage: finalData?.usage
    });

    // Generate and play TTS audio
    if (cleanContent && cleanContent.trim()) {
        if (ttsEnabled) {
            await speakText(cleanContent);
        } else {
            log('TTS disabled - skipping /api/speak');
            setState('ready');
        }
    } else {
        setState('ready');
    }
}

// Initialize dashboard on load
window.addEventListener('load', async () => {
    // Wait for main initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if we're in dashboard mode
    const isDashboard = document.querySelector('.dashboard-mode');
    
    if (isDashboard) {
        log('Dashboard mode initialized');
        addStateEntry('Dashboard loaded');
        
        // Mobile panel toggle handlers
        const memoryToggle = document.getElementById('memoryToggle');
        const statsToggle = document.getElementById('statsToggle');
        const memoryPanel = document.getElementById('memoryPanel');
        const statsPanel = document.getElementById('statsPanel');
        
        // On mobile, start with panels collapsed
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            if (memoryPanel && memoryToggle) {
                memoryPanel.classList.add('collapsed');
                memoryToggle.classList.remove('active'); // Toggle button shows panel is collapsed
                log('Memory panel collapsed (mobile)');
            }
            if (statsPanel && statsToggle) {
                statsPanel.classList.add('collapsed');
                statsToggle.classList.remove('active'); // Toggle button shows panel is collapsed
                log('Stats panel collapsed (mobile)');
            }
        }
        
        // Setup toggle handlers
        if (memoryToggle && memoryPanel) {
            memoryToggle.addEventListener('click', () => {
                const isCollapsed = memoryPanel.classList.contains('collapsed');
                memoryPanel.classList.toggle('collapsed');
                memoryToggle.classList.toggle('active');
                log(`Memory panel ${isCollapsed ? 'expanded' : 'collapsed'}`);
            });
            log('Memory toggle handler attached');
        }
        
        if (statsToggle && statsPanel) {
            statsToggle.addEventListener('click', () => {
                const isCollapsed = statsPanel.classList.contains('collapsed');
                statsPanel.classList.toggle('collapsed');
                statsToggle.classList.toggle('active');
                log(`Stats panel ${isCollapsed ? 'expanded' : 'collapsed'}`);
            });
            log('Stats toggle handler attached');
        }
        
        // Load initial memory
        loadMemoryMain();
        
        // Start auto-refresh
        startMemoryAutoRefresh();
        
        log('Memory auto-refresh started (5s interval)');
    }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    stopMemoryAutoRefresh();
});

log('Dashboard extensions loaded');
