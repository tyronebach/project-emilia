/**
 * Avatar Debug Panel sections (/debug route — model, rendering, animation).
 *
 * Adding a new section:
 *   1. Create `debug/avatar/MySection.tsx` exporting a component.
 *      Use `useAvatarDebug()` to access rendererRef, audioRef, fbxMixerRef, etc.
 *      The component must render an <AccordionItem> as its root element.
 *   2. Import it here and add one entry to `avatarSections`.
 *      It automatically gets rendering, toggle persistence, and the gear-icon UI.
 *
 * State that the main chat UI also controls (TTS voice, render quality) should
 * read/write through the shared Zustand stores (useAppStore, useRenderStore) so
 * the debug panel and the main window stay in sync.
 *
 * Shared types live in `debug/types.ts`. Shared utils in `utils/behaviorTags.ts`.
 */
import type { DebugSection } from '../types';
import { RenderQualitySection } from './RenderQualitySection';
import { LookAtSection } from './LookAtSection';
import { AnimationsSection } from './AnimationsSection';
import { BehaviorScenariosSection } from './BehaviorScenariosSection';
import { TtsElevenLabsSection } from './TtsElevenLabsSection';
import { VoiceChatSection } from './VoiceChatSection';
import { AudioFileTestSection } from './AudioFileTestSection';
import { AnimationUploadSection } from './AnimationUploadSection';

export { AvatarDebugProvider } from './AvatarDebugContext';
export type { AvatarDebugContextValue } from './AvatarDebugContext';

export const avatarSections: DebugSection[] = [
  { id: 'avatar-render-quality', label: 'Render Quality', component: RenderQualitySection },
  { id: 'avatar-look-at', label: 'Look At', component: LookAtSection },
  { id: 'avatar-animations', label: 'Animations', component: AnimationsSection },
  { id: 'avatar-behavior', label: 'Behavior Scenarios', component: BehaviorScenariosSection },
  { id: 'avatar-tts', label: 'TTS (ElevenLabs)', component: TtsElevenLabsSection },
  { id: 'avatar-voice-chat', label: 'Hands-Free Voice', component: VoiceChatSection },
  { id: 'avatar-audio-file', label: 'Audio File Test', component: AudioFileTestSection },
  { id: 'avatar-anim-upload', label: 'Animation Upload', component: AnimationUploadSection },
];
