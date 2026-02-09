# Avatar Performance & Optimization Guide

> Last updated: 2026-02-06

This document covers performance characteristics, hot paths, optimization opportunities, and tunable knobs for the Emilia VRM avatar animation system.

---

## Frame Budget Overview (60fps = 16.67ms)

| Component | Est. Cost | Where |
|-----------|-----------|-------|
| AnimationMixer.update() | 0.3-0.5ms CPU | AnimationGraph.ts |
| Spring bone simulation | 0.5-2.0ms CPU | vrm.update() (VRM SDK) |
| ExpressionMixer.apply() | 0.1-0.2ms CPU | ExpressionMixer.ts |
| LipSync + Audio analysis | ~0.1ms CPU | LipSyncEngine.ts |
| Look-at + blink + behaviors | 0.1-0.2ms CPU | LookAtSystem, BlinkController, etc. |
| Scene graph traversal | 0.1-0.3ms CPU | renderer.render() |
| renderer.render() | 2-5ms GPU | AvatarRenderer.ts |
| Post-processing (high only) | 3-6ms GPU | PostProcessingPipeline.ts |
| GC pauses (occasional) | 0-100ms spikes | Per-frame allocations |
| **Total (medium, no PP)** | **~4-8ms** | Comfortable 60fps headroom |
| **Total (high, with PP)** | **~8-14ms** | Tight on weaker GPUs |

---

## The Render Loop

Every frame in `AvatarRenderer.startRenderLoop()`:

```
requestAnimationFrame(animate)
  │
  ├── AnimationController.update(dt)     ← 8 subsystem updates
  │     ├── updateEmotionBlend(dt)       ← Emotion transition lerp
  │     ├── blinkController.update(dt)   ← State machine (open/closing/closed/opening)
  │     ├── lipSyncEngine.update(dt)     ← FFT + timing lookup + mouth shape
  │     ├── animationGraph.update(dt)    ← THREE.AnimationMixer (1-2 active actions)
  │     ├── lookAtSystem.update(dt)      ← 3x getWorldPosition + quaternion math
  │     ├── ambientBehavior.update(dt)   ← Timer checks (3 float adds + comparisons)
  │     ├── microBehaviorController.update(dt) ← Queue drain
  │     └── expressionMixer.apply()      ← Priority resolve + setValue calls
  │
  ├── vrm.update(dt)                     ← Spring bones + expression flush
  ├── controls.update()                  ← OrbitControls damping
  ├── updateCameraDrift()                ← Vector3.lerp
  │
  └── render
        ├── postProcessing.render()      ← If high quality (4 passes)
        └── renderer.render()            ← If medium/low (1 pass)
```

---

## Issues Found (Ranked by Impact)

### 1. ExpressionMixer.apply() — Per-Frame GC Pressure (Critical)

**File:** `frontend/src/avatar/expression/ExpressionMixer.ts` lines 98-149

Every single frame, `apply()` creates 4+ temporary objects:

```typescript
// These all allocate new objects EVERY FRAME:
const sortedChannels = Array.from(this.channels.values())  // new Array
  .filter(c => c.enabled)                                   // new Array
  .sort((a, b) => b.priority - a.priority);                 // (in-place)
const setByHigher = new Set<string>();                       // new Set
// ...
this.appliedExpressions = new Set(this.finalValues.keys()); // new Set
```

At 60fps that's **240+ object allocations per second**. GC pauses from this pattern can cause 5-100ms frame drops.

**Fix:**
- Pre-sort channels once at creation time (channel list changes only on init)
- Store `setByHigher` as a class field, call `.clear()` instead of `new Set()`
- Swap `appliedExpressions` sets instead of creating new ones:
  ```typescript
  this._prevApplied.clear();
  [this._prevApplied, this.appliedExpressions] = [this.appliedExpressions, this._prevApplied];
  for (const k of this.finalValues.keys()) this.appliedExpressions.add(k);
  ```

### 2. LookAtSystem.update() — Quaternion Clone Per Frame (Moderate)

