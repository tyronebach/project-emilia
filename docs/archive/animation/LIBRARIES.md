# Animation Libraries & Tools

NPM packages and libraries for VRM animation in Three.js.

## VRM-Specific Packages

### @pixiv/three-vrm
**Core VRM library**

```bash
npm install @pixiv/three-vrm
```

- VRM model loading via GLTF loader plugin
- Expression control (`VRMExpressionManager`)
- LookAt control (eye tracking)
- Spring bone physics (hair, clothes)
- First-person camera support

```typescript
import { VRMLoaderPlugin } from '@pixiv/three-vrm'

const loader = new GLTFLoader()
loader.register((parser) => new VRMLoaderPlugin(parser))

const gltf = await loader.loadAsync('avatar.vrm')
const vrm = gltf.userData.vrm

// Control expressions
vrm.expressionManager.setValue('happy', 0.8)
vrm.expressionManager.setValue('blink', 1.0)
```

### @pixiv/three-vrm-animation
**VRMA file support**

```bash
npm install @pixiv/three-vrm-animation
```

- Load `.vrma` (VRM Animation) files
- Create animation clips from VRMA
- Works with Three.js AnimationMixer

```typescript
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'

loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

const vrmaGltf = await loader.loadAsync('idle.vrma')
const clip = createVRMAnimationClip(vrmaGltf.userData.vrmAnimations[0], vrm)

const mixer = new THREE.AnimationMixer(vrm.scene)
mixer.clipAction(clip).play()
```

### vrm-mixamo-retargeter
**FBX → VRM retargeting**

```bash
npm install vrm-mixamo-retarget
```

- Retarget Mixamo/standard humanoid FBX to VRM at runtime
- No prebaking required
- Works with any FBX using standard humanoid rig

```typescript
import { retargetAnimation } from 'vrm-mixamo-retarget'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

const fbxLoader = new FBXLoader()
const fbxAsset = await fbxLoader.loadAsync('animation.fbx')

const clip = retargetAnimation(fbxAsset, vrm)
mixer.clipAction(clip).play()
```

GitHub: https://github.com/saori-eth/vrm-mixamo-retargeter

### @davidcks/r3f-vrm
**React Three Fiber VRM tools**

```bash
npm install @davidcks/r3f-vrm
```

- React components for VRM
- Expression manager
- Position/focus managers
- Useful if using R3F stack

---

## Animation State Machine

### The Problem

Three.js has `AnimationMixer` for playback and blending, but no built-in state machine for managing animation flow (idle → walk → talk → idle).

### The Solution: XState

