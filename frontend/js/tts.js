/**
 * Emilia Web App - TTS Module
 * Text-to-speech, voice selection, audio playback
 */

import { API_URL, AUTH_TOKEN } from './config.js';
import * as state from './state.js';
import { log, setState, getElements, setReplayCallback } from './ui.js';
import { hashString } from './utils.js';

/**
 * Load available voices from API
 */
export async function loadVoices() {
    const { voiceSelector } = getElements();
    
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
            state.setSelectedVoice(data.default);
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

/**
 * Apply TTS UI state
 */
export function applyTtsUiState() {
    const { ttsToggle, voiceSelector } = getElements();
    
    if (ttsToggle) {
        ttsToggle.checked = !!state.ttsEnabled;
    }
    if (voiceSelector) {
        voiceSelector.disabled = !state.ttsEnabled;
        if (!state.ttsEnabled) {
            voiceSelector.innerHTML = '<option value="rachel">(Voice off)</option>';
        }
    }
}

/**
 * Text-to-speech playback - returns true if audio was generated successfully
 */
export async function speakText(text) {
    setState('speaking');

    if (!state.ttsEnabled) {
        log('TTS disabled - speakText() skipped');
        setState('ready');
        return false;
    }

    log('Generating TTS...', { textLength: text.length, voice: state.selectedVoice });

    const startTime = Date.now();

    try {
        // Create abort controller for TTS request
        state.setCurrentAbortController(new AbortController());

        const response = await fetch(`${API_URL}/api/speak`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_id: state.selectedVoice
            }),
            signal: state.currentAbortController.signal
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`TTS API error: ${response.status} - ${error}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Cache audio URL for replay (keyed by text hash)
        const cacheKey = hashString(text);
        state.audioCache.set(cacheKey, audioUrl);

        const generationTime = Date.now() - startTime;
        log('TTS generated', {
            generationMs: generationTime,
            size: (audioBlob.size / 1024).toFixed(1) + 'KB'
        });

        // Create and play audio element
        const audio = new Audio(audioUrl);

        // Track current audio for stop functionality
        state.setCurrentAudio(audio);

        // When audio finishes, set state back to ready
        audio.onended = () => {
            state.setCurrentAudio(null);
            setState('ready');
            log('TTS playback complete');
        };

        // Handle audio errors
        audio.onerror = (e) => {
            state.setCurrentAudio(null);
            setState('ready');
            log('TTS playback error', { error: e });
        };

        // Play the audio
        await audio.play();
        
        return true;

    } catch (error) {
        // Handle abort errors gracefully
        if (error.name === 'AbortError') {
            log('TTS request aborted');
            return false;
        }
        log('TTS error', { error: error.message });
        setState('ready');
        return false;
    }
}

/**
 * Replay message audio - uses cached audio if available
 */
export async function replayMessage(buttonEl, text) {
    if (!text || !text.trim()) return;
    
    const cacheKey = hashString(text);
    let audioUrl = state.audioCache.get(cacheKey);

    // Disable button and show playing state
    buttonEl.disabled = true;
    buttonEl.classList.add('playing');

    // If no cached audio, we need to generate it
    if (!audioUrl) {
        log('Replaying message (generating audio)', { textLength: text.length });

        try {
            const response = await fetch(`${API_URL}/api/speak`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AUTH_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice_id: state.selectedVoice
                })
            });

            if (!response.ok) {
                throw new Error(`TTS API error: ${response.status}`);
            }

            const audioBlob = await response.blob();
            audioUrl = URL.createObjectURL(audioBlob);
            
            // Cache for future replays
            state.audioCache.set(cacheKey, audioUrl);
        } catch (error) {
            log('Replay TTS error', { error: error.message });
            buttonEl.disabled = false;
            buttonEl.classList.remove('playing');
            return;
        }
    } else {
        log('Replaying message (using cached audio)');
    }

    // Play the audio
    try {
        const audio = new Audio(audioUrl);

        audio.onended = () => {
            buttonEl.disabled = false;
            buttonEl.classList.remove('playing');
            log('Replay complete');
        };

        audio.onerror = () => {
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

/**
 * Stop generation (abort controller and audio)
 */
export function stopGeneration() {
    log('Stop button clicked');

    // Abort any pending fetch request
    if (state.currentAbortController) {
        state.currentAbortController.abort();
        state.setCurrentAbortController(null);
        log('Fetch request aborted');
    }

    // Stop any playing audio
    if (state.currentAudio) {
        state.currentAudio.pause();
        state.currentAudio.currentTime = 0;
        if (state.currentAudio.src) {
            URL.revokeObjectURL(state.currentAudio.src);
        }
        state.setCurrentAudio(null);
        log('Audio playback stopped');
    }

    // Reset state
    setState('ready');

    // Re-enable input controls
    const { textInput, sendButton } = getElements();
    if (textInput) textInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
}

// Initialize replay callback
setReplayCallback(replayMessage);
