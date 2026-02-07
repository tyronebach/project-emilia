# Avatar Animation System Architecture

This document defines the comprehensive VRM avatar animation architecture for Emilia, designed as a game-quality interactive companion system.

## Design Goals

1. **Responsive** — Sub-50ms reaction to speech, emotions, triggers
2. **Natural** — Layered animations blend seamlessly (breathing + talking + emotions)
3. **Extensible** — Easy to add new animations, expressions, behaviors
4. **Performant** — 60fps on desktop, 30fps minimum on mobile

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AnimationController                          │
│  Central orchestrator - owns all subsystems, handles priorities  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ LookAtSystem │  │ ProceduralLayer│ │   ClipLayer (VRMA/GLB) │  │
│  │             │  │               │  │                         │  │
│  │ • Eye gaze  │  │ • AutoBlink   │  │ • IdleClips            │  │
│  │ • Head track│  │ • Breathing   │  │ • GestureClips         │  │
│  │ • Target    │  │ • MicroSway   │  │ • EmoteClips           │  │
│  └─────────────┘  └───────────────┘  └─────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    ExpressionMixer                           │  │
│  │  Blends facial expressions from multiple sources with prio  │  │
│  │                                                               │  │
│  │  Channels:                                                    │  │
│  │  ├─ LipSync (aa, ih, ou, ee, oh) ─────────── Priority: 100   │  │
│  │  ├─ Emotion (happy, sad, angry, etc) ─────── Priority: 80    │  │
│  │  ├─ Blink ────────────────────────────────── Priority: 60    │  │
│  │  └─ ClipExpressions (from VRMA) ──────────── Priority: 40    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Priority System

Higher priority layers override lower for the same expression/bone.

| Layer | Priority | Scope | Description |
|-------|----------|-------|-------------|
| **LipSync** | 100 | Mouth expressions | Driven by TTS audio alignment |
| **Emotion** | 80 | Face expressions | Mood from agent response |
| **Blink** | 60 | blink/blinkL/blinkR | Procedural random blinks |
| **LookAt** | 50 | Eye/head rotation | Tracks user or random wander |
| **Gesture** | 40 | Upper body bones | One-shot clips (wave, nod) |
| **Idle** | 20 | Full body bones | Looping idle animations |
| **Procedural** | 10 | Spine/head | Breathing, micro-movements |

### Conflict Resolution

- **Expression conflicts:** Higher priority wins for same expression name
- **Bone conflicts:** Additive blending for procedural, replace for clips
- **Blink during emotion change:** Pause blink, wait for eyes open, transition

---

## File Structure

```
frontend/src/avatar/
├── AnimationController.ts     # Central orchestrator (NEW)
├── layers/
│   ├── LookAtSystem.ts        # Eye/head tracking (NEW)
│   ├── ProceduralLayer.ts     # Breathing, micro-sway (refactor from IdleAnimations)
│   ├── BlinkController.ts     # Random blinks with pause support (NEW)
│   └── ClipLayer.ts           # VRMA/GLB playback (refactor from AnimationPlayer)
├── expression/
│   ├── ExpressionMixer.ts     # Priority-based expression blending (NEW)
│   ├── EmotionController.ts   # Mood transitions (refactor from ExpressionController)
│   └── LipSyncEngine.ts       # Existing - character-based visemes
├── clips/
│   ├── ClipLoader.ts          # VRMA + GLB loading with retargeting
│   ├── ClipLibrary.ts         # Animation registry/cache
│   └── ClipRetargeter.ts      # Mixamo → VRM bone mapping
├── AvatarRenderer.ts          # Three.js scene, renderer, VRM loading
├── PostProcessingPipeline.ts  # Bloom, SMAA, OutputPass
├── QualityPresets.ts          # Low/Medium/High settings
└── types.ts                   # Shared types

public/animations/
├── idle/
│   ├── idle_breathe.vrma      # Subtle breathing loop
│   ├── idle_shift.vrma        # Weight shift variant
│   └── idle_tilt.vrma         # Head tilt variant
├── gestures/
│   ├── nod.vrma               # Acknowledgment
│   ├── wave.vrma              # Greeting
│   ├── shrug.vrma             # Uncertainty
│   └── thinking.vrma          # Contemplative pose
└── emotes/
    ├── laugh.vrma             # Happy reaction
    ├── surprised.vrma         # Shock/surprise
    └── sad.vrma               # Sympathetic reaction
```

