# Animation System Architecture

Comprehensive documentation of the Emilia avatar animation system.

## Overview

The animation system is a multi-layered architecture that coordinates:
- Body animations (idle, gestures)
- Facial expressions (emotions, lip sync, blinks)
- Procedural head/eye movement (LookAt, micro-behaviors)
- State-driven behavior profiles

```
┌─────────────────────────────────────────────────────────────────┐
│                    AnimationController                          │
│                  (Central Orchestrator)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Expression  │  │  Animation  │  │    Procedural Systems   │ │
│  │   Mixer     │  │    Graph    │  │                         │ │
│  │             │  │             │  │  • LookAtSystem         │ │
│  │  Channels:  │  │  • Idle     │  │  • IdleMicroBehaviors   │ │
│  │  • lipsync  │  │  • Gesture  │  │  • BlinkController      │ │
│  │  • emotion  │  │  • Blend    │  │                         │ │
│  │  • blink    │  │             │  │                         │ │
│  │  • twitch   │  │             │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Hierarchy

### Update Order (per frame)

```
1. AnimationGraph.update()      → body animation playback
2. LookAtSystem.update()        → head/eyes toward camera
3. IdleMicroBehaviors.update()  → additive head variety
4. BlinkController.update()     → procedural blinks
5. LipSyncEngine.update()       → mouth shapes
6. ExpressionMixer.apply()      → blend all expressions to VRM
```

### Priority System (ExpressionMixer)

Higher priority channels override lower for the same expression:

| Channel  | Priority | Purpose |
|----------|----------|---------|
| lipsync  | 100      | Mouth shapes during TTS |
| emotion  | 80       | happy, sad, angry, etc. |
| blink    | 60       | Procedural eye blinks |
| twitch   | 50       | Micro-behavior eye twitches |
| gesture  | 40       | Expression from animation clips |
| clip     | 20       | Lowest priority |

---

## Body Animation

### AnimationGraph

Central animation playback system using Three.js AnimationMixer.

**Layers:**
- **Base layer**: Idle animation (always playing, loops)
- **Gesture layer**: One-shot animations (wave, bow, dance)

**Key Methods:**
```ts
animationGraph.playBase(clip, crossfade)   // Switch idle animation
animationGraph.playGesture(clip, options)  // Play one-shot gesture
animationGraph.isGesturePlaying()          // Check if gesture active
```

### IdleAnimations + IdleRotator

Rotates through a pool of idle animations for variety.

**Configuration** (`state-machine.json`):
```json
{
  "idle": {
    "file": "mixamo_fbx/idles/idle_breathing.fbx",
    "fadeIn": 0.3,
    "fadeOut": 0.3
  },
  "idles": [
    { "file": "mixamo_fbx/idles/idle_breathing.fbx", "weight": 2 },
    { "file": "mixamo_fbx/idles/idle_subtle.fbx", "weight": 2 },
    { "file": "mixamo_fbx/idles/neutral_idle.fbx", "weight": 1 }
  ]
}
```

**Behavior:**
- Preloaded at startup (no stutter)
- Random weighted selection every 8-16 seconds
- 0.4s crossfade between idles
- Avoids consecutive repeats

### Gesture Animations

One-shot animations triggered by LLM or user.

**Loading:** Lazy-loaded on first use (small delay acceptable)

**Configuration** (`state-machine.json`):
```json
{
  "actions": {
    "wave": { "file": "mixamo_fbx/Waving.fbx", "fadeIn": 0.25 },
    "bow": { "file": "mixamo_fbx/Quick_Informal_Bow.fbx" },
    "dance": { "file": "mixamo_fbx/Snake_Hip_Hop_Dance.fbx", "loop": true }
  }
}
```

**Triggering:**
```ts
animationController.triggerGesture('wave', { fadeIn: 0.25 });
```

---

## Facial Expressions

### ExpressionMixer

Priority-based blending of facial blend shapes.

**How it works:**
1. Multiple sources set expressions on their channel
2. Each frame, higher priority wins for same expression
3. Final values applied to VRM expression manager

```ts
// Emotion sets happy
expressionMixer.setExpression('emotion', 'happy', 0.8);

