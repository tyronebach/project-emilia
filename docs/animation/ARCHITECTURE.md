# Animation & Behavior System Architecture

> Last updated: 2026-02-06

## Overview

Emilia uses a **behavior-centric** avatar system. The LLM emits semantic intents (e.g., `[intent:greeting]`), and the **BehaviorPlanner** decides what the avatar actually does — selecting from weighted behavior candidates with randomization to avoid repetition.

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
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│ Behavior │Expression│  Blink   │  LookAt  │ LipSync  │  Animation   │
│ Planner  │  Mixer   │Controller│  System  │  Engine  │    Graph     │
├──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┤
│ Micro-Behavior Controller  │  Ambient Behavior                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           VRM Model                                  │
│   expressionManager (face)  │  humanoid.bones  │  lookAt (eyes)     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
LLM Response
  │
  ├── [intent:greeting] [mood:happy] [energy:high] Hello!
  │
  ▼
Backend (parse_chat.py)
  │
  ├── Extracts: { intent: "greeting", mood: "happy", energy: "high" }
  ├── Strips tags from text
  │
  ▼
Frontend SSE Stream
  │
  ├── event: avatar → { intent, mood, intensity, energy }
  ├── data: { content: "Hello!" }
  │
  ▼
Store.applyAvatarCommand()
  │
  ▼
AnimationController.handleIntent({ intent, mood, energy })
  │
  ▼
BehaviorPlanner.plan(input)
  │
  ├── Selects from weighted candidates (e.g., greeting → wave:0.4, nod:0.3, head_tilt:0.2)
  ├── Anti-repetition: reduces weight of recently used gestures
  ├── Energy multiplier: low=0.7x, medium=1.0x, high=1.3x
  │
  ▼
AnimationController.executeBehavior(output)
  │
  ├── Face → ExpressionMixer 'emotion' channel
  ├── Body → AnimationGraph (gesture crossfade over idle)
  ├── Eyes → LookAtSystem (glance targets)
  └── Micro-behaviors → MicroBehaviorController queue
```

---

## Subsystems

| System | Purpose | Output Target |
|--------|---------|---------------|
| **BehaviorPlanner** | Maps intents → weighted random behavior selection | Drives all subsystems below |
| **ExpressionMixer** | Priority-based blending of facial expressions from multiple channels | `vrm.expressionManager.setValue()` |
| **BlinkController** | Procedural random blinks (2-6s interval) | ExpressionMixer `blink` channel |
| **LookAtSystem** | Eyes follow camera + head bone rotation + glance-away support | VRM lookAt target + head bone quaternion |
| **LipSyncEngine** | Maps ElevenLabs alignment → VRM mouth shapes via ExpressionMixer | ExpressionMixer `lipsync` channel |
| **AnimationGraph** | Unified animation mixer with base (idle) and gesture layers | `THREE.AnimationMixer` on VRM bones |
| **MicroBehaviorController** | Priority queue for delayed ambient behaviors | Schedules glances, nods, shifts |
| **AmbientBehavior** | Continuous generator for idle micro-behaviors | Feeds MicroBehaviorController |

### Expression Priority Channels

| Channel | Priority | Expressions | Source |
|---------|----------|-------------|--------|
| **lipsync** | 100 | aa, ih, ou, ee, oh | LipSyncEngine |
| **emotion** | 80 | happy, sad, angry, surprised, relaxed | BehaviorPlanner |
| **blink** | 60 | blink | BlinkController |
| **gesture** | 40 | (from VRMA expression tracks) | AnimationGraph |

Higher priority wins for the same expression name. Mouth visemes (lipsync) and facial emotions (emotion) target different VRM expressions, so they coexist naturally.

---

## File Structure

```
frontend/src/avatar/
├── AvatarRenderer.ts          # Main renderer, creates VRM + AnimationController
├── AnimationController.ts     # Central orchestrator + handleIntent() API
├── AnimationGraph.ts          # Unified animation mixer (base + gesture layers)
├── AnimationPlayer.ts         # Plays triggered animations via AnimationGraph
├── AnimationLibrary.ts        # Loads/caches GLB and VRMA files
├── AnimationStateMachine.ts   # Maps action names → animation files via config
├── IdleAnimations.ts          # Loops VRMA idle animation via AnimationGraph
├── LipSyncEngine.ts           # Character-based lip sync via ExpressionMixer
├── behavior/
│   ├── BehaviorPlanner.ts     # Core brain: intent → weighted behavior selection
│   ├── behavior-mappings.ts   # Intent → BehaviorCandidate[] tables
│   ├── MicroBehaviorController.ts  # Priority queue scheduler
│   └── AmbientBehavior.ts     # Continuous idle behavior generator
├── expression/
│   └── ExpressionMixer.ts     # Priority-based expression blending (sole VRM writer)
├── layers/
│   ├── BlinkController.ts     # Procedural eye blinks
│   └── LookAtSystem.ts        # Eye + head tracking + glance support
├── types/
│   └── behavior.ts            # Intent, Mood, EnergyLevel, BehaviorInput/Output types
├── types.ts                   # Shared animation types
└── index.ts                   # Public exports
```

---

## AnimationGraph (Unified Mixer)

Single `THREE.AnimationMixer` replaces the old dual-mixer architecture.

```
AnimationGraph
├── Base Layer (idle)
│   └── Always playing, loops continuously, never pauses
│
└── Gesture Layer (crossfade)
    └── Gestures crossfade: idle weight reduces during gesture, restores on completion