---

## Core Components

### 1. AnimationController

Central orchestrator that coordinates all subsystems.

```typescript
interface AnimationController {
  // Lifecycle
  init(vrm: VRM): void;
  update(deltaTime: number): void;
  dispose(): void;
  
  // State control
  setMood(emotion: Emotion, intensity?: number): void;
  triggerGesture(name: string, options?: GestureOptions): void;
  startSpeaking(alignment: AlignmentData, audio: HTMLAudioElement): void;
  stopSpeaking(): void;
  
  // Look-at
  setLookAtTarget(target: LookAtTarget): void;
  
  // Subsystem access
  readonly lipSync: LipSyncEngine;
  readonly expressions: ExpressionMixer;
  readonly lookAt: LookAtSystem;
}
```

### 2. ExpressionMixer

Blends expressions from multiple sources by priority.

```typescript
interface ExpressionChannel {
  name: string;
  priority: number;
  expressions: Map<string, number>;  // expressionName → weight
  enabled: boolean;
}

interface ExpressionMixer {
  createChannel(name: string, priority: number): ExpressionChannel;
  setExpression(channel: string, expression: string, weight: number): void;
  clearChannel(channel: string): void;
  
  // Called each frame - applies final blended values
  apply(expressionManager: VRMExpressionManager): void;
}
```

### 3. LookAtSystem

Controls eye gaze and head tracking.

```typescript
type LookAtTarget = 
  | { type: 'camera' }                    // Look at camera (user)
  | { type: 'point'; position: Vector3 }  // Look at world point
  | { type: 'wander' }                    // Random gentle wandering
  | { type: 'fixed'; direction: Vector3 } // Fixed direction

interface LookAtSystem {
  setTarget(target: LookAtTarget): void;
  setBlendWeight(weight: number): void;  // 0-1, for smooth transitions
  
  // Config
  setEyeWeight(weight: number): void;    // How much eyes move (0-1)
  setHeadWeight(weight: number): void;   // How much head moves (0-1)
  setMaxAngle(degrees: number): void;    // Maximum rotation
  
  update(deltaTime: number): void;
}
```

### 4. BlinkController

Handles natural blinking with pause support.

```typescript
interface BlinkController {
  setEnabled(enabled: boolean): Promise<void>;  // Resolves when eyes open
  triggerBlink(): void;                         // Force immediate blink
  
  // Config
  setInterval(min: number, max: number): void;  // Seconds between blinks
  setDuration(ms: number): void;                // Blink close duration
  
  update(deltaTime: number): void;
}
```

### 5. ClipLayer

Handles VRMA and GLB animation playback.

```typescript
interface ClipLayer {
  // Playback
  play(clipName: string, options?: PlayOptions): Promise<void>;
  crossfade(clipName: string, duration: number): Promise<void>;
  stop(fadeOut?: number): void;
  
  // Idle management
  setIdleClips(clips: string[]): void;           // Pool of idle variants
  setIdleTransitionTime(seconds: number): void;  // Time between variants
  
  // State
  readonly isPlaying: boolean;
  readonly currentClip: string | null;
  
  update(deltaTime: number): void;
}

interface PlayOptions {
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  timeScale?: number;
  priority?: 'interrupt' | 'queue' | 'ignore';  // Behavior if something playing
}
```

---

## Expression Names (VRM Standard)

### Emotions
- `happy` / `joy`
- `angry`
- `sad` / `sorrow`
- `surprised`
- `relaxed`
- `neutral`

### Mouth (Lip Sync)
- `aa` — Open (あ)
- `ih` — Slightly open (い)
- `ou` — Rounded (う)
- `ee` — Wide (え)
- `oh` — Open rounded (お)

### Eyes
- `blink` — Both eyes
- `blinkLeft` — Left eye only
- `blinkRight` — Right eye only
- `lookUp`, `lookDown`, `lookLeft`, `lookRight` — Eye direction (some models)

---

## Data Flow

