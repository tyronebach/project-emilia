/**
 * Emilia Web App - Utility Functions
 * Generic helpers, escaping, formatting
 */

import { MOOD_PATTERN, ANIM_PATTERN } from './config.js';

/**
 * HTML escape for safety
 */
export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Get current time as locale string
 */
export function getTimestamp() {
    return new Date().toLocaleTimeString();
}

/**
 * Strip avatar control tags from text for display
 */
export function stripAvatarTags(text) {
    if (!text) return text;
    let clean = text.replace(MOOD_PATTERN, '');
    clean = clean.replace(ANIM_PATTERN, '');
    return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Simple hash for cache key
 */
export function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}
