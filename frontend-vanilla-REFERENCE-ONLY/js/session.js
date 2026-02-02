/**
 * Emilia Web App - Session Management
 * Session persistence, localStorage helpers
 */

import { 
    HIDDEN_SESSIONS_KEY, 
    SESSION_NAMES_KEY,
    API_URL,
    AUTH_TOKEN
} from './config.js';
import { 
    sessionId, 
    setSessionId, 
    conversationHistory, 
    setConversationHistory 
} from './state.js';
import { log } from './ui.js';
import { escapeHtml } from './utils.js';

// Helper functions for session persistence
export function getHiddenSessions() {
    try {
        const stored = localStorage.getItem(HIDDEN_SESSIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

export function setHiddenSessions(sessions) {
    try {
        localStorage.setItem(HIDDEN_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
        // ignore
    }
}

export function hideSession(sessionIdToHide) {
    const hidden = getHiddenSessions();
    if (!hidden.includes(sessionIdToHide)) {
        hidden.push(sessionIdToHide);
        setHiddenSessions(hidden);
    }
}

export function unhideSession(sessionIdToUnhide) {
    const hidden = getHiddenSessions();
    const index = hidden.indexOf(sessionIdToUnhide);
    if (index > -1) {
        hidden.splice(index, 1);
        setHiddenSessions(hidden);
    }
}

export function getSessionNames() {
    try {
        const stored = localStorage.getItem(SESSION_NAMES_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

export function setSessionName(id, name) {
    const names = getSessionNames();
    if (name && name.trim()) {
        names[id] = name.trim();
    } else {
        delete names[id];
    }
    try {
        localStorage.setItem(SESSION_NAMES_KEY, JSON.stringify(names));
    } catch (e) {
        // ignore
    }
}

export function getSessionDisplayName(id) {
    const names = getSessionNames();
    return names[id] || id;
}

// Load session history from API
export async function loadSessionHistory(targetSessionId, elements) {
    const { conversationHistoryEl, conversationEmpty } = elements;
    
    try {
        log('Loading session history', { sessionId: targetSessionId });
        const response = await fetch(`${API_URL}/api/sessions/history/${encodeURIComponent(targetSessionId)}`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        });
        if (!response.ok) {
            log('Session history API error', { status: response.status });
            return;
        }
        const data = await response.json();
        
        if (data.error) {
            log('Session history error', { error: data.error });
            return;
        }
        
        // Clear current UI
        setConversationHistory([]);
        if (conversationHistoryEl) conversationHistoryEl.innerHTML = '';
        
        const messages = data.messages || [];
        
        if (messages.length === 0) {
            if (conversationEmpty) conversationEmpty.style.display = 'flex';
            log('Session history loaded (empty)', { count: 0 });
            return;
        }
        
        // Hide empty state
        if (conversationEmpty) conversationEmpty.style.display = 'none';
        
        // Add each message to UI
        const newHistory = [];
        for (const msg of messages) {
            // Format timestamp if present
            let displayTimestamp = '';
            if (msg.timestamp) {
                try {
                    displayTimestamp = new Date(msg.timestamp).toLocaleTimeString();
                } catch (e) {
                    displayTimestamp = '';
                }
            }
            
            // Create message element
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.role}`;
            const roleLabel = msg.role === 'user' ? '👤 You' : '🤖 Emilia';
            
            messageEl.innerHTML = `
                <div class="message-header">
                    <span class="message-role">${roleLabel}</span>
                    <span class="message-timestamp">${displayTimestamp}</span>
                </div>
                <div class="message-bubble">${escapeHtml(msg.content || '')}</div>
            `;
            
            conversationHistoryEl.appendChild(messageEl);
            
            // Add to history array
            newHistory.push({
                role: msg.role,
                content: msg.content,
                timestamp: displayTimestamp,
                meta: {}
            });
        }
        
        setConversationHistory(newHistory);
        
        // Scroll to bottom
        conversationHistoryEl.scrollTop = conversationHistoryEl.scrollHeight;
        
        log('Session history loaded', { count: messages.length });
    } catch (error) {
        log('Failed to load session history', { error: error.message });
    }
}

// Load sessions list from API
export async function loadSessionsList(elements) {
    const { sessionSelector, sessionsHint } = elements;
    
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
        let sessions = data.sessions || [];

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

        // Filter out hidden sessions
        const hiddenSessions = getHiddenSessions();
        sessions = sessions.filter(s => !hiddenSessions.includes(s.display_id));

        // Always include current session
        const currentSessionId = sessionId;
        const existing = new Set(sessions.map(s => s.display_id));
        if (!existing.has(currentSessionId)) {
            sessions.unshift({ display_id: currentSessionId, session_key: currentSessionId });
        }

        // Build dropdown
        sessionSelector.innerHTML = sessions
            .map(s => {
                const value = s.display_id;
                const displayName = getSessionDisplayName(value);
                const selected = value === currentSessionId ? 'selected' : '';
                return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(displayName)}</option>`;
            })
            .join('');

        log('Sessions loaded', { count: sessions.length, hidden: hiddenSessions.length });
    } catch (e) {
        log('Failed to load sessions', { error: e.message });
        if (sessionsHint) {
            sessionsHint.style.display = '';
            sessionsHint.textContent = 'Sessions list unavailable';
        }
        const displayName = getSessionDisplayName(sessionId);
        sessionSelector.innerHTML = `<option value="${escapeHtml(sessionId)}" selected>${escapeHtml(displayName)}</option>`;
    }
}
