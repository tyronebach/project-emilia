/**
 * HUD Debug Panel sections (main chat overlay).
 *
 * Adding a new section:
 *   1. Create `debug/hud/MySection.tsx` exporting a component.
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
import { StatusSection } from './StatusSection';
import { StatsSection } from './StatsSection';
import { CompactionSection } from './CompactionSection';
import { EmotionEngineSection } from './EmotionEngineSection';
import { TtsVoiceSection } from './TtsVoiceSection';
import { VoiceInputSection } from './VoiceInputSection';
import { LatencySection } from './LatencySection';
import { ErrorsSection } from './ErrorsSection';
import { StateLogSection } from './StateLogSection';

export { VoiceInputSection } from './VoiceInputSection';
export type { VoiceInputSectionProps } from './VoiceInputSection';

export const hudSections: DebugSection[] = [
  { id: 'hud-status', label: 'Status & Context', component: StatusSection },
  { id: 'hud-stats', label: 'Message Stats', component: StatsSection },
  { id: 'hud-compaction', label: 'Session Compaction', component: CompactionSection },
  { id: 'hud-emotion', label: 'Emotion Engine', component: EmotionEngineSection },
  { id: 'hud-tts-voice', label: 'TTS Voice', component: TtsVoiceSection },
  { id: 'hud-voice-input', label: 'Voice Input', component: VoiceInputSection },
  { id: 'hud-latency', label: 'Latency', component: LatencySection },
  { id: 'hud-errors', label: 'Errors', component: ErrorsSection },
  { id: 'hud-state-log', label: 'State Log', component: StateLogSection },
];