```

**Key behaviors:**
- Idle NEVER pauses — gestures blend over it using weight crossfade
- `playBase(clip)` — sets the looping idle animation
- `playCrossfade(clip, options)` — plays gesture with configurable fadeIn/fadeOut/weight
- Single `update(deltaTime)` drives everything

---

## BehaviorPlanner

The brain that converts semantic intents into concrete avatar behaviors.

### Intent Vocabulary

| Intent | Possible Behaviors |
|--------|-------------------|
| `greeting` | wave, nod, head_tilt, just smile |
| `farewell` | wave, nod, bow |
| `agreement` | nod, smile |
| `disagreement` | head_shake, frown |
| `thinking` | thinking pose, look away |
| `listening` | eye contact, small nods |
| `affection` | soft smile, head tilt |
| `embarrassed` | look away, shy pose |
| `playful` | smirk, energetic gestures |
| `curious` | lean forward, head tilt |
| `surprised` | wide expression, startled |
| `pleased` | smile, relaxed |
| `annoyed` | frown, tension |
| `attention-seeking` | lean in, direct gaze |
| `neutral` | minimal expression |

### Mood & Energy

- **Mood** (`happy`, `sad`, `angry`, `calm`, `anxious`, `neutral`) — persistent emotional state
- **Energy** (`low`, `medium`, `high`) — affects intensity multiplier (0.7x, 1.0x, 1.3x)

### Anti-Repetition

BehaviorPlanner tracks history of last 5 gestures. Recently used gestures get 0.3x weight reduction to ensure variety.

---

## Micro-Behaviors

Subtle movements that make the avatar feel alive between interactions.

| Behavior | When | Interval |
|----------|------|----------|
| Glance away + back | Not speaking, 40% chance | Every 4-8s |
| Posture shift | Always | Every 10-20s |
| Listening nods | User speaking, 30% chance | Every 3-6s |

Driven by `AmbientBehavior` (generates) → `MicroBehaviorController` (schedules) → `AnimationController` (executes).

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
          AnimationGraph.playCrossfade(clip)
```

### File Types

| Type | Format | Retargeting | Notes |
|------|--------|-------------|-------|
| **VRMA** | VRM Animation | None needed | Native VRM format, preferred |
| **GLB** | glTF Binary | Mixamo/BVH bone mapping | Requires `retargetToVRM()` |

---

## Configuration

### State Machine (`public/animations/state-machine.json`)

Maps action names to animation files:

```json
{
  "idle": {
    "file": "fm_vrma_motion_pack_01_03.vrma",
    "loop": true,
    "fadeIn": 0.3,
    "fadeOut": 0.3
  },
  "actions": {
    "wave": { "file": "vrmaMotionPack_01.vrma" },
    "bow": { "file": "fm_vrma_motion_pack_01_01.vrma" },
    "nod": { "file": "fm_vrma_motion_pack_01_02.vrma" },
    "thinking": { "file": "fm_vrma_motion_pack_01_04.vrma", "loop": true },
    "shy": { "file": "fm_vrma_motion_pack_01_05.vrma" },
    "surprised": { "file": "fm_vrma_motion_pack_01_06.vrma" }
  }
}
```