// Lip sync sets mouth shape
expressionMixer.setExpression('lipsync', 'aa', 0.5);

// Blink sets eye closure
expressionMixer.setExpression('blink', 'blink', 1.0);

// Apply to VRM
expressionMixer.apply();
```

### BlinkController

Procedural blinking with additive eye state.

**Features:**
- Random intervals (2-6 seconds)
- Respects current eye state from emotions
- If emotion has eyes 50% closed, blink goes 50%→100%
- Pause/resume for gesture coordination

**Emotion eye closure mapping:**
```ts
EMOTION_EYE_CLOSURE = {
  angry: 0.3,
  happy: 0.15,
  relaxed: 0.2,
  sleepy: 0.4,
}
```

### LipSyncEngine

Mouth shape animation synchronized to TTS audio.

**Flow:**
1. Backend returns phoneme alignment data
2. Frontend plays audio + alignment
3. LipSyncEngine maps phonemes to VRM visemes
4. Applies via lipsync channel (highest priority for mouth)

---

## Procedural Head/Eye Movement

### LookAtSystem

Eyes and head track toward camera.

**Components:**
- **Eye tracking**: VRM's built-in `vrm.lookAt` (bone or expression type)
- **Head tracking**: Manual bone rotation toward camera

**Configuration:**
```ts
{
  enabled: true,
  headTrackingEnabled: true,
  maxYaw: 30,           // degrees left/right
  maxPitchUp: 25,
  maxPitchDown: 15,
  headWeight: 0.4,      // head follows 40%, eyes do rest
  smoothSpeed: 6,
}
```

**User toggle:** Settings → "Eye & head follow" (per-user localStorage)

### IdleMicroBehaviors

State-driven procedural micro-movements during idle.

**Behaviors:**

| Type | Description |
|------|-------------|
| Head glances | Random look away, hold, return |
| Head tilts | Subtle roll side-to-side |
| Eye twitches | Quick partial blinks |

**Profiles (auto-switch with emotion):**

| State | Glance Interval | Range | Twitches |
|-------|-----------------|-------|----------|
| neutral | 4-10s | 20° | occasional |
| relaxed | 8-16s | 12° | none |
| anxious | 1.5-4s | 35° | frequent |
| excited | 2-5s | 28° | moderate |
| sad | 6-12s | 15° | none |
| thinking | 3-7s | 25° | none |

**Order of operations:**
1. LookAt sets head toward camera
2. IdleMicroBehaviors adds rotation ON TOP (additive)

**Pause behavior:**
- Automatically pauses during gesture animations
- Resumes when returning to idle

---

## Behavior System

### BehaviorPlanner

Interprets LLM output tags into animation commands.

**Tag parsing:**
```
[INTENT:greeting] [MOOD:happy] [ENERGY:high]
```

**Maps to:**
- Gesture selection (wave for greeting)
- Emotion setting (happy expression)
- Micro-behavior profile (excited for high energy)

### AmbientBehavior

Produces natural ambient micro-behaviors.

**Triggers:**
- Listening nods (when user is speaking)
- Glances (scheduled randomly) — now handled by IdleMicroBehaviors

### MicroBehaviorController

Schedules and executes micro-behaviors with delays.

---

## Configuration Files

### animation-manifest.json

Registry of all available animations.

```json
[
  { "id": "mixamo_fbx/Waving.fbx", "name": "Wave", "type": "fbx" },
  { "id": "mixamo_fbx/idles/idle_breathing.fbx", "name": "Idle Breathing", "type": "fbx" }
]
```

### state-machine.json

Animation state configuration.

```json
{
  "idle": { "file": "...", "fadeIn": 0.3 },
  "idles": [ { "file": "...", "weight": 2 } ],
  "actions": {
    "wave": { "file": "...", "fadeIn": 0.25 }
  },
  "defaults": {
    "fadeIn": 0.25,
    "fadeOut": 0.25,
    "returnToIdle": true
  }
}
```

---

## User Settings

Stored per-user in localStorage (`emilia-render-settings-v2`).

| Setting | Default | Description |
|---------|---------|-------------|
| lookAtEnabled | true | Eye & head follow camera |
| cameraDriftEnabled | true | Camera auto-reset after inactivity |
| preset | medium | Graphics quality |

---

## File Structure

```
frontend/src/avatar/
├── AnimationController.ts      # Central orchestrator
├── AnimationGraph.ts           # Body animation playback
├── AnimationLibrary.ts         # FBX/GLB loading & caching
├── AnimationStateMachine.ts    # Config loading & preloading
├── AnimationPlayer.ts          # Gesture triggering
├── IdleAnimations.ts           # Idle rotation system
├── IdleRotator.ts              # Weighted random idle selection
├── AvatarRenderer.ts           # Three.js scene & VRM loading
├── LipSyncEngine.ts            # Phoneme-to-viseme mapping
│
├── expression/
│   └── ExpressionMixer.ts      # Priority-based expression blending
│
├── layers/
│   ├── BlinkController.ts      # Procedural blinks
│   ├── LookAtSystem.ts         # Eye/head camera tracking
│   └── IdleMicroBehaviors.ts   # State-driven micro-movements
│
├── behavior/
│   ├── BehaviorPlanner.ts      # LLM tag interpretation
│   ├── AmbientBehavior.ts      # Ambient movement triggers
│   └── MicroBehaviorController.ts  # Micro-behavior scheduling
│
└── types/
    └── behavior.ts             # Behavior type definitions