**File:** `frontend/src/avatar/layers/LookAtSystem.ts` line 229

```typescript
const avatarWorldQuatInverse = avatarWorldQuat.clone().invert();
```

Creates a new `THREE.Quaternion` every frame. The system already has `_tempQuat` for reuse but needs a second temp field since `avatarWorldQuat` IS `_tempQuat`.

**Fix:** Add `_tempQuat2` field, use `_tempQuat2.copy(avatarWorldQuat).invert()`.

### 3. LipSyncEngine — Linear Search Over Timing Data (Moderate)

**File:** `frontend/src/avatar/LipSyncEngine.ts` lines 327-333

```typescript
for (const entry of this.timingData) {
  if (currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs) { ... }
}
```

O(n) scan from the start each frame. For a long sentence (200+ characters), this wastes cycles.

**Fix:** Maintain a cursor index that advances forward (O(1) amortized):
```typescript
while (this._cursor < this.timingData.length &&
       this.timingData[this._cursor].endMs <= currentTimeMs) {
  this._cursor++;
}
```

### 4. Console Logging in Hot Paths (Moderate)

**Files:** `LipSyncEngine.ts` lines 321, 338

Template string creation and `console.log` are not free. The engine logs every 500ms during speech and on every shape change.

**Fix:** Gate behind a debug flag: `if (this.debug) console.log(...)` or remove entirely.

### 5. Empty Array Allocations Per Frame (Low)

**Files:** `MicroBehaviorController.ts` line 42, `AmbientBehavior.ts` line 34

Both create `const result: MicroBehavior[] = []` every frame, almost always returning empty.

**Fix:** Return a module-level `const EMPTY: MicroBehavior[] = []` constant when nothing is ready.

### 6. No Resize Debouncing (Low)

**File:** `AvatarRenderer.ts` line 239

Both `window.resize` and `ResizeObserver` fire without debouncing. Rapid window resizing triggers synchronous layout reads and WebGL state changes every event.

**Fix:** Debounce with `requestAnimationFrame` or a 100ms timeout.

---

## VRM Model Optimization

The VRM model itself is often the single biggest performance lever.

### Polygon Budget

| Quality | Triangle Target | Notes |
|---------|----------------|-------|
| Mobile web | <16,000 | Required for 30fps |
| Desktop web | <32,000 | Comfortable 60fps |
| Unoptimized VRoid | ~160,000 | Unacceptable for web |

### Optimization Impact (Real Benchmarks)

| Metric | Default VRoid | Optimized | Reduction |
|--------|--------------|-----------|-----------|
| Triangles | 160,350 | 12,000 | 92.5% |
| Mesh VRAM | 10,600 KB | 168 KB | 98.4% |
| Texture VRAM | 199 MB | 5.5 MB | 97.2% |
| Load time | 428ms | 123ms | 71% |

### How to Optimize

1. **VRoid Studio export:** Set Materials=2, texture quality=1024px, reduce hair bones
2. **Blender:** Atlas all textures into 1-2 materials, decimate to <32K tris
3. **At load time:** Call `VRMUtils.combineSkeletons(vrm.scene)` after loading — merges duplicate skeleton structures, reduces per-frame bone math. Currently NOT called in the codebase.
4. **Textures:** Use 1024x1024 for a chest-up chat companion (vs default 2048/4096)
5. **MToon outlines:** If outline rendering is not needed, disable it in the VRM model to halve material passes

### Draw Call Targets

| Quality | Target | How to Measure |
|---------|--------|----------------|
| Ideal | <10 calls | `renderer.info.render.calls` |
| Good | <20 calls | Add to debug panel |
| Acceptable | <50 calls | |

Each material = 1 draw call. Shadows double it. Materials=2 export + no shadows = ~4 calls.

---

## Spring Bone Performance

Spring bones (hair, accessories, clothing physics) run in JavaScript on the main thread via `vrm.update(dt)`. No GPU acceleration.

