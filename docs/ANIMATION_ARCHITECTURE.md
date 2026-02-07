# Animation System Architecture

> Last updated: 2026-02-06

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AvatarRenderer                                │
│    Creates VRM, initializes AnimationController, runs update loop    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AnimationController                              │
│              Central orchestrator (update() each frame)              │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┤
│ Expression  │    Blink    │   LookAt    │   LipSync   │    Idle     │
│   Mixer     │  Controller │   System    │   Engine    │ Animations  │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘
       │             │             │             │             │
       ▼             ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           VRM Model                                  │
│   expressionManager (face)  │  humanoid.bones  │  lookAt (eyes)     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Subsystems

| System | Purpose | Output Target |
|--------|---------|---------------|
| **ExpressionMixer** | Priority-based blending of facial expressions from multiple channels (lipsync > emotion > blink > gesture) | `vrm.expressionManager.setValue()` |
| **BlinkController** | Procedural random blinks (2-6s interval) | Writes to ExpressionMixer `blink` channel |
| **LookAtSystem** | Eyes follow camera (VRM handles), head bone rotation (manual) | VRM lookAt target + head bone quaternion |
| **LipSyncEngine** | Maps ElevenLabs char alignment → VRM mouth shapes (aa/ih/ou/ee/oh) with audio volume weighting | `vrm.expressionManager.setValue()` directly |
| **IdleAnimations** | Loops a VRMA file as base pose | Own `AnimationMixer` (separate from triggered) |
| **AnimationPlayer** | Plays triggered animations (wave, bow, etc.) | Own `AnimationMixer` |

---

## File Structure

```
frontend/src/avatar/
├── AvatarRenderer.ts          # Main renderer, creates VRM + AnimationController
├── AnimationController.ts     # Central orchestrator
├── AnimationPlayer.ts         # Plays triggered animations (wave, bow, etc.)
├── AnimationLibrary.ts        # Loads/caches GLB and VRMA files
├── AnimationStateMachine.ts   # Maps action names → animation files via config
├── IdleAnimations.ts          # Loops VRMA idle animation
├── LipSyncEngine.ts           # Character-based lip sync from ElevenLabs
├── expression/
│   └── ExpressionMixer.ts     # Priority-based expression blending
├── layers/
│   ├── BlinkController.ts     # Procedural eye blinks
│   └── LookAtSystem.ts        # Eye + head tracking toward camera
├── types.ts                   # Shared types
└── index.ts                   # Public exports
```

---

## Animation File Loading

```
state-machine.json                animation-manifest.json
       │                                    │
       ▼                                    ▼
AnimationStateMachine              AnimationLibrary
  (action→file mapping)            (loads GLB/VRMA files)
       │                                    │
       └──────────────┬────────────────────┘
                      ▼
               AnimationPlayer.play(name)
                      │
        ┌─────────────┴─────────────┐
        │                           │
    VRMA files                  GLB files
  (native VRM clips)         (need retargeting)
```

### File Types

| Type | Format | Retargeting | Notes |
|------|--------|-------------|-------|
| **VRMA** | VRM Animation | None needed | Native VRM format, preferred |
| **GLB** | glTF Binary | Mixamo/BVH bone mapping | Requires `retargetToVRM()` in AnimationPlayer |

---

## Configuration Files

### State Machine (`public/animations/state-machine.json`)

Maps action names to animation files with transition settings:

```json
{
  "version": 1,
  "name": "Default Animation State Machine",
  
  "idle": {
    "file": "fm_vrma_motion_pack_01_03.vrma",
    "loop": true,
    "fadeIn": 0.3,
    "fadeOut": 0.3
  },
  
  "actions": {
    "wave": {
      "file": "vrmaMotionPack_01.vrma",
      "fadeIn": 0.25,
      "fadeOut": 0.25
    },
    "bow": { "file": "fm_vrma_motion_pack_01_01.vrma" },
    "nod": { "file": "fm_vrma_motion_pack_01_02.vrma" },
    "dance": { "file": "blingBangBangBorn.vrma" },
    "thinking": { "file": "fm_vrma_motion_pack_01_04.vrma", "loop": true },
    "excited": { "file": "maitakeDance.vrma" },
    "shy": { "file": "fm_vrma_motion_pack_01_05.vrma" },
    "surprised": { "file": "fm_vrma_motion_pack_01_06.vrma" }
  },
  
  "defaults": {
    "fadeIn": 0.25,
    "fadeOut": 0.25,
    "loop": false,
    "returnToIdle": true
  }
}
```

### Animation Manifest (`public/animations/animation-manifest.json`)

Auto-discovered list of available animation files:

```json
[
  { "id": "wave.glb", "name": "Wave", "type": "glb" },
  { "id": "vrmaMotionPack_01.vrma", "name": "VrmaMotionPack 01", "type": "vrma" }
]
```

---

## Data Flows

### Speaking (Lip Sync)

```
Chat sends audio + alignment
         │
         ▼
AnimationController.startSpeaking(alignment, audioElement)
         │
         ├──► LipSyncEngine.setAlignment(alignment, audioDurationMs)
         │         └── Scales timestamps to actual audio duration
         │
         ├──► LipSyncEngine.startSync(audioElement)
         │         └── Sets up Web Audio analyser for volume detection
         │
         └──► IdleAnimations.pause()

Each frame (update loop):
         │
         ▼
LipSyncEngine.update()
         │
         ├── Get audio.currentTime
         ├── Find matching char in timing data
         ├── Map char → VRM mouth shape (aa/ih/ou/ee/oh)
         ├── Get audio volume for weight
         └── Apply to expressionManager

Audio ends:
         │
         ▼
AnimationController.stopSpeaking()
         │
         ├──► LipSyncEngine.stop()
         └──► IdleAnimations.resume()
```

