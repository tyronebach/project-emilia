# Animation System Architecture

This document describes how Kokoro handles VRM avatar animations, including idle movement, blinking, lip sync, and emotional expressions.

## Overview

Kokoro uses a **layered animation system** that separates bone-based animations (VRMA) from procedural expression control. This is the standard approach used by VTuber applications like ChatVRM, SillyTavern VRM, and Animaze.

```
┌─────────────────────────────────────────┐
│           Animation Controller          │
├─────────────────────────────────────────┤
│  VRMA Layer (bones)                     │
│  └─ idle.vrma (breathing, subtle sway)  │
│  └─ talking.vrma (gestures)             │
│  └─ emote_*.vrma (reactions)            │
├─────────────────────────────────────────┤
│  Procedural Layer (expressions)         │
│  └─ AutoBlink (random intervals)        │
│  └─ LipSync (driven by TTS/visemes)     │
│  └─ Emotion blend (joy/sad/anger/etc)   │
└─────────────────────────────────────────┘
```

## Why This Split?

| Concern | VRMA (Bones) | Procedural (Expressions) |
|---------|--------------|--------------------------|
| Breathing/sway | ✅ | ❌ |
| Hand gestures | ✅ | ❌ |
| Blinking | ❌ | ✅ |
| Lip sync | ❌ | ✅ |
| Emotions | Either | Either |

**Blinking must be procedural** because:
- Random timing feels more natural than looped animation
- Needs to pause gracefully during expression changes (don't blink mid-surprise)
- Can be disabled contextually (e.g., during intense stare)

**Idle body movement should be VRMA** because:
- Bone animations are complex to generate procedurally
- VRMA files are portable across any VRM model
- Can have multiple variants for natural variation

---

## VRMA Layer

### Supported Animation States

| State | File Pattern | Description |
|-------|--------------|-------------|
| Idle | `idle.vrma` or `idle1.vrma`, `idle2.vrma`... | Subtle breathing, weight shifts |
| Talking | `talking.vrma` | Light gestures while speaking |
| Emotes | `emote_wave.vrma`, `emote_nod.vrma`... | Triggered reactions |

### Idle Variants

For natural variation, support multiple idle animations:
- `idle1.vrma` — default breathing
- `idle2.vrma` — slight head tilt variant
- `idle3.vrma` — weight shift variant

When looping, randomly select the next variant (or use weighted selection based on mood).

### Loading VRMA

Use `@pixiv/three-vrm` and `@pixiv/three-vrm-animation`:

```typescript
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

// Add plugin to GLTFLoader
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

// Load and apply
const vrmaGltf = await loader.loadAsync('idle.vrma');
const clip = createVRMAnimationClip(vrmaGltf.userData.vrmAnimations[0], vrm);
mixer.clipAction(clip).play();
```

---

## Procedural Layer

### AutoBlink

Controls the `blink` expression with randomized timing.

**Constants:**
```typescript
const BLINK_INTERVAL_MIN = 2.0;   // minimum seconds between blinks
const BLINK_INTERVAL_MAX = 6.0;   // maximum seconds between blinks
const BLINK_CLOSE_DURATION = 0.12; // how long eyes stay closed
```

**Logic:**
1. Eyes open, start random countdown (2-6 seconds)
2. Countdown reaches 0 → close eyes (`blink = 1`)
3. Wait 0.12 seconds → open eyes (`blink = 0`)
4. Repeat

**Implementation reference** (from Pixiv ChatVRM):
```typescript
class AutoBlink {
  private expressionManager: VRMExpressionManager;
  private remainingTime: number = 0;
  private isOpen: boolean = true;
  private enabled: boolean = true;

  constructor(expressionManager: VRMExpressionManager) {
    this.expressionManager = expressionManager;
    this.scheduleNextBlink();
  }

  setEnabled(enabled: boolean): number {
    this.enabled = enabled;
    // Return time until eyes open (for expression sync)
    return this.isOpen ? 0 : this.remainingTime;
  }

  update(delta: number) {
    if (this.remainingTime > 0) {
      this.remainingTime -= delta;
      return;
    }

    if (this.isOpen && this.enabled) {
      this.close();
    } else {
      this.open();
    }
  }

  private close() {
    this.isOpen = false;
    this.remainingTime = BLINK_CLOSE_DURATION;
    this.expressionManager.setValue('blink', 1);
  }

  private open() {
    this.isOpen = true;
    this.scheduleNextBlink();
    this.expressionManager.setValue('blink', 0);
  }

  private scheduleNextBlink() {
    this.remainingTime = BLINK_INTERVAL_MIN + 
      Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
  }
}
```

**Expression sync:** When changing emotions, call `setEnabled(false)` to pause blinking, wait for eyes to open (use returned time), apply expression, then re-enable.

### LipSync

Controls mouth visemes based on TTS audio or text timing.

**VRM preset expressions for mouth:**
- `aa` — open mouth (あ)
- `ih` — slightly open (い)
- `ou` — rounded (う)
- `ee` — wide (え)
- `oh` — open rounded (お)

**Options:**
1. **Audio-driven** — Analyze TTS audio for phonemes, map to visemes
2. **Text-driven** — Estimate timing from text length, animate mouth open/close
3. **Simple** — Just animate `aa` expression based on speaking state

For MVP, text-driven or simple approach is sufficient.

### Emotion Expressions

VRM preset emotions:
- `happy` / `joy`
- `angry`
- `sad`
- `surprised`
- `relaxed` / `neutral`

**Triggering:**
- Agent emits emotion tags in response
- Controller blends to target emotion over ~0.3s
- Auto-decay back to neutral after timeout (or on next message)

**Conflict with VRMA:** If VRMA files include expression tracks, don't also run procedural emotion control for those same expressions. Pick one source of truth per expression.

---

## Conflict Prevention

### Blink + Emotions
When transitioning emotions:
1. Pause AutoBlink
2. Wait for eyes to open (if currently blinking)
3. Blend to new emotion
4. Resume AutoBlink

### VRMA + Procedural Expressions
- VRMA can include expression animations (e.g., a wave animation that also smiles)
- If VRMA controls an expression, procedural layer should not override it
- Solution: Track which expressions VRMA is animating, skip those in procedural update

### Multiple VRMA Clips
- Use `AnimationMixer` with proper blending
- Idle should loop, emotes should play once then return to idle
- Crossfade duration: ~0.3s for smooth transitions

---

## File Organization

```
assets/
├── animations/
│   ├── idle1.vrma
│   ├── idle2.vrma
│   ├── idle3.vrma
│   ├── talking.vrma
│   └── emotes/
│       ├── wave.vrma
│       ├── nod.vrma
│       └── shrug.vrma
```

---

## Integration Checklist

- [ ] Load VRMA files via `@pixiv/three-vrm-animation`
- [ ] Implement `AutoBlink` class with random intervals
- [ ] Implement basic lip sync (text-driven for MVP)
- [ ] Implement emotion expression controller
- [ ] Add expression sync (pause blink during emotion change)
- [ ] Support multiple idle variants with random selection
- [ ] Handle VRMA → idle transitions with crossfade

---

## References

- [Pixiv ChatVRM](https://github.com/pixiv/ChatVRM) — Reference implementation
- [SillyTavern VRM Extension](https://github.com/SillyTavern/Extension-VRM) — Animation grouping pattern
- [VRM Animation Spec](https://vrm.dev/en/vrma/) — Official VRMA documentation
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — Three.js VRM library