### Cost Factors

- Each spring bone joint = ~0.01-0.02ms per frame
- Collider checks are "quite CPU intensive" per VRM spec
- A typical VRoid model has 20-60 spring bone joints → **0.5-2.0ms per frame**

### Tuning Knobs

Currently **no spring bone control exists** in the codebase. Opportunities:

1. **Reduce at model level:** Export with fewer hair bones in VRoid Studio
2. **Remove colliders:** If camera shows chest-up only, body/leg colliders are waste
3. **Half-rate update:** Call `vrm.update(dt)` every other frame for spring bones (requires separating spring bone update from expression update)
4. **DeltaTime clamping:** Add `const clampedDt = Math.min(dt, 1/30)` before `vrm.update(clampedDt)` to prevent spring bone instability after tab switches or GC pauses

---

## Post-Processing Pipeline

Only active on "high" quality preset. Default ("medium") skips all post-processing.

### Pass Costs

| Pass | Est. GPU Cost | What It Does |
|------|--------------|--------------|
| RenderPass | Same as normal render | Renders scene to framebuffer |
| UnrealBloomPass | 2-4ms | Mip-chain + multi-pass blur + composite |
| SMAAPass | 0.5-1ms | Edge detection + blending (2 fullscreen passes) |
| OutputPass | <0.1ms | Colorspace conversion |
| **Total** | **3-6ms** | 19-38% of frame budget |

### Current Settings

```typescript
bloom: { strength: 0.10, threshold: 0.50, radius: 0.85 }
```

Low strength + high threshold = conservative. Few pixels trigger bloom.

### Known Issue: Double Anti-Aliasing

The "high" preset enables BOTH `antialias: true` (hardware MSAA) AND SMAAPass. This is redundant — use one or the other.

### Optimization: pmndrs/postprocessing

The current Three.js `EffectComposer` runs each pass as a separate fullscreen render. The [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) library merges compatible effects into a single pass, potentially cutting post-processing cost in half.

---

## Quality Presets (Knobs)

**File:** `frontend/src/avatar/QualityPresets.ts`

| Setting | Low | Medium (default) | High |
|---------|-----|-------------------|------|
| pixelRatio | 1 | min(DPR, 1.5) | min(DPR, 2) |
| antialias | false | true | true |
| shadows | false | true | true |
| shadowMapSize | 512 | 1024 | 2048 |
| postProcessing | false | false | true |
| bloom | false | false | true |
| smaa | false | false | true |

**Key insight:** On a 2x DPR display at "high", the renderer draws at 4x pixel count. The `pixelRatio` cap is the single most impactful GPU setting.

---

## Web Audio (Lip Sync)

The LipSyncEngine uses `AnalyserNode` with `fftSize=256` (128 frequency bins).

### Performance: Already Well-Optimized

- FFT at 128 bins is extremely cheap (<0.1ms)
- `Uint8Array` data buffer is pre-allocated and reused (no per-frame allocation)
- `smoothingTimeConstant=0.3` provides good responsiveness

### Minor Opportunities

- The `AnalyserNode` is recreated on each `startSync()` call — could reuse across speech segments
- The `AudioContext` is correctly reused (good)

---

## Monitoring & Debugging

### Add to Debug Panel

```typescript
// GPU draw calls
console.log('Draw calls:', renderer.info.render.calls);
console.log('Triangles:', renderer.info.render.triangles);
console.log('Textures:', renderer.info.memory.textures);
console.log('Geometries:', renderer.info.memory.geometries);
```

### Browser DevTools

- **Performance tab:** Record 5 seconds, look for long tasks (>50ms) and GC events
- **Memory tab:** Take heap snapshots before/after 30 seconds of animation, check for growing allocations
- **Chrome `chrome://gpu`:** Verify hardware acceleration is active

### Frame Timing

```typescript
// Quick FPS monitor
let frames = 0, lastTime = performance.now();
function checkFPS() {
  frames++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    console.log(`FPS: ${frames}`);
    frames = 0;
    lastTime = now;
  }
  requestAnimationFrame(checkFPS);
}
```

