/**
 * Emilia Web App - Frontend Logic (Fixed Mic Access)
 * Push-to-talk with MediaRecorder API
 * Improved error handling and retry mechanism
 */

// Configuration
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8080'
    : `${window.location.protocol}//${window.location.hostname}:8080`;

const AUTH_TOKEN = 'emilia-dev-token-2026';

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isProcessing = false;
let stream = null;
let micInitialized = false;

// DOM elements
const pttButton = document.getElementById('pttButton');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const transcriptionSection = document.getElementById('transcriptionSection');
const transcriptionBox = document.getElementById('transcriptionBox');
const transcriptionMeta = document.getElementById('transcriptionMeta');
const responseSection = document.getElementById('responseSection');
const responseBox = document.getElementById('responseBox');
const debugLog = document.getElementById('debugLog');

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
            pttButton.className = 'ptt-button processing';
            pttButton.querySelector('.ptt-text').textContent = 'Thinking';
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
        
        // Check if getUserMedia is supported
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
        
        // Check supported MIME types
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
                log(`Audio chunk received: ${event.data.size} bytes`);
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
            message: error.message,
            stack: error.stack
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
    
    // Create audio blob
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
    
    // Send to API
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
    
    // Add audio file with proper extension
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
    
    // Display transcription
    displayTranscription(result, totalTime);
    
    // Get AI response
    if (result.text && result.text.trim()) {
        await getAgentResponse(result.text);
    } else {
        setState('ready');
    }
}

// Display transcription
function displayTranscription(result, totalTime) {
    transcriptionBox.textContent = result.text || '(no speech detected)';
    
    transcriptionMeta.innerHTML = `
        <span>🌍 ${result.language || 'unknown'} (${((result.language_probability || 0) * 100).toFixed(0)}%)</span>
        <span>⏱️ Audio: ${result.duration_ms || 0}ms</span>
        <span>🔄 Processing: ${result.processing_ms || 0}ms</span>
        <span>📡 Total: ${totalTime}ms</span>
    `;
    
    transcriptionSection.style.display = 'block';
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
        
        // Display agent response
        displayAgentResponse(result, totalTime);
        
        setState('ready');
        
    } catch (error) {
        log('Chat error', { error: error.message });
        
        responseBox.textContent = `⚠️ Error: ${error.message}`;
        responseSection.style.display = 'block';
        
        setState('error');
        alert(`Chat failed: ${error.message}`);
    }
}

// Display agent response
function displayAgentResponse(result, totalTime) {
    responseBox.textContent = result.response || '(no response)';
    responseSection.style.display = 'block';
    
    const responseMetaDiv = document.createElement('div');
    responseMetaDiv.className = 'response-meta';
    responseMetaDiv.innerHTML = `
        <span>🤖 Agent: ${result.agent_id}</span>
        <span>⏱️ Processing: ${result.processing_ms}ms</span>
        <span>📡 Total: ${totalTime}ms</span>
    `;
    
    const existingMeta = responseSection.querySelector('.response-meta');
    if (existingMeta) {
        existingMeta.remove();
    }
    responseSection.appendChild(responseMetaDiv);
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

// PTT Button events - only if mic is initialized
pttButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!micInitialized) {
        // If mic not initialized, clicking button will retry init
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

// Touch support for mobile
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

// Initialize on load
window.addEventListener('load', async () => {
    log('Emilia web app initialized');
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
log('Debug: Type window.retryMicrophone() to manually retry mic init');