---

## Adding New Animations

1. Add `.vrma` or `.glb` file to `frontend/public/animations/`
2. Add entry to `animation-manifest.json`
3. Map action name in `state-machine.json`
4. Add to behavior mappings in `behavior/behavior-mappings.ts` (map intent → new gesture)

---

## LLM Tag Format

```
[intent:greeting] [mood:happy] [energy:high] Hello there!
```

All tags are optional. Missing values use defaults:
- `intent` → `neutral`
- `mood` → persists from previous
- `energy` → `medium`

Tags are stripped from displayed text by `stripAvatarTags()` in `frontend/src/utils/api.ts`.

---

## Debugging

### Debug Panel

The `AvatarDebugPanel` provides:
- Animation dropdown (grouped by VRMA/GLB/Procedural)
- Play/stop controls
- State machine action triggers
- Expression values display

### Console Log Prefixes

- `[AnimationController]` — Orchestrator lifecycle + handleIntent
- `[BehaviorPlanner]` — Intent → behavior selection
- `[AnimationGraph]` — Unified mixer playback
- `[AnimationPlayer]` — Triggered animation playback
- `[AnimationLibrary]` — File loading
- `[IdleAnimations]` — Idle loop state
- `[LipSync]` — Mouth shape application
- `[LookAtSystem]` — Eye/head tracking + glances
- `[Store]` — applyAvatarCommand routing

---

## Known Issues & Considerations

1. **GLB Retargeting**: Only rotation tracks are kept (no position/translation) to prevent flying/sliding. Upper body bones only for BVH sources.

2. **VRM Version Detection**: LookAtSystem detects VRM 0.x vs 1.0 via `meta.metaVersion` and adjusts coordinate calculations accordingly.

3. **Audio Source Limitation**: Each HTMLAudioElement can only have one MediaElementSourceNode. LipSyncEngine reuses the source node if available.

4. **Interaction System**: Touch/click reactions (InteractionSensor) are planned but not yet implemented. Currently, only LLM-driven intents trigger behaviors.

---

## Next Steps for Developers

### Ready to implement

1. **InteractionSensor** — Touch/click on avatar canvas triggers BehaviorPlanner reactions (tap face → surprised, hold → affection, etc.). See `../archive/BEHAVIOR-SYSTEM-SPEC.md` for full design. Requires raycasting against VRM mesh + bone zone detection.

2. **Agent prompt update** — Update Emilia's Clawdbot SOUL.md to emit `[intent:X] [mood:X] [energy:X]` tags instead of old format. The intent vocabulary is defined in `frontend/src/avatar/types/behavior.ts`. The backend and frontend already fully support the new tags.

3. **Posture shift micro-behavior** — `AmbientBehavior.ts` schedules `posture_shift` events but `AnimationController.executeMicroBehavior()` only handles glance types currently. Need to add a subtle body animation for posture shifts (small idle variant crossfade or procedural bone nudge).

4. **Listening nod micro-behavior** — `AmbientBehavior.ts` generates `nod_small` during listening state, but `AnimationController` needs to know when the user is actively typing/speaking. Wire `setListening(true)` from the chat input focus or voice input state.

### Polish / nice-to-have

5. **Tune behavior weights** — The mappings in `behavior-mappings.ts` are initial estimates. Test with real conversations and adjust gesture weights, energy multipliers, and anti-repetition decay.

6. **Multiple idle variants** — Currently one idle VRMA loops. AnimationGraph supports `playBase()` switching — add 2-3 idle variants and rotate them periodically via AmbientBehavior.

7. **VRMA expression tracks** — Some VRMA files include expression tracks (smile during wave). These should write to ExpressionMixer's `gesture` channel (priority 40) so they don't fight with emotion channel. Currently expression tracks in VRMAs are applied directly by the mixer and may conflict.
