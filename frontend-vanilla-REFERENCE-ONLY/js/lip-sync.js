/**
 * Emilia Web App - Lip Sync Engine
 * Syncs VRM avatar mouth movements to TTS audio using ElevenLabs character timestamps
 */

/**
 * Map character to VRM viseme blend shape name
 * Uses Oculus standard visemes supported by VRM
 */
function charToViseme(char) {
    const c = char.toLowerCase();
    
    // Vowels - most important for lip sync
    if ('aeiou'.includes(c)) {
        if (c === 'a') return 'aa';
        if (c === 'e') return 'E';
        if (c === 'i') return 'I';
        if (c === 'o') return 'O';
        if (c === 'u') return 'U';
    }
    
    // Consonants mapped to visemes
    if ('pbm'.includes(c)) return 'PP';  // Bilabial
    if ('fv'.includes(c)) return 'FF';    // Labiodental
    if ('td'.includes(c)) return 'DD';    // Alveolar
    if ('kg'.includes(c)) return 'kk';    // Velar
    if ('sz'.includes(c)) return 'SS';    // Sibilant
    if (c === 'r') return 'RR';           // Rhotic
    if (c === 'n') return 'nn';           // Nasal
    if (c === 'l') return 'nn';           // Lateral (use nasal as approximation)
    if ('th'.includes(c)) return 'TH';    // Dental fricative
    if ('ch'.includes(c)) return 'CH';    // Affricate
    
    // Default: silent/neutral
    return 'sil';
}

/**
 * VRM expression names for Oculus visemes
 * VRM uses lowercase with 'viseme_' prefix
 */
const VISEME_EXPRESSIONS = {
    'sil': 'viseme_sil',
    'PP': 'viseme_PP',
    'FF': 'viseme_FF',
    'TH': 'viseme_TH',
    'DD': 'viseme_DD',
    'kk': 'viseme_kk',
    'CH': 'viseme_CH',
    'SS': 'viseme_SS',
    'nn': 'viseme_nn',
    'RR': 'viseme_RR',
    'aa': 'viseme_aa',
    'E': 'viseme_E',
    'I': 'viseme_I',
    'O': 'viseme_O',
    'U': 'viseme_U'
};

/**
 * LipSyncEngine - Synchronizes VRM mouth movements with TTS audio
 */
class LipSyncEngine {
    constructor(vrm) {
        this.vrm = vrm;
        this.alignment = null;
        this.audioElement = null;
        this.audioStartTime = null;
        this.isActive = false;
        
        // Smoothing parameters
        this.blendSpeed = 0.15;  // How fast to transition between visemes (0-1)
        this.currentViseme = 'sil';
        this.currentWeight = 0;
        this.targetWeight = 0;
        
        // Pre-computed timing data for fast lookup
        this.timingData = [];
    }
    
    /**
     * Called when TTS response arrives with alignment data
     * @param {Object} alignment - ElevenLabs alignment data
     */
    setAlignment(alignment) {
        this.alignment = alignment;
        this.timingData = [];
        
        if (!alignment) {
            console.log('[LipSync] No alignment data provided');
            return;
        }
        
        // Pre-compute viseme timing data
        const { chars, charStartTimesMs, charDurationsMs } = alignment;
        
        if (!chars || !charStartTimesMs || !charDurationsMs) {
            console.warn('[LipSync] Incomplete alignment data');
            return;
        }
        
        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const startMs = charStartTimesMs[i];
            const durationMs = charDurationsMs[i];
            const viseme = charToViseme(char);
            
            this.timingData.push({
                char,
                startMs,
                endMs: startMs + durationMs,
                viseme
            });
        }
        
        console.log(`[LipSync] Prepared ${this.timingData.length} timing entries`);
    }
    
    /**
     * Called when audio starts playing
     * @param {HTMLAudioElement} audioElement - The audio element being played
     */
    startSync(audioElement) {
        if (!this.alignment || this.timingData.length === 0) {
            console.log('[LipSync] No alignment data - lip sync disabled for this playback');
            return;
        }
        
        this.audioElement = audioElement;
        this.isActive = true;
        this.audioStartTime = performance.now();
        
        console.log('[LipSync] Started sync');
    }
    
    /**
     * Called each frame - update visemes based on audio currentTime
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (!this.vrm?.expressionManager) return;
        
        const expressionManager = this.vrm.expressionManager;
        
        if (!this.isActive || !this.audioElement) {
            // Decay current viseme to neutral when not active
            if (this.currentWeight > 0.01) {
                this.currentWeight = Math.max(0, this.currentWeight - this.blendSpeed);
                this.applyViseme(expressionManager, this.currentViseme, this.currentWeight);
            }
            return;
        }
        
        // Get current audio time in milliseconds
        const currentTimeMs = this.audioElement.currentTime * 1000;
        
        // Find the current viseme based on timing
        let targetViseme = 'sil';
        
        for (const entry of this.timingData) {
            if (currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs) {
                targetViseme = entry.viseme;
                break;
            }
        }
        
        // Smooth transition between visemes
        if (targetViseme !== this.currentViseme) {
            // Fade out old viseme, fade in new
            this.applyViseme(expressionManager, this.currentViseme, 0);
            this.currentViseme = targetViseme;
            this.currentWeight = 0;
        }
        
        // Ramp up weight for current viseme
        if (targetViseme !== 'sil') {
            this.targetWeight = 0.7;  // Don't go full 1.0 for more natural look
        } else {
            this.targetWeight = 0;
        }
        
        // Smooth interpolation
        this.currentWeight += (this.targetWeight - this.currentWeight) * this.blendSpeed;
        
        // Apply the viseme
        this.applyViseme(expressionManager, this.currentViseme, this.currentWeight);
    }
    
    /**
     * Apply a viseme to the VRM expression manager
     */
    applyViseme(expressionManager, viseme, weight) {
        const expressionName = VISEME_EXPRESSIONS[viseme];
        if (!expressionName) return;
        
        try {
            // First reset all viseme expressions to 0
            for (const expr of Object.values(VISEME_EXPRESSIONS)) {
                if (expr !== expressionName) {
                    expressionManager.setValue(expr, 0);
                }
            }
            
            // Apply the target viseme
            expressionManager.setValue(expressionName, Math.min(1, Math.max(0, weight)));
        } catch (e) {
            // Expression might not exist in this VRM model - that's OK
            // Fall back to simple 'aa' mouth open for vowels
            if ('aeiou'.includes(viseme.toLowerCase())) {
                try {
                    expressionManager.setValue('aa', weight * 0.5);
                } catch (e2) {
                    // Ignore - model doesn't support this expression
                }
            }
        }
    }
    
    /**
     * Stop lip sync and reset to neutral
     */
    stop() {
        this.isActive = false;
        this.audioElement = null;
        this.alignment = null;
        this.timingData = [];
        
        // Reset to neutral expression
        if (this.vrm?.expressionManager) {
            for (const expr of Object.values(VISEME_EXPRESSIONS)) {
                try {
                    this.vrm.expressionManager.setValue(expr, 0);
                } catch (e) {
                    // Ignore
                }
            }
            // Also reset 'aa' which might be used as fallback
            try {
                this.vrm.expressionManager.setValue('aa', 0);
            } catch (e) {
                // Ignore
            }
        }
        
        this.currentViseme = 'sil';
        this.currentWeight = 0;
        this.targetWeight = 0;
        
        console.log('[LipSync] Stopped and reset');
    }
    
    /**
     * Check if lip sync is currently active
     */
    get active() {
        return this.isActive;
    }
}

// Export for module usage
export { LipSyncEngine, charToViseme, VISEME_EXPRESSIONS };