frontend/public/animations/
├── animation-manifest.json     # Animation registry
├── state-machine.json          # State machine config
└── mixamo_fbx/
    ├── idles/                  # Idle animation pool
    └── *.fbx                   # Gesture animations
```

---

## Adding New Animations

### 1. Add FBX file
```
frontend/public/animations/mixamo_fbx/NewAnimation.fbx
```

### 2. Register in manifest
```json
{ "id": "mixamo_fbx/NewAnimation.fbx", "name": "New Animation", "type": "fbx" }
```

### 3. Add to state machine (if gesture)
```json
"actions": {
  "new_action": { "file": "mixamo_fbx/NewAnimation.fbx", "fadeIn": 0.25 }
}
```

### 4. Rebuild frontend
```bash
cd frontend && npm run build
```

---

## Adding New Micro-Behavior Profile

In `IdleMicroBehaviors.ts`:

```ts
const PROFILES: Record<string, MicroProfile> = {
  // ... existing profiles ...
  
  sleepy: {
    name: 'sleepy',
    glanceEnabled: true,
    glanceIntervalMin: 10,
    glanceIntervalMax: 20,
    glanceYawRange: 8,
    glancePitchRange: 5,
    glanceHoldDuration: 2.5,
    glanceSmoothSpeed: 1.5,
    tiltEnabled: true,
    tiltIntervalMin: 15,
    tiltIntervalMax: 25,
    tiltRange: 3,
    tiltHoldDuration: 4.0,
    twitchEnabled: false,
    twitchChance: 0,
    twitchIntensity: 0,
    twitchDuration: 0,
  },
};
```

---

## Debugging

### Debug Panel

The Avatar Debug Panel (`/debug`) provides:
- Animation playback controls
- Expression sliders
- State machine action list
- Real-time bone/expression visualization

### Console Logs

Key prefixes:
- `[AnimationController]` - orchestration events
- `[AnimationGraph]` - playback state changes
- `[IdleRotator]` - idle switches
- `[LookAtSystem]` - head tracking
- `[IdleMicroBehaviors]` - state changes
- `[ExpressionMixer]` - expression application

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Animation not playing | Not in manifest | Add to animation-manifest.json |
| Gesture has no effect | Not in state machine | Add to state-machine.json actions |
| Head stuck | LookAt disabled | Check user settings |
| No micro-movements | IdleMicroBehaviors paused | Check if gesture stuck playing |
