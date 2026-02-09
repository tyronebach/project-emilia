/**
 * Client-side behavior tag parsing.
 *
 * The backend (`parse_chat.py`) is the authoritative parser used in the chat
 * flow. This module mirrors that logic for local-only use cases such as the
 * avatar debug "Behavior Scenarios" panel, so we have a single source of truth
 * on the frontend as well.
 */

export interface ParsedBehavior {
  intent: string | null;
  mood: string | null;
  mood_intensity: number;
  energy: string | null;
}

const MOOD_PATTERN = /\[MOOD:([^:\]]+):?([\d.]*)\]/i;
const INTENT_PATTERN = /\[INTENT:([^\]]+)\]/i;
const ENERGY_PATTERN = /\[ENERGY:([^\]]+)\]/i;
const MOOD_PATTERN_GLOBAL = /\[MOOD:([^:\]]+):?([\d.]*)\]/gi;
const INTENT_PATTERN_GLOBAL = /\[INTENT:([^\]]+)\]/gi;
const ENERGY_PATTERN_GLOBAL = /\[ENERGY:([^\]]+)\]/gi;

/**
 * Parse `[INTENT:X]`, `[MOOD:X:intensity]`, `[ENERGY:X]` tags from text and
 * return both the cleaned text and extracted behaviour fields.
 */
export function parseBehaviorTags(text: string): { cleanText: string; behavior: ParsedBehavior } {
  const behavior: ParsedBehavior = {
    intent: null,
    mood: null,
    mood_intensity: 1.0,
    energy: null,
  };

  const moodMatch = text.match(MOOD_PATTERN);
  if (moodMatch) {
    behavior.mood = moodMatch[1].toLowerCase();
    const intensityStr = moodMatch[2];
    const parsed = intensityStr ? Number.parseFloat(intensityStr) : 1.0;
    if (Number.isFinite(parsed)) {
      behavior.mood_intensity = Math.max(0, Math.min(1, parsed));
    }
  }

  const intentMatch = text.match(INTENT_PATTERN);
  if (intentMatch) {
    behavior.intent = intentMatch[1].toLowerCase();
  }

  const energyMatch = text.match(ENERGY_PATTERN);
  if (energyMatch) {
    behavior.energy = energyMatch[1].toLowerCase();
  }

  const cleanText = text
    .replace(MOOD_PATTERN_GLOBAL, '')
    .replace(INTENT_PATTERN_GLOBAL, '')
    .replace(ENERGY_PATTERN_GLOBAL, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { cleanText, behavior };
}
