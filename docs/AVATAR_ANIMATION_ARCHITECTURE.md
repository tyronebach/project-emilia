# Avatar Animation Architecture

## Overview

The avatar system has two parallel architectures:

1. **Legacy (Current)** - Individual systems in `AvatarRenderer`
2. **New (Not Integrated)** - Consolidated `AnimationController`

This doc describes both and the migration plan.

---

## Layer Stack (Conceptual)

From lowest to highest priority:

```
┌─────────────────────────────────────────┐
│  6. LIP SYNC (mouth shapes)             │  ← LipSyncEngine
├─────────────────────────────────────────┤
│  5. EXPRESSION (emotions/moods)         │  ← ExpressionController / ExpressionMixer
├─────────────────────────────────────────┤
│  4. BLINK (procedural eye blinks)       │  ← BlinkController
├─────────────────────────────────────────┤
│  3. LOOK-AT (eyes + head tracking)      │  ← LookAtSystem
├─────────────────────────────────────────┤
│  2. SKELETAL ANIMATION (gestures/idle)  │  ← AnimationPlayer + IdleAnimations
├─────────────────────────────────────────┤
│  1. BASE POSE (VRM rest pose)           │  ← VRM humanoid
└─────────────────────────────────────────┘
```

Higher priority layers override lower ones for the same targets (e.g., lip sync overrides emotion for mouth expressions).

---

## Current Architecture (Legacy)

Used in `AvatarRenderer`:

```
AvatarRenderer
├── LipSyncEngine        - Character-based lip sync from ElevenLabs alignment
├── ExpressionController - Direct VRM expression manipulation (moods)
├── IdleAnimations       - Subtle idle movements
├── AnimationPlayer      - Full-body gesture animations (wave, bow, etc.)
└── LookAtSystem         - Eyes (VRM) + Head (manual bone rotation)
```

**Missing:** Proper blinks (no BlinkController integrated)

### How They Blend

- **Expressions:** Direct `vrm.expressionManager.setValue()` calls
- **Animations:** THREE.js `AnimationMixer` on normalized humanoid bones
- **LookAt:** Manual quaternion multiplication on head bone

**Problem:** No unified blending system. Multiple systems can fight over same expressions.

---

## New Architecture (AnimationController)

Located in `AnimationController.ts`, not yet integrated:

```
AnimationController
├── ExpressionMixer      - Channel-based expression blending with priorities
│   ├── lipsync channel  (priority 100)
│   ├── emotion channel  (priority 50)
│   ├── blink channel    (priority 60)
│   └── gesture channel  (priority 40)
├── BlinkController      - Procedural blinks with pause/resume
├── LookAtSystem         - Same as legacy
├── LipSyncEngine        - Same as legacy
├── IdleAnimations       - Same as legacy
└── AnimationPlayer      - Same as legacy
```

### ExpressionMixer Benefits

1. **Channels:** Each system writes to its own channel
2. **Priorities:** Higher priority wins for same expression
3. **Blending:** Automatic weight blending across channels
4. **Conflict-free:** Blinks don't fight with emotions

---

## BlinkController (Existing)

Already implemented in `layers/BlinkController.ts`:

```typescript
// Features:
- Random blink intervals (2-6 seconds)
- Configurable blink duration
- Pause/resume with promise (for emotion changes)
- Integrates with ExpressionMixer
```

**Usage:**
```typescript
const controller = new BlinkController(expressionMixer);
controller.update(deltaTime);  // Call each frame
controller.triggerBlink();     // Force immediate blink
await controller.setEnabled(false);  // Pause, wait for eyes to open
```

---

## LookAtSystem (VRM 0.x vs 1.0)

See `layers/LookAtSystem.ts` header comments.

**Why two code paths:**
- VRM 0.x faces -Z in bone-local space
- VRM 1.0 faces +Z in bone-local space

Detection: `vrm.meta.metaVersion === '0'` vs `'1'`

---

## Migration Plan

To integrate the new system:

1. **Phase 1:** Add BlinkController to AvatarRenderer (standalone, no ExpressionMixer)
2. **Phase 2:** Replace ExpressionController with ExpressionMixer
3. **Phase 3:** Integrate all systems via AnimationController
4. **Phase 4:** Remove legacy code

### Phase 1 Quick Integration

```typescript
// In AvatarRenderer constructor
this.blinkController = new BlinkController(this.vrm);

// In update loop
this.blinkController.update(deltaTime);
```

---

## Future Procedural Animations

Once ExpressionMixer is integrated, add:

1. **Breathing** - Subtle chest/shoulder bone rotation
2. **Micro-sway** - Imperceptible body movement
3. **Eye darts** - Quick gaze shifts during idle

These would be new controllers that write to ExpressionMixer channels or directly manipulate bones (for breathing).

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `AvatarRenderer.ts` | Main renderer, uses legacy systems | Active |
| `AnimationController.ts` | New consolidated controller | Not integrated |
| `expression/ExpressionMixer.ts` | Channel-based expression blending | Ready |
| `layers/BlinkController.ts` | Procedural blinks | Ready, needs integration |
| `layers/LookAtSystem.ts` | Eyes + head tracking | Active, updated |
| `ExpressionController.ts` | Legacy mood system | To be replaced |
| `LipSyncEngine.ts` | Lip sync from alignment | Active |
| `IdleAnimations.ts` | Subtle idle movements | Active |
| `AnimationPlayer.ts` | Gesture animations | Active |
