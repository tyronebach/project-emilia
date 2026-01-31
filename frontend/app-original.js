/**
 * Emilia Web App - Frontend Logic
 * Push-to-talk with MediaRecorder API
 */

// Configuration
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8080'
    : `${window.location.protocol}//${window.location.hostname}:8080`;

const AUTH_TOKEN = 'emilia-dev-token-2026'; // TODO: Get from secure storage

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isProcessing = false;
let stream = null;

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
            statusText.textContent = 'Error';
            pttButton.className = 'ptt-button';
            pttButton.querySelector('.ptt-text').textContent = 'Try Again';
            pttButton.disabled = false;
            break;
    }
}

// Initialize microphone
async function initMicrophone() {
    try {
        log('Requesting microphone access...');
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 48000
            } 
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
        
        log('Microphone ready', { mimeType: selectedMimeType });
        
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
        
        pttButton.disabled = false;
        setState('ready');
        
    } catch (error) {
        log('Microphone error', { error: error.message });
        statusText.textContent = 'Microphone access denied';
        alert('Please allow microphone access to use voice input');
    }
}

// Start recording
function startRecording() {
    if (isRecording || isProcessing) return;
    
    audioChunks = [];
    isRecording = true;
    
    try {
        mediaRecorder.start();
        setState('recording');
        log('Recording started');
    } catch (error) {
        log('Recording start error', { error: error.message });
        isRecording = false;
        setState('error');
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
        setState('error');
    }
}

// Handle recording completion
async function handleRecordingStop() {
    setState('processing');
    
    // Create audio blob
    const mimeType = mediaRecorder.mimeType;
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const audioSize = (audioBlob.size / 1024).toFixed(1);
    
    log('Audio captured', { 
        size: `${audioSize}KB`, 
        type: mimeType,
        chunks: audioChunks.length
    });
    
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
        <span>🌍 ${result.language || 'unknown'} (${(result.language_probability * 100).toFixed(0)}%)</span>
        <span>⏱️ Audio: ${result.duration_ms}ms</span>
        <span>🔄 Processing: ${result.processing_ms}ms</span>
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
                session_id: 'web-user-1'  // TODO: Generate per-user session ID
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
        
        // Show error in response box
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
    
    // Add response metadata (optional, can be styled separately)
    const responseMetaDiv = document.createElement('div');
    responseMetaDiv.className = 'response-meta';
    responseMetaDiv.innerHTML = `
        <span>🤖 Agent: ${result.agent_id}</span>
        <span>⏱️ Processing: ${result.processing_ms}ms</span>
        <span>📡 Total: ${totalTime}ms</span>
    `;
    
    // Replace existing meta if present
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
            statusText.textContent = 'STT Service Offline';
            log('Warning: STT service unhealthy');
        } else if (!health.brain_service.healthy) {
            statusText.textContent = 'Brain Service Offline';
            log('Warning: Brain service unhealthy');
        }
    } catch (error) {
        log('Health check failed', { error: error.message });
        statusText.textContent = 'API Offline';
    }
}

// PTT Button events
pttButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startRecording();
});

pttButton.addEventListener('mouseup', (e) => {
    e.preventDefault();
    stopRecording();
});

pttButton.addEventListener('mouseleave', (e) => {
    if (isRecording) {
        stopRecording();
    }
});

// Touch support for mobile
pttButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startRecording();
});

pttButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopRecording();
});

// Keyboard support (Spacebar)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isRecording && !isProcessing && !pttButton.disabled) {
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
    await checkHealth();
    await initMicrophone();
});