[XState](https://xstate.js.org/) is the most popular choice for animation state machines in Three.js projects.

```bash
npm install xstate
```

**Why XState:**
- Finite state machine modeling
- Visual editor (Stately.ai)
- Handles transitions, guards, actions
- Promise actors for uninterruptable animations

**Basic pattern:**

```typescript
import { createMachine, createActor } from 'xstate'

const animationMachine = createMachine({
  id: 'character',
  initial: 'idle',
  context: {
    currentAnimation: 'idle'
  },
  states: {
    idle: {
      entry: 'playIdle',
      on: {
        TALK: 'talking',
        EMOTE: 'emoting'
      }
    },
    talking: {
      entry: 'playTalking',
      on: {
        STOP_TALK: 'idle'
      }
    },
    emoting: {
      entry: 'playEmote',
      on: {
        DONE: 'idle'
      }
    }
  }
}, {
  actions: {
    playIdle: ({ context }) => crossfadeToAnimation('idle'),
    playTalking: ({ context }) => crossfadeToAnimation('talking'),
    playEmote: ({ context }) => crossfadeToAnimation('emote')
  }
})

const actor = createActor(animationMachine).start()
actor.send({ type: 'TALK' })
```

**Reference:** [Using XState to coordinate Three.js character animations](https://dev.to/hnrq/using-xstate-to-coordinate-threejs-character-animations-p5k)

### Alternative: Simple State Controller

For simpler needs (like Kokoro), XState may be overkill. A lightweight class works:

```typescript
class AnimationController {
  private mixer: THREE.AnimationMixer
  private clips: Map<string, THREE.AnimationClip>
  private currentAction: THREE.AnimationAction | null = null
  private state: string = 'idle'

  constructor(vrm: VRM, clips: Map<string, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.clips = clips
  }

  crossfadeTo(stateName: string, duration = 0.3) {
    const clip = this.clips.get(stateName)
    if (!clip) return

    const newAction = this.mixer.clipAction(clip)
    
    if (this.currentAction) {
      this.currentAction.fadeOut(duration)
    }
    
    newAction.reset().fadeIn(duration).play()
    this.currentAction = newAction
    this.state = stateName
  }

  update(delta: number) {
    this.mixer.update(delta)
  }
}
```

---

## Reference Implementations

### ChatVRM (Pixiv) ⭐ Best Reference

**GitHub:** https://github.com/pixiv/ChatVRM

**Status:** Archived (May 2025) but code is excellent

**Key files:**
- `/src/features/emoteController/autoBlink.ts` — Procedural blinking
- `/src/features/emoteController/emoteController.ts` — Expression management
- `/src/features/lipSync/` — Lip sync implementation
- `/src/features/vrmViewer/` — VRM loading and display

**Stack:** Next.js + @pixiv/three-vrm

### svelte-vrm-live

**GitHub:** https://github.com/thedexplorer/svelte-vrm-live

**Features:**
- VRM + chat interface
- Mixamo animation integration
- ElevenLabs TTS
- Recent and maintained

**Stack:** Svelte + Threlte + three-vrm

### human-three-vrm

**GitHub:** https://github.com/vladmandic/human-three-vrm

**Features:**
- Webcam motion capture → VRM
- Real-time pose estimation
- Face tracking

**Stack:** Human.js + three-vrm

---

## Three.js Built-in Animation

### AnimationMixer

Core Three.js animation system. All VRM animation builds on this.

```typescript
const mixer = new THREE.AnimationMixer(vrm.scene)

// Create action from clip
const action = mixer.clipAction(clip)

// Playback control
action.play()
action.stop()
action.paused = true
action.timeScale = 0.5  // slow motion
action.setLoop(THREE.LoopRepeat, Infinity)
action.clampWhenFinished = true  // hold last frame

// Blending
action.fadeIn(0.3)
action.fadeOut(0.3)
action.crossFadeTo(otherAction, 0.3)

// In render loop
mixer.update(delta)
```

### AnimationAction Properties

| Property | Description |
|----------|-------------|
| `weight` | Blend weight (0-1) |
| `timeScale` | Playback speed |
| `loop` | LoopOnce, LoopRepeat, LoopPingPong |
| `clampWhenFinished` | Hold last frame |
| `enabled` | Active state |

### Events

```typescript
mixer.addEventListener('finished', (e) => {
  console.log('Animation finished:', e.action.getClip().name)
})

mixer.addEventListener('loop', (e) => {
  console.log('Animation looped')
})
```

---

## Recommended Stack for Kokoro

```
@pixiv/three-vrm              # VRM loading + expressions
@pixiv/three-vrm-animation    # VRMA file support
vrm-mixamo-retarget           # FBX retargeting (if using Mixamo)
```

**State machine:** Start with simple controller class. Add XState if complexity grows.

**Reference code:** Fork ChatVRM's emoteController for AutoBlink and expression management.

---

## Package Versions (as of Feb 2026)

```json
{
  "@pixiv/three-vrm": "^3.4.4",
  "@pixiv/three-vrm-animation": "^3.4.4",
  "vrm-mixamo-retarget": "^1.0.0",
  "three": "^0.180.0",
  "xstate": "^5.x"
}
```

---

## Resources

- [three-vrm GitHub](https://github.com/pixiv/three-vrm)
- [three-vrm Examples](https://pixiv.github.io/three-vrm/packages/three-vrm/examples/)
- [VRM Specification](https://vrm.dev/en/)
- [XState Documentation](https://stately.ai/docs)
- [Three.js Animation System](https://threejs.org/docs/#manual/en/introduction/Animation-system)
