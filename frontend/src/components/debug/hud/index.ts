/**
 * HUD Debug Panel sections (main chat overlay).
 *
 * All sections use CollapsibleSection for a unified expand/collapse UI pattern.
 *
 * Section Groups:
 *   - Core: Status & Context, Message Stats
 *   - Session: Session Compaction
 *   - AI: Emotion Engine
 *   - Voice: TTS Voice, Voice Input
 *   - Debug: Latency, Errors, State Log
 *
 * Adding a new section:
 *   1. Create `debug/hud/MySection.tsx` exporting a component.
 *      Use CollapsibleSection wrapper for consistent UI.
 *      The component receives no props — pull state from stores/hooks.
 *   2. Import it here and add one entry to `hudSections`.
 *      It automatically gets rendering, toggle persistence, and the gear-icon UI.
 *
 * If a section needs props passed from the parent shell (like VoiceInputSection),
 * special-case it in DebugPanel.tsx's render loop by matching on `s.id`.
 *
 * Shared types live in `debug/types.ts`. Shared utils in `utils/behaviorTags.ts`.
 */
import type { DebugSection } from '../types';

// Core Status
import { StatusSection } from './StatusSection';
import { StatsSection } from './StatsSection';

// Session
import { CompactionSection } from './CompactionSection';

// AI
import { EmotionEngineSection } from './EmotionEngineSection';

// Voice & Audio
import { TtsVoiceSection } from './TtsVoiceSection';
import { VoiceInputSection } from './VoiceInputSection';

// Debug & Performance
import { LatencySection } from './LatencySection';
import { ErrorsSection } from './ErrorsSection';
import { StateLogSection } from './StateLogSection';

// Re-exports
export { CollapsibleSection, type CollapsibleSectionProps } from './CollapsibleSection';
export { VoiceInputSection } from './VoiceInputSection';
export type { VoiceInputSectionProps } from './VoiceInputSection';

/**
 * HUD sections in display order, grouped logically:
 * Core → Session → AI → Voice → Debug
 */
export const hudSections: DebugSection[] = [
  // Core Status
  { id: 'hud-status', label: 'Status & Context', component: StatusSection, defaultEnabled: true },
  { id: 'hud-stats', label: 'Message Stats', component: StatsSection, defaultEnabled: true },

  // Session
  { id: 'hud-compaction', label: 'Session Compaction', component: CompactionSection },

  // AI
  { id: 'hud-emotion', label: 'Emotion Engine', component: EmotionEngineSection },

  // Voice & Audio
  { id: 'hud-tts-voice', label: 'TTS Voice', component: TtsVoiceSection },
  { id: 'hud-voice-input', label: 'Voice Input', component: VoiceInputSection },

  // Debug & Performance
  { id: 'hud-latency', label: 'Latency', component: LatencySection },
  { id: 'hud-errors', label: 'Errors', component: ErrorsSection },
  { id: 'hud-state-log', label: 'State Log', component: StateLogSection },
];