### Speaking Flow

```
1. Backend returns TTS audio + alignment data
2. Chat component calls controller.startSpeaking(alignment, audio)
3. AnimationController:
   a. Sets LookAt → camera (look at user while speaking)
   b. Starts LipSyncEngine with alignment data
   c. Pauses idle clip variations (stays in current idle)
4. LipSyncEngine writes to ExpressionMixer 'lipsync' channel
5. Each frame: ExpressionMixer.apply() blends lipsync + current emotion
6. Audio ends → controller.stopSpeaking()
   a. LipSync fades out mouth expressions
   b. Resume idle variations
   c. LookAt returns to wander mode
```

### Emotion Change Flow

```
1. Agent response includes emotion tag: [emotion:happy]
2. Chat parser extracts emotion, calls controller.setMood('happy', 0.8)
3. AnimationController:
   a. Calls blinkController.setEnabled(false) — pauses blink
   b. Awaits promise (eyes open)
   c. Calls emotionController.transitionTo('happy', 0.8)
   d. EmotionController writes to ExpressionMixer 'emotion' channel
   e. Blending happens over ~300ms
   f. Calls blinkController.setEnabled(true) — resume blinks
```

### Gesture Trigger Flow

```
1. Agent response includes: [gesture:wave]
2. Chat parser calls controller.triggerGesture('wave')
3. AnimationController:
   a. Checks if gesture clip exists
   b. If exists: ClipLayer.play('wave', { priority: 'queue' })
   c. If not: Falls back to procedural animation
4. ClipLayer:
   a. Pauses ProceduralLayer (no conflicting bone movement)
   b. Plays wave.vrma with fadeIn
   c. On complete: fadeOut, resume ProceduralLayer
```

---

## Implementation Phases

### Phase 1: Core Refactor (Current)
- [x] Quality settings + post-processing
- [ ] ExpressionMixer with priority channels
- [ ] BlinkController with pause/resume
- [ ] Refactor ExpressionController → EmotionController

### Phase 2: LookAt System
- [ ] LookAtSystem implementation
- [ ] Camera tracking (VRMLookAt integration)
- [ ] Wander mode with natural saccades
- [ ] Head tracking weight control

### Phase 3: VRMA Support
- [ ] VRMA loader integration
- [ ] Idle clip variants with random selection
- [ ] Gesture clips (nod, wave, shrug)
- [ ] Clip library with preloading

### Phase 4: Polish
- [ ] Emotion ↔ Blink sync
- [ ] Speaking ↔ Gesture coordination
- [ ] Performance profiling
- [ ] Mobile optimization

---

## API Reference

### AnimationController Usage

```typescript
// Initialize (called by AvatarRenderer after VRM loads)
const controller = new AnimationController();
controller.init(vrm);

// In render loop
controller.update(deltaTime);

// From chat component
controller.setMood('happy', 0.8);
controller.triggerGesture('wave');
controller.startSpeaking(alignment, audioElement);

// Cleanup
controller.dispose();
```

### Emotion Tags (Agent Response)

The agent can include emotion/gesture tags in responses:

```
[emotion:happy] I'm so glad you asked!
[gesture:nod] Yes, I understand.
[emotion:thinking] Let me think about that...
[gesture:wave] Hello there!
```

Parser extracts these before displaying text.

---

## Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame time | <16.6ms (60fps) | requestAnimationFrame callback |
| Expression updates | <1ms | ExpressionMixer.apply() |
| Bone updates | <2ms | AnimationMixer.update() |
| LookAt calculation | <0.5ms | Per-frame IK solve |

---

## Dependencies

- `@pixiv/three-vrm` — VRM loading, expressions, humanoid
- `@pixiv/three-vrm-animation` — VRMA loading (to add)
- `three` — Scene, AnimationMixer, bones
- `zustand` — State management for settings

---

## References

- [VRM Specification](https://vrm.dev/en/)
- [VRMA Specification](https://vrm.dev/en/vrma/)
- [three-vrm GitHub](https://github.com/pixiv/three-vrm)
- [ChatVRM Reference](https://github.com/pixiv/ChatVRM)
- Beatrice's research: `/docs/ANIMATION-SYSTEM.md`
