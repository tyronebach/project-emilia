/**
 * Emilia Web App - Frontend Logic v2.0
 * Push-to-talk with conversation history
 * Improved error handling and UI/UX
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

// Logging
function log(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    let logEntry = `[${timestamp}] ${message}`;
    if (data) {
        logEntry += '\n' + JSON.stringify(data, null, 2);
    }
    debugLog.textContent = logEntry + '\n\n' + debugLog.textContent;
    console.log(message, data);
}

// State management
function setState(state) {
    statusIndicator.className = `status-indicator ${state}`;
    
    switch(state) {
        case 'initializing':
            statusText.textContent = 'Initializing microphone...';
            pttButton.className = 'ptt-button';
            pttButton.querySelector('.ptt-text').textContent = 'Initializing...';
            pttButton.disabled = true;
            break;
        case 'ready':
            statusText.textContent = 'Ready';
            pttButton.className = 'ptt-button';
            pttButton.querySelector('.ptt-text').textContent = 'Hold to Talk';
            pttButton.disabled = false;
            break;
        case 'recording':
            statusText.textContent = 'Recording...';
            pttButton.className = 'ptt-button recording';
            pttButton.querySelector('.ptt-text').textContent = 'Recording';
            break;
        case 'processing':
            statusText.textContent = 'Transcribing...';
            pttButton.className = 'ptt-button processing';
            pttButton.querySelector('.ptt-text').textContent = 'Processing';
            pttButton.disabled = true;
            break;
        case 'thinking':
            statusText.textContent = 'Thinking...';
            pttButton.className = 'ptt-button thinking';
            pttButton.querySelector('.ptt-text').textContent = 'Thinking';
            pttButton.disabled = true;
            break;
        case 'speaking':
            statusText.textContent = 'Speaking...';
            pttButton.className = 'ptt-button speaking';
            pttButton.querySelector('.ptt-text').textContent = 'Speaking';
            pttButton.disabled = true;
            break;
        case 'error':
            statusText.textContent = 'Error - Click to retry';
            pttButton.className = 'ptt-button error';
            pttButton.querySelector('.ptt-text').textContent = 'Retry Microphone';
            pttButton.disabled = false;
            break;
        case 'permission-denied':
            statusText.textContent = 'Microphone access denied';
            pttButton.className = 'ptt-button error';
            pttButton.querySelector('.ptt-text').textContent = 'Enable Microphone';
            pttButton.disabled = false;
            break;
    }
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
    
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-role">${roleLabel}</span>
            <span class="message-timestamp">${timestamp}</span>
        </div>
        <div class="message-bubble">${escapeHtml(content || '')}</div>
        ${metaHtml}
    `;
    
    conversationHistoryEl.appendChild(messageEl);
    
    // Auto-scroll to bottom
    conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
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
            alert('Microphone access denied. Please allow microphone access in your browser settings.');
        } else if (error.name === 'NotFoundError') {
            setState('error');
            alert('No microphone found. Please connect a microphone and try again.');
        } else {
            setState('error');
            alert(`Microphone error: ${error.message}`);
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
        alert(`Failed to start recording: ${error.message}`);
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
        alert('No audio data captured. Please try again.');
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
        alert('Captured audio is empty. Please try again.');
        return;
    }
    
    try {
        await transcribeAudio(audioBlob);
    } catch (error) {
        log('Transcription error', { error: error.message });
        setState('error');
        alert(`Transcription failed: ${error.message}`);
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

// Get agent response from chat API
async function getAgentResponse(message) {
    setState('thinking');
    
    log('Calling chat API...', { message });
    
    const startTime = Date.now();
    
    try {
        const response = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                session_id: 'web-user-1'
            })
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
        
        // Generate and play TTS audio
        if (result.response && result.response.trim()) {
            await speakText(result.response);
        } else {
            setState('ready');
        }
        
    } catch (error) {
        log('Chat error', { error: error.message });
        
        addMessage('assistant', `⚠️ Error: ${error.message}`, {});
        
        setState('error');
        alert(`Chat failed: ${error.message}`);
    }
}

// Text-to-speech playback
async function speakText(text) {
    setState('speaking');
    
    log('Generating TTS...', { textLength: text.length });
    
    const startTime = Date.now();
    
    try {
        const response = await fetch(`${API_URL}/api/speak`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text
            })
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
        
        // When audio finishes, clean up and set state back to ready
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setState('ready');
            log('TTS playback complete');
        };
        
        // Handle audio errors
        audio.onerror = (e) => {
            URL.revokeObjectURL(audioUrl);
            setState('ready');
            log('TTS playback error', { error: e });
        };
        
        // Play the audio
        await audio.play();
        
    } catch (error) {
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

// PTT Button events
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

// Keyboard support (Spacebar)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isRecording && !isProcessing && micInitialized) {
        e.preventDefault();
        startRecording();
    }
});

document.addEventListener('keyup', (e) => {
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

// Initialize on load
window.addEventListener('load', async () => {
    log('Emilia web app v2.0 initialized');
    log('Browser info', {
        userAgent: navigator.userAgent,
        mediaDevices: !!navigator.mediaDevices,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    });
    
    await checkHealth();
    await initMicrophone();
});

// Debug: expose retry function globally
window.retryMicrophone = initMicrophone;
window.clearConversation = clearConversation;
log('Debug: window.retryMicrophone() and window.clearConversation() available');