---

## Quick Wins Checklist

Ordered by effort-to-impact ratio. All code-level optimizations have been completed.

| # | Fix | Status | File |
|---|-----|--------|------|
| 1 | `VRMUtils.combineSkeletons()` at load | **Done** | AvatarRenderer.ts |
| 2 | Pre-sort ExpressionMixer channels (dirty flag) | **Done** | ExpressionMixer.ts |
| 3 | Reuse Sets in ExpressionMixer.apply() (double-buffer swap) | **Done** | ExpressionMixer.ts |
| 4 | `_tempQuat2` in LookAtSystem (no clone) | **Done** | LookAtSystem.ts |
| 5 | Cursor index for LipSync timing (O(1) amortized) | **Done** | LipSyncEngine.ts |
| 6 | Gate console.log behind `this.debug` flag | **Done** | LipSyncEngine.ts |
| 7 | Static `EMPTY_MICROS` array returns | **Done** | MicroBehaviorController.ts, AmbientBehavior.ts |
| 8 | Fix double anti-aliasing (`antialias: false` when SMAA on) | **Done** | QualityPresets.ts |
| 9 | Debounce resize via `requestAnimationFrame` | **Done** | AvatarRenderer.ts |
| 10 | Clamp deltaTime to `1/30` for spring bones | **Done** | AvatarRenderer.ts |

---

## Remaining Optimization Opportunities

These require more effort or are model-level rather than code-level:

### Adaptive Quality (Not Implemented)

No mechanism to detect low FPS and automatically reduce quality (e.g., disable shadows, lower pixel ratio, skip micro-behaviors). For mobile users or weaker GPUs, this would be valuable. A simple approach: measure frame times over 2 seconds, if average > 20ms, step down one quality preset.

### Spring Bone Control (Not Implemented)

Spring bones cannot be disabled, reduced, or LOD'd from app code. The VRM model's embedded spring bone data is used as-is. For models with many spring bone chains (long hair), this is the single largest CPU cost. Options:
- Half-rate spring bone update (call `vrm.update()` every other frame for springs, requires separating spring update from expression update)
- Model-level: reduce hair bones in VRoid Studio export

### Worker Thread Offloading (Not Needed Yet)

All animation, behavior planning, and spring bone physics run on the main thread. For a single character this is fine, but if the system ever needs to handle multiple avatars, consider offloading spring bones or behavior planning to a Web Worker.

### pmndrs/postprocessing (Not Implemented)

The current Three.js `EffectComposer` runs each post-processing pass as a separate fullscreen render. The [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) library merges compatible effects into a single pass, potentially cutting post-processing GPU cost in half. Worth doing if "high" quality becomes a supported production target.

### AnimationLibrary Cache Eviction (Not Implemented)

All loaded animations stay in memory forever. For a single idle + handful of gestures this is fine. If many animations are added, consider LRU eviction for rarely-used clips.

### Memory Management

- `VRMUtils.deepDispose()` is correctly called on model swap
- `VRMUtils.combineSkeletons()` now called at load (reduces duplicate bone work)
- LipSync audio nodes are properly disconnected on stop
- No memory leaks detected in the dispose paths

---

## References

- [Three.js Performance Tips](https://threejs-journey.com/lessons/performance-tips)
- [VRM Model Optimization Guide](https://vrmeup.com/devlog/devlog_8_manual_optimization_vrm_avatars_using_blender.html)
- [VRoid Export Optimization](https://vrmeup.com/devlog/devlog_7_vrm_vroid_studio_export_optimization.html)
- [Zero-GC JavaScript Guide](https://www.construct.net/en/blogs/construct-official-blog-1/write-low-garbage-real-time-761)
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) — Merged effect passes
- [VRM Spring Bone Spec](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md)
- [Three.js Animation Optimization](https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196)
- [Web Audio Performance Notes](https://padenot.github.io/web-audio-perf/)
