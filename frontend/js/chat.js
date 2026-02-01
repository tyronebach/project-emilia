/**
 * Emilia Web App - Chat Module
 * Send message, SSE streaming, agent response handling
 */

import { API_URL, AUTH_TOKEN, STREAMING_ENABLED } from './config.js';
import * as state from './state.js';
import { 
    log, 
    setState, 
    showError, 
    addMessage, 
    getElements,
    createStreamingMessage,
    updateStreamingMessage,
    finalizeStreamingMessage,
    addReplayButtonToMessage
} from './ui.js';
import { speakText } from './tts.js';
import { stripAvatarTags } from './utils.js';

/**
 * Handle avatar commands from response
 * @param {Array} moods - Array of {mood, intensity} objects
 * @param {Array} animations - Array of animation names
 */
function handleAvatarCommands(moods, animations) {
    if (moods && moods.length > 0) {
        log('Avatar moods', moods);
        // Apply the first/primary mood to the avatar
        if (window.avatarController && moods[0]) {
            window.avatarController.setMood(moods[0].mood, moods[0].intensity);
        }
    }
    if (animations && animations.length > 0) {
        log('Avatar animations', animations);
        // Trigger the first animation
        if (window.avatarController && animations[0]) {
            window.avatarController.triggerAnimation(animations[0]);
        }
    }
}

/**
 * Handle avatar SSE event (sent early in stream)
 * @param {Object} avatarData - {mood, intensity, animation}
 */
function handleAvatarEvent(avatarData) {
    log('Avatar SSE event', avatarData);
    
    if (!window.avatarController) {
        log('Avatar controller not ready');
        return;
    }
    
    if (avatarData.mood) {
        window.avatarController.setMood(avatarData.mood, avatarData.intensity || 1.0);
    }
    
    if (avatarData.animation) {
        window.avatarController.triggerAnimation(avatarData.animation);
    }
}

/**
 * Get agent response from chat API (with optional streaming)
 */
export async function getAgentResponse(message) {
    setState('thinking');

    log('Calling chat API...', { message, streaming: STREAMING_ENABLED });

    const startTime = Date.now();

    try {
        if (STREAMING_ENABLED) {
            await getAgentResponseStreaming(message, startTime);
        } else {
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

/**
 * Non-streaming response handler
 */
async function getAgentResponseNonStreaming(message, startTime) {
    state.setCurrentAbortController(new AbortController());

    const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            session_id: state.sessionId
        }),
        signal: state.currentAbortController.signal
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const totalTime = Date.now() - startTime;

    log('Agent response received', result);

    const assistantMeta = {
        processing_ms: result.processing_ms
    };

    addMessage('assistant', result.response || '(no response)', assistantMeta);

    // Generate and play TTS audio (optional)
    if (result.response && result.response.trim()) {
        if (state.ttsEnabled) {
            await speakText(result.response);
        } else {
            log('TTS disabled - skipping /api/speak');
            setState('ready');
        }
    } else {
        setState('ready');
    }
}

/**
 * Streaming response handler using SSE
 */
async function getAgentResponseStreaming(message, startTime) {
    state.setCurrentAbortController(new AbortController());

    const response = await fetch(`${API_URL}/api/chat?stream=1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            session_id: state.sessionId
        }),
        signal: state.currentAbortController.signal
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    // Create a placeholder message element for streaming
    const { messageEl, bubbleEl, bubbleContainer, timestamp } = createStreamingMessage();

    let fullContent = '';
    let processingMs = 0;
    let finalData = null;

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventType = null;  // Track named events (e.g., 'avatar')

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            // Parse event type lines (e.g., "event: avatar")
            if (line.startsWith('event: ')) {
                currentEventType = line.slice(7).trim();
                continue;
            }
            
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (!dataStr || dataStr === '[DONE]') {
                    currentEventType = null;
                    continue;
                }

                try {
                    const data = JSON.parse(dataStr);

                    // Handle named events
                    if (currentEventType === 'avatar') {
                        handleAvatarEvent(data);
                        currentEventType = null;
                        continue;
                    }

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    if (data.content) {
                        fullContent += data.content;
                        updateStreamingMessage(bubbleEl, stripAvatarTags(fullContent));
                    }

                    if (data.done) {
                        finalData = data;
                        processingMs = data.processing_ms || (Date.now() - startTime);
                        
                        // Use clean response from server if available
                        if (data.response) {
                            bubbleEl.textContent = data.response;
                            fullContent = data.response;
                        }
                        
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
                
                // Reset event type after processing data
                currentEventType = null;
            }
        }
    }

    // Use clean content (tags stripped)
    const cleanContent = finalData?.response || stripAvatarTags(fullContent);

    // Finalize message
    finalizeStreamingMessage(messageEl, cleanContent, processingMs, timestamp);

    log('Agent response received (streaming)', {
        response: cleanContent.substring(0, 100) + '...',
        processing_ms: processingMs
    });

    // Generate and play TTS audio
    if (cleanContent && cleanContent.trim()) {
        if (state.ttsEnabled) {
            const audioGenerated = await speakText(cleanContent);
            if (audioGenerated) {
                addReplayButtonToMessage(bubbleContainer, cleanContent);
            }
        } else {
            log('TTS disabled - skipping /api/speak');
            setState('ready');
        }
    } else {
        setState('ready');
    }
}

/**
 * Send text message
 */
export async function sendTextMessage() {
    const { textInput, sendButton } = getElements();
    
    const text = textInput.value.trim();
    
    if (!text) {
        return;
    }
    
    if (state.isProcessing) {
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
