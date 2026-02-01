/**
 * Emilia Web App - UI Module
 * DOM manipulation, message rendering, notifications, logging
 */

import { conversationHistory, audioCache, lastAvatarState } from './state.js';
import { escapeHtml, getTimestamp, hashString } from './utils.js';

// DOM element references (populated by initElements)
let elements = {};

export function initElements() {
    elements = {
        pttButton: document.getElementById('pttButton'),
        statusIndicator: document.getElementById('statusIndicator'),
        statusText: document.getElementById('statusText'),
        conversationContainer: document.getElementById('conversationContainer'),
        conversationEmpty: document.getElementById('conversationEmpty'),
        conversationHistoryEl: document.getElementById('conversationHistory'),
        debugPanel: document.getElementById('debugPanel'),
        debugLog: document.getElementById('debugLog'),
        deleteSessionButton: document.getElementById('deleteSessionButton'),
        renameSessionButton: document.getElementById('renameSessionButton'),
        debugToggle: document.getElementById('debugToggle'),
        clearDebug: document.getElementById('clearDebug'),
        textInput: document.getElementById('textInput'),
        sendButton: document.getElementById('sendButton'),
        voiceSelector: document.getElementById('voiceSelector'),
        ttsToggle: document.getElementById('ttsToggle'),
        sessionSelector: document.getElementById('sessionSelector'),
        sessionsHint: document.getElementById('sessionsHint'),
        refreshSessionsButton: document.getElementById('refreshSessions'),
        newSessionButton: document.getElementById('newSessionButton'),
        stopButton: document.getElementById('stopButton'),
    };
    return elements;
}

export function getElements() {
    return elements;
}

// Logging
export function log(message, data = null) {
    const timestamp = getTimestamp();
    let logEntry = `[${timestamp}] ${message}`;
    if (data) {
        logEntry += '\n' + JSON.stringify(data, null, 2);
    }
    if (elements.debugLog) {
        elements.debugLog.textContent = logEntry + '\n\n' + elements.debugLog.textContent;
    }
    console.log(message, data);
}

// ========================================
// NON-BLOCKING NOTIFICATION SYSTEM
// ========================================

/**
 * Show a non-blocking toast notification
 */
export function showNotification(message, type = 'info', duration = 5000) {
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

export function showError(message) {
    showNotification(message, 'error', 8000);
}

export function showWarning(message) {
    showNotification(message, 'warning', 6000);
}

export function showSuccess(message) {
    showNotification(message, 'success', 4000);
}

// ========================================
// STATE INDICATOR
// ========================================

// State change callback for external hooks (dashboard)
let stateChangeCallback = null;
export function onStateChange(callback) {
    stateChangeCallback = callback;
}

export function setState(state) {
    const { statusIndicator, statusText, pttButton, stopButton } = elements;
    
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${state}`;
    }

    // Helper to safely set PTT text
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
    
    // Notify state change callback
    if (stateChangeCallback) {
        stateChangeCallback(state);
    }
}

// ========================================
// MESSAGE RENDERING
// ========================================

// Replay callback (set by tts.js)
let replayCallback = null;
export function setReplayCallback(callback) {
    replayCallback = callback;
}

/**
 * Add message to conversation history
 */
export function addMessage(role, content, meta = {}) {
    const { conversationHistoryEl, conversationEmpty } = elements;
    
    if (!conversationHistoryEl) {
        console.error('conversationHistoryEl is null - cannot add message');
        log('Error: conversationHistoryEl is null');
        return;
    }

    const timestamp = getTimestamp();

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

    // Add replay button for assistant messages ONLY if audio is cached
    let replayButtonHtml = '';
    if (role === 'assistant' && content && !content.startsWith('⚠️')) {
        const cacheKey = hashString(content);
        if (audioCache.has(cacheKey)) {
            replayButtonHtml = `
                <button class="replay-button" title="Replay voice" data-text="${escapeHtml(content).replace(/"/g, '&quot;')}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
            `;
        }
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
        if (replayBtn && replayCallback) {
            replayBtn.addEventListener('click', () => replayCallback(replayBtn, content));
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
    
    return messageEl;
}

/**
 * Create streaming message placeholder
 */
export function createStreamingMessage() {
    const { conversationHistoryEl, conversationEmpty } = elements;
    
    const timestamp = getTimestamp();
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
    
    return {
        messageEl,
        bubbleEl: messageEl.querySelector('.message-bubble'),
        bubbleContainer: messageEl.querySelector('.message-bubble-container'),
        timestamp
    };
}

/**
 * Update streaming message content
 */
export function updateStreamingMessage(bubbleEl, content) {
    const { conversationHistoryEl } = elements;
    bubbleEl.textContent = content;
    conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
}

/**
 * Finalize streaming message with metadata
 */
export function finalizeStreamingMessage(messageEl, content, processingMs, timestamp) {
    // Add to conversation history
    conversationHistory.push({
        role: 'assistant',
        content: content,
        timestamp: timestamp,
        meta: { processing_ms: processingMs }
    });

    // Build metadata items
    const metaItems = [];
    
    if (processingMs > 0) {
        metaItems.push(`🔄 ${processingMs}ms`);
    }
    
    // Add avatar state if available
    if (lastAvatarState) {
        const mood = lastAvatarState.mood || 'neutral';
        const intensity = lastAvatarState.intensity !== undefined 
            ? Math.round(lastAvatarState.intensity * 100) + '%' 
            : '';
        const anim = lastAvatarState.animation ? ` → ${lastAvatarState.animation}` : '';
        metaItems.push(`🎭 ${mood}${intensity ? ' ' + intensity : ''}${anim}`);
    }
    
    // Add metadata display
    if (metaItems.length > 0) {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        metaEl.textContent = metaItems.join(' • ');
        messageEl.appendChild(metaEl);
    }
}

/**
 * Add replay button to streaming message
 */
export function addReplayButtonToMessage(bubbleContainer, content) {
    if (!bubbleContainer.querySelector('.replay-button')) {
        const replayBtn = document.createElement('button');
        replayBtn.className = 'replay-button';
        replayBtn.title = 'Replay voice';
        replayBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        if (replayCallback) {
            replayBtn.addEventListener('click', () => replayCallback(replayBtn, content));
        }
        bubbleContainer.appendChild(replayBtn);
    }
}

/**
 * Clear conversation UI
 */
export function clearConversationUI() {
    const { conversationHistoryEl, conversationEmpty } = elements;
    if (conversationHistoryEl) conversationHistoryEl.innerHTML = '';
    if (conversationEmpty) conversationEmpty.style.display = 'flex';
}