### Triggered Animation

```
triggerGesture("wave")
         │
         ▼
AnimationPlayer.play("wave")
         │
         ├── AnimationStateMachine.getAction("wave")
         │         └── Returns { file: "vrmaMotionPack_01.vrma", fadeIn: 0.25, ... }
         │
         ├── AnimationLibrary.load("vrmaMotionPack_01.vrma")
         │         └── Returns cached or loads VRMA, creates clip bound to VRM
         │
         ├── IdleAnimations.pause()
         │
         └── mixer.clipAction(clip).play()

Animation finishes (mixer 'finished' event):
         │
         ▼
onAnimationFinished()
         │
         ├── Stop + uncache action/clip
         └── IdleAnimations.resume()
```

### Expression Blending

```
Multiple sources set expressions:
         │
         ├── LipSyncEngine → 'lipsync' channel (priority 100)
         ├── setMood() → 'emotion' channel (priority 80)
         ├── BlinkController → 'blink' channel (priority 60)
         └── Gestures → 'gesture' channel (priority 40)

ExpressionMixer.apply() each frame:
         │
         ├── Sort channels by priority (descending)
         ├── For each expression, highest priority wins
         └── Apply final values to vrm.expressionManager
```

---

## Key Classes

### AnimationController

Central orchestrator that:
- Initializes all subsystems when VRM loads
- Calls `update()` on each subsystem every frame
- Provides public API: `setMood()`, `triggerGesture()`, `startSpeaking()`, `stopSpeaking()`

### ExpressionMixer

Priority-based expression blending:
- Channels: lipsync (100), emotion (80), blink (60), gesture (40)
- Higher priority overrides lower for same expression
- Prevents conflicts (e.g., lipsync mouth shapes override emotion mouth)

### LipSyncEngine

Character-based lip sync:
- Input: ElevenLabs alignment (chars + timestamps)
- Maps chars to VRM mouth shapes: a→aa, e→ee, i→ih, o→oh, u→ou
- Uses Web Audio API analyser for volume-based weight
- Applies directly to expressionManager (not through mixer for performance)

### AnimationPlayer

Triggered animation playback:
- Queries AnimationStateMachine for action → file mapping
- Loads via AnimationLibrary (caches clips)
- VRMA: plays directly (native VRM format)
- GLB: retargets bone names (Mixamo/BVH → VRM humanoid)
- Pauses/resumes IdleAnimations around playback

### IdleAnimations

Base pose animation:
- Loads config from AnimationStateMachine
- Loops VRMA file continuously
- Separate AnimationMixer (doesn't conflict with triggered animations)
- Pause/resume API for triggered animation coordination

### LookAtSystem

Eye and head tracking:
- Eyes: VRM's built-in lookAt (set target to camera)
- Head: Manual bone rotation with constraints (±30° yaw, +25°/-15° pitch)
- Handles VRM 0.x vs 1.0 coordinate differences

### BlinkController

Procedural blinking:
- Random interval: 2-6 seconds
- Phases: open → closing → closed (120ms) → opening
- Writes to ExpressionMixer 'blink' channel
- Can be paused during emotion transitions

---

## Adding New Animations

1. **Add file** to `frontend/public/animations/` (.vrma preferred, .glb supported)

2. **Update manifest** (`animation-manifest.json`):
   ```json
   { "id": "new_animation.vrma", "name": "New Animation", "type": "vrma" }
   ```

3. **Map action** in `state-machine.json` (optional, for named actions):
   ```json
   "actions": {
     "celebrate": {
       "file": "new_animation.vrma",
       "loop": false,
       "fadeIn": 0.3,
       "fadeOut": 0.3
     }
   }
   ```

4. **Trigger** via `animationController.triggerGesture("celebrate")`

---

## Debugging

### Debug Panel

The `AvatarDebugPanel` component provides:
- Animation dropdown (grouped by VRMA/GLB/Procedural)
- Play/stop controls
- Lip sync config sliders
- LookAt state display
- Expression values

### Console Logs

Key prefixes:
- `[AnimationController]` - Orchestrator lifecycle
- `[AnimationPlayer]` - Triggered animation playback
- `[AnimationLibrary]` - File loading
- `[AnimationStateMachine]` - Config loading
- `[IdleAnimations]` - Idle loop state
- `[LipSync]` - Mouth shape application
- `[LookAtSystem]` - Eye/head tracking

---

## Known Issues & Considerations

1. **Two AnimationMixers**: IdleAnimations and AnimationPlayer each have their own mixer. This is intentional to prevent clip conflicts, but means they operate independently.

2. **GLB Retargeting**: Only rotation tracks are kept (no position/translation) to prevent flying/sliding. Upper body bones only for BVH sources.

3. **VRM Version Detection**: LookAtSystem detects VRM 0.x vs 1.0 via `meta.metaVersion` and adjusts coordinate calculations accordingly.

4. **Audio Source Limitation**: Each HTMLAudioElement can only have one MediaElementSourceNode. LipSyncEngine reuses the source node if available.
