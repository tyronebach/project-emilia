/**
 * Emilia Web App - Audio Module
 * Recording, microphone initialization, audio playback
 */

import { API_URL, AUTH_TOKEN } from './config.js';
import * as state from './state.js';
import { log, setState, showError, showWarning, addMessage } from './ui.js';

/**
 * Initialize microphone
 */
export async function initMicrophone() {
    setState('initializing');
    
    // Clean up existing stream if any
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.setStream(null);
    }
    
    try {
        log('Requesting microphone access...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia not supported in this browser');
        }
        
        const newStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            } 
        });
        
        state.setStream(newStream);
        
        log('Microphone stream acquired', {
            tracks: newStream.getTracks().length,
            active: newStream.active
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
        
        const recorder = new MediaRecorder(newStream, { 
            mimeType: selectedMimeType,
            audioBitsPerSecond: 128000
        });
        
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.pushAudioChunk(event.data);
            }
        };
        
        recorder.onstop = handleRecordingStop;
        
        recorder.onerror = (event) => {
            log('MediaRecorder error', { error: event.error });
            setState('error');
        };
        
        state.setMediaRecorder(recorder);
        state.setMicInitialized(true);
        setState('ready');
        log('Microphone ready ✓');
        
    } catch (error) {
        state.setMicInitialized(false);
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

/**
 * Start recording
 */
export function startRecording() {
    if (!state.micInitialized) {
        log('Cannot record: microphone not initialized');
        return;
    }
    
    if (state.isRecording || state.isProcessing) {
        log('Cannot record: already recording or processing');
        return;
    }
    
    state.clearAudioChunks();
    
    try {
        state.mediaRecorder.start();
        state.setIsRecording(true);
        setState('recording');
        log('Recording started');
    } catch (error) {
        log('Recording start error', { error: error.message });
        state.setIsRecording(false);
        setState('error');
        showError(`Failed to start recording: ${error.message}`);
    }
}

/**
 * Stop recording
 */
export function stopRecording() {
    if (!state.isRecording) return;
    
    try {
        state.mediaRecorder.stop();
        state.setIsRecording(false);
        log('Recording stopped');
    } catch (error) {
        log('Recording stop error', { error: error.message });
        state.setIsRecording(false);
        setState('error');
    }
}

// Response handler callback (set by chat.js)
let onTranscriptionComplete = null;
export function setTranscriptionCallback(callback) {
    onTranscriptionComplete = callback;
}

/**
 * Handle recording completion
 */
async function handleRecordingStop() {
    setState('processing');
    
    if (state.audioChunks.length === 0) {
        log('No audio data captured');
        setState('error');
        showWarning('No audio captured. Please try again.');
        return;
    }
    
    const mimeType = state.mediaRecorder.mimeType;
    const audioBlob = new Blob(state.audioChunks, { type: mimeType });
    const audioSize = (audioBlob.size / 1024).toFixed(1);
    
    log('Audio captured', { 
        size: `${audioSize}KB`, 
        type: mimeType,
        chunks: state.audioChunks.length
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

/**
 * Transcribe audio via API
 */
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
    
    // Get AI response via callback
    if (result.text && result.text.trim() && onTranscriptionComplete) {
        await onTranscriptionComplete(result.text);
    } else {
        setState('ready');
    }
}

/**
 * Check API health
 */
export async function checkHealth() {
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
