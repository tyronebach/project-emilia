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
const newSessionButton = document.getElementById('newSessionButton');

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
    
    log('Generating TTS...', { textLength: text.length, voice: selectedVoice });
    
    const startTime = Date.now();
    
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

// Voice selector change
if (voiceSelector) {
    voiceSelector.addEventListener('change', (e) => {
        selectedVoice = e.target.value;
        log('Voice changed', { voice: selectedVoice });
    });
}

// New session button
if (newSessionButton) {
    newSessionButton.addEventListener('click', () => {
        if (confirm('Start new session? This will clear Emilia\'s memory of this conversation.')) {
            sessionId = 'web-user-' + Date.now();
            conversationHistory = [];
            if (conversationHistoryEl) conversationHistoryEl.innerHTML = '';
            if (conversationEmpty) conversationEmpty.style.display = 'flex';
            log('New session started', { sessionId });
            alert(`New session started: ${sessionId}`);
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
    
    await checkHealth();
    await loadVoices();
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
    currentModel: '-'
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
            // Make it editable
            memoryText.contentEditable = true;
            memoryText.textContent = content;
            memoryText.classList.add('editable');
            
            // Save on blur
            memoryText.addEventListener('blur', async () => {
                const newContent = memoryText.textContent;
                await saveMemoryMain(newContent);
            });
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
    try {
        const response = await fetch(`${API_URL}/api/memory`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                append: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to save MEMORY.md: ${response.status}`);
        }
        
        const result = await response.json();
        log('MEMORY.md saved', result);
        addStateEntry('Memory updated');
    } catch (error) {
        log('Failed to save MEMORY.md', { error: error.message });
        alert(`Failed to save MEMORY.md: ${error.message}`);
    }
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
            
            // Make it editable
            memoryText.contentEditable = true;
            memoryText.textContent = content;
            memoryText.classList.add('editable');
            
            // Save on blur
            memoryText.addEventListener('blur', async () => {
                const newContent = memoryText.textContent;
                await saveMemoryFile(filename, newContent);
            });
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
    try {
        const response = await fetch(`${API_URL}/api/memory/${filename}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                append: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to save ${filename}: ${response.status}`);
        }
        
        const result = await response.json();
        log(`${filename} saved`, result);
        addStateEntry(`Memory file ${filename} updated`);
    } catch (error) {
        log(`Failed to save ${filename}`, { error: error.message });
        alert(`Failed to save ${filename}: ${error.message}`);
    }
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
    
    if (responseData.model) {
        dashboardStats.currentModel = responseData.model;
    }
    
    // Update UI
    const statMessages = document.getElementById('statMessages');
    const statTokens = document.getElementById('statTokens');
    const statLatency = document.getElementById('statLatency');
    const statModel = document.getElementById('statModel');
    
    if (statMessages) statMessages.textContent = dashboardStats.messageCount;
    if (statTokens) statTokens.textContent = dashboardStats.totalTokens.toLocaleString();
    if (statLatency && dashboardStats.latencyCount > 0) {
        const avgLatency = Math.round(dashboardStats.totalLatency / dashboardStats.latencyCount);
        statLatency.textContent = `${avgLatency}ms`;
    }
    if (statModel) statModel.textContent = dashboardStats.currentModel;
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

// Override getAgentResponse to pass full metadata
const originalGetAgentResponse = getAgentResponse;
getAgentResponse = async function(message) {
    setState('thinking');
    addStateEntry('Sending to LLM');
    
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
        
        // Generate and play TTS audio
        if (result.response && result.response.trim()) {
            await speakText(result.response);
        } else {
            setState('ready');
        }
        
    } catch (error) {
        log('Chat error', { error: error.message });
        
        addMessage('assistant', `⚠️ Error: ${error.message}`, {});
        addStateEntry(`Error: ${error.message}`);
        
        setState('error');
        alert(`Chat failed: ${error.message}`);
    }
};

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
