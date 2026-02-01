/**
 * Emilia Web App - Dashboard Extensions
 * Memory viewer, stats, state logging, dashboard-specific features
 */

import { API_URL, AUTH_TOKEN, STREAMING_ENABLED } from './config.js';
import * as state from './state.js';
import { 
    log, 
    setState, 
    onStateChange, 
    showError,
    getElements,
    addMessage,
    createStreamingMessage,
    updateStreamingMessage,
    addReplayButtonToMessage
} from './ui.js';
import { speakText } from './tts.js';
import { escapeHtml, stripAvatarTags } from './utils.js';

// Dashboard stats
export let dashboardStats = {
    messageCount: 0,
    totalTokens: 0,
    totalLatency: 0,
    latencyCount: 0,
};

// Memory state
let memoryRefreshInterval = null;
let currentMemoryTab = 'main';
let currentMemoryFile = null;

/**
 * Update stats display
 */
export function updateStats(responseData) {
    dashboardStats.messageCount++;
    
    if (responseData.processing_ms) {
        dashboardStats.totalLatency += responseData.processing_ms;
        dashboardStats.latencyCount++;
    }
    
    if (responseData.usage && responseData.usage.total_tokens) {
        dashboardStats.totalTokens += responseData.usage.total_tokens;
    }
    
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

/**
 * Add state entry to log
 */
export function addStateEntry(text) {
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

// ========================================
// MEMORY VIEWER
// ========================================

export async function loadMemoryMain() {
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

export async function loadMemoryFileList() {
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
                
                fileList.querySelectorAll('.memory-file-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
        
        log('Memory file list loaded', { count: result.files.length });
    } catch (error) {
        log('Failed to load memory file list', { error: error.message });
    }
}

export async function loadMemoryFile(filename) {
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

export function startMemoryAutoRefresh() {
    if (memoryRefreshInterval) {
        clearInterval(memoryRefreshInterval);
    }
    
    memoryRefreshInterval = setInterval(() => {
        const memoryText = document.getElementById(currentMemoryTab === 'main' ? 'memoryMainText' : 'memoryDailyText');
        if (memoryText && document.activeElement !== memoryText) {
            if (currentMemoryTab === 'main') {
                loadMemoryMain();
            } else if (currentMemoryFile) {
                loadMemoryFile(currentMemoryFile);
            }
        }
    }, 5000);
}

export function stopMemoryAutoRefresh() {
    if (memoryRefreshInterval) {
        clearInterval(memoryRefreshInterval);
        memoryRefreshInterval = null;
    }
}

// ========================================
// DASHBOARD CHAT ENHANCEMENTS
// ========================================

/**
 * Get filter states
 */
function getFilterStates() {
    return {
        reasoning: document.getElementById('filterReasoning')?.checked ?? true,
        thinking: document.getElementById('filterThinking')?.checked ?? true,
        tokens: document.getElementById('filterTokens')?.checked ?? true,
        meta: document.getElementById('filterMeta')?.checked ?? true
    };
}

/**
 * Enhanced addMessage for dashboard mode
 */
export function addDashboardMessage(role, content, meta = {}) {
    const { conversationHistoryEl, conversationEmpty } = getElements();
    
    // Get filters
    const filters = getFilterStates();
    
    // Call base addMessage
    const messageEl = addMessage(role, content, meta);
    
    if (!messageEl) return;
    
    // Apply meta filter
    const metaEl = messageEl.querySelector('.message-meta');
    if (metaEl) {
        metaEl.style.display = filters.meta ? '' : 'none';
    }

    // Add reasoning if present and filter enabled
    if (filters.reasoning && meta.reasoning) {
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'message-reasoning';
        reasoningDiv.innerHTML = `<strong>🧠 Reasoning:</strong><br/>${escapeHtml(meta.reasoning)}`;
        messageEl.appendChild(reasoningDiv);
    }
    
    // Add thinking if present and filter enabled
    if (filters.thinking && meta.thinking) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message-thinking';
        thinkingDiv.innerHTML = `<strong>💭 Thinking:</strong><br/>${escapeHtml(meta.thinking)}`;
        messageEl.appendChild(thinkingDiv);
    }
    
    // Add token usage if present and filter enabled
    if (filters.tokens && meta.usage) {
        const tokensDiv = document.createElement('div');
        tokensDiv.className = 'message-tokens';
        tokensDiv.textContent = `Tokens: ${meta.usage.prompt_tokens || 0} prompt + ${meta.usage.completion_tokens || 0} completion = ${meta.usage.total_tokens || 0} total`;
        messageEl.appendChild(tokensDiv);
    }

    // Update stats if this is an assistant message
    if (role === 'assistant' && meta.processing_ms) {
        updateStats(meta);
    }
    
    return messageEl;
}

/**
 * Dashboard streaming response handler
 */
export async function getAgentResponseStreamingDashboard(message, startTime) {
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

    addStateEntry('Streaming response...');

    const { messageEl, bubbleEl, bubbleContainer, timestamp } = createStreamingMessage();

    let fullContent = '';
    let processingMs = 0;
    let finalData = null;

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
                        updateStreamingMessage(bubbleEl, stripAvatarTags(fullContent));
                    }

                    if (data.done) {
                        finalData = data;
                        processingMs = data.processing_ms || (Date.now() - startTime);
                        addStateEntry('LLM response received');
                        
                        if (data.response) {
                            bubbleEl.textContent = data.response;
                            fullContent = data.response;
                        }
                    }
                } catch (e) {
                    if (e.message !== 'Unexpected end of JSON input') {
                        log('SSE parse error', { error: e.message });
                    }
                }
            }
        }
    }

    const cleanContent = finalData?.response || stripAvatarTags(fullContent);

    // Build metadata from final data
    const assistantMeta = {
        processing_ms: processingMs,
        model: finalData?.model,
        usage: finalData?.usage
    };

    // Add to conversation history
    state.conversationHistory.push({
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
    
    updateStats(assistantMeta);

    log('Agent response received (streaming)', {
        response: cleanContent.substring(0, 100) + '...',
        processing_ms: processingMs,
        model: finalData?.model,
        usage: finalData?.usage
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

// ========================================
// DASHBOARD INITIALIZATION
// ========================================

export function initDashboard() {
    const isDashboard = document.querySelector('.dashboard-mode');
    if (!isDashboard) return false;
    
    log('Dashboard mode initialized');
    addStateEntry('Dashboard loaded');
    
    // Register state change callback
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
    
    onStateChange((newState) => {
        if (stateLabels[newState]) {
            addStateEntry(stateLabels[newState]);
        }
    });
    
    // Mobile panel toggle handlers
    const memoryToggle = document.getElementById('memoryToggle');
    const statsToggle = document.getElementById('statsToggle');
    const memoryPanel = document.getElementById('memoryPanel');
    const statsPanel = document.getElementById('statsPanel');
    
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        if (memoryPanel && memoryToggle) {
            memoryPanel.classList.add('collapsed');
            memoryToggle.classList.remove('active');
        }
        if (statsPanel && statsToggle) {
            statsPanel.classList.add('collapsed');
            statsToggle.classList.remove('active');
        }
    }
    
    if (memoryToggle && memoryPanel) {
        memoryToggle.addEventListener('click', () => {
            memoryPanel.classList.toggle('collapsed');
            memoryToggle.classList.toggle('active');
        });
    }
    
    if (statsToggle && statsPanel) {
        statsToggle.addEventListener('click', () => {
            statsPanel.classList.toggle('collapsed');
            statsToggle.classList.toggle('active');
        });
    }
    
    // Memory tabs
    const memoryTabs = document.querySelectorAll('.memory-tab');
    memoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            memoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
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
    
    // Load initial memory
    loadMemoryMain();
    
    // Start auto-refresh
    startMemoryAutoRefresh();
    
    log('Memory auto-refresh started (5s interval)');
    
    return true;
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    stopMemoryAutoRefresh();
});
