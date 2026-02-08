# Three.js / VRM Performance Optimization Report

> **Date**: February 2026
> **Context**: Single VRM avatar scene, React + Vite + Three.js + @pixiv/three-vrm
> **Observed FPS**: ~55 fps (target: stable 60 fps)

---

## Current Implementation Audit

### Renderer (`AvatarRenderer.ts:156-171`)

| Setting | Current Value | Assessment |
|---------|--------------|------------|
| `powerPreference` | `'high-performance'` | Correct |
| `alpha` | `true` | **Wasteful** - scene uses solid `scene.background`, alpha channel unused |
| `stencil` | (default: `true`) | **Wasteful** - no stencil operations used |
| `antialias` | Quality-dependent | Correct (disabled on high where SMAA takes over) |
| `outputColorSpace` | `SRGBColorSpace` | Correct for MToon |
| `toneMapping` | `NoToneMapping` | Correct for MToon |
| `shadowMap.type` | `PCFSoftShadowMap` | Works but expensive |
| `shadowMap.autoUpdate` | (default: `true`) | **Wasteful** - re-renders shadow map every frame for mostly-static lighting |

### Post-Processing (`PostProcessingPipeline.ts`)

| Pass | Cost | Notes |
|------|------|-------|
| RenderPass | 1 full scene render | Required |
| UnrealBloomPass | 5+ internal blur passes | **Most expensive pass** - renders scene twice internally + Gaussian blurs at multiple resolutions |
| SMAAPass | 3 sub-passes (edge detect, weight, blend) | Moderate cost |
| OutputPass | 1 fullscreen quad | Cheap |

**Total on high preset**: ~10 GPU passes per frame. This alone can explain the 55 fps drop.

### VRM Loading (`AvatarRenderer.ts:531-614`)

| Operation | Status |
|-----------|--------|
| `VRMUtils.rotateVRM0()` | Used |
| `VRMUtils.combineSkeletons()` | Used |
| `VRMUtils.removeUnnecessaryVertices()` | **Not used** - leaves extra vertex data in GPU memory |
| `renderer.compile()` / `compileAsync()` | **Not used** - causes first-frame jank from shader compilation |

### Render Loop (`AvatarRenderer.ts:671-698`)

| Aspect | Status |
|--------|--------|
| Delta time clamping | `Math.min(deltaTime, 1/30)` for spring bones |
| Page Visibility API | **Not used** - loop runs unconditionally, wastes resources in background tabs |
| Frame budget monitoring | None |
| Adaptive quality fallback | None |

### Shadow Setup (`AvatarRenderer.ts:222-234`)

| Setting | Current | Issue |
|---------|---------|-------|
| Shadow camera frustum | **Default** (large area) | Wastes shadow texels on empty space |
| Shadow camera near/far | 0.1 / 10 | Reasonable |
| Shadow map sizes | 512 / 1024 / 2048 | Standard tiers |

---

## Optimization Recommendations

### Tier 1: Quick Wins (High Impact, Low Effort)

#### 1. Disable Unused Framebuffer Channels

**File**: `AvatarRenderer.ts:156-160`

```typescript
// Before
new THREE.WebGLRenderer({
  antialias: this._currentQuality.antialias,
  alpha: true,
  powerPreference: 'high-performance',
});

// After
new THREE.WebGLRenderer({
  antialias: this._currentQuality.antialias,
  alpha: false,           // scene.background is set, alpha unused
  stencil: false,         // no stencil operations needed
  powerPreference: 'high-performance',
});
```

**Impact**: Reduces framebuffer memory bandwidth. The GPU no longer reads/writes alpha and stencil channels per pixel per pass. On a 1080p display at DPR 2, that's ~33 million fewer bytes per frame.

**Risk**: None. The scene already sets `scene.background` so alpha compositing against the page is unnecessary.

---

#### 2. Stop Rendering When Tab Is Hidden

**File**: `AvatarRenderer.ts` (render loop)

```typescript
private handleVisibilityChange = (): void => {
  if (document.hidden) {
    this.stopRenderLoop();
    this.clock.stop();
  } else {
    this.clock.start();
    this.startRenderLoop();
  }
};

// In init():
document.addEventListener('visibilitychange', this.handleVisibilityChange);

// In dispose():
document.removeEventListener('visibilitychange', this.handleVisibilityChange);
```

**Impact**: Eliminates 100% of GPU work when the tab is not visible. Browsers throttle `requestAnimationFrame` in background tabs but don't stop it entirely. This saves battery and prevents delta-time spikes on tab return (supplementing the existing clamp).

---

#### 3. Shadow Map On-Demand Updates

**File**: `AvatarRenderer.ts` (after shadow map setup)

```typescript
// After enabling shadow map:
this.renderer.shadowMap.autoUpdate = false;
this.renderer.shadowMap.needsUpdate = true; // Render once initially

// In render loop, update every N frames:
this._frameCount++;
if (this._frameCount % 6 === 0) { // ~10 shadow updates/sec at 60fps
  this.renderer.shadowMap.needsUpdate = true;
}
```

**Impact**: Reduces shadow map rendering from 60x/sec to ~10x/sec. Shadow map rendering is effectively a second scene render from the light's perspective. For a single slowly-moving avatar with static lighting, 10 updates/sec is visually indistinguishable from 60.

**Risk**: Fast arm movements might show shadow lag for ~100ms. Acceptable for this use case.

---

#### 4. Tighten Shadow Camera Frustum

**File**: `AvatarRenderer.ts:226-232`

```typescript
// Before: default frustum covers large area
this.keyLight.shadow.camera.near = 0.1;
this.keyLight.shadow.camera.far = 10;

// After: tight frustum around avatar bounds
this.keyLight.shadow.camera.left = -1;
this.keyLight.shadow.camera.right = 1;
this.keyLight.shadow.camera.top = 2.5;
this.keyLight.shadow.camera.bottom = -0.5;
this.keyLight.shadow.camera.near = 0.5;
this.keyLight.shadow.camera.far = 6;
```

**Impact**: Concentrates all shadow map texels on the avatar instead of wasting resolution on empty space. A 1024px shadow map with a tight frustum can look as good as 2048px with default bounds. This means you could potentially drop shadow map sizes by one tier while improving visual quality.

---

#### 5. Pre-compile Shaders After VRM Load

**File**: `AvatarRenderer.ts:596` (after `AnimationController` init)

```typescript
// After setting up the VRM and before starting render loop:
if (this.renderer && this.scene && this.camera) {
  this.renderer.compile(this.scene, this.camera);
  // Or async version (non-blocking, uses KHR_parallel_shader_compile):
  // await this.renderer.compileAsync(this.scene, this.camera);
}
```

**Impact**: Eliminates first-frame shader compilation stutter. MToon materials compile multiple shader variants (opaque, transparent, outline). Without pre-compilation, the first few frames can drop to <10 fps as the GPU compiles shaders on demand. One developer reported reducing compile jank from 3.5s to 0.85s with this approach.

---

#### 6. Call `VRMUtils.removeUnnecessaryVertices()` on Load

**File**: `AvatarRenderer.ts:562` (after `combineSkeletons`)

```typescript
VRMUtils.rotateVRM0(vrm);
VRMUtils.combineSkeletons(vrm.scene);
VRMUtils.removeUnnecessaryVertices(vrm.scene);  // Add this
```

**Impact**: Removes unused vertex attributes, reducing morph target texture VRAM and per-frame GPU data transfer. Especially beneficial for VRM models with many blend shapes.

---

### Tier 2: Medium Effort, Good Return

#### 7. Migrate to `pmndrs/postprocessing`

The current pipeline uses Three.js built-in EffectComposer which creates separate render passes for each effect. The `pmndrs/postprocessing` library merges compatible effects into fewer shader passes.

**Current**: RenderPass + UnrealBloomPass (5+ internal) + SMAAPass (3 sub-passes) + OutputPass = ~10 passes

**After migration**: EffectComposer + EffectPass(bloom, smaa) = ~4-5 passes (bloom + 1 merged effect pass)

```
npm install postprocessing
```

```typescript
import { EffectComposer, EffectPass, BloomEffect, SMAAEffect,
         SMAAPreset, RenderPass } from 'postprocessing';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera,
  new BloomEffect({ intensity: 0.1, luminanceThreshold: 0.5, radius: 0.85 }),
  new SMAAEffect({ preset: SMAAPreset.HIGH })
));
```

**Impact**: 30-50% reduction in post-processing GPU time by merging effect passes. This is likely the single biggest win for high-quality preset users.

---

#### 8. Adaptive Quality System

Monitor frame times and auto-downgrade when performance drops:

```typescript
class PerformanceMonitor {
  private samples: number[] = [];
  private readonly targetMs = 16.67; // 60fps

  sample(deltaMs: number): void {
    this.samples.push(deltaMs);
    if (this.samples.length > 60) this.samples.shift();
  }

  get averageMs(): number {
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  shouldDowngrade(): boolean {
    return this.samples.length >= 60 && this.averageMs > 18; // <55fps sustained
  }

  shouldUpgrade(): boolean {
    return this.samples.length >= 60 && this.averageMs < 14; // >71fps sustained
  }
}
```

In the render loop, check periodically and auto-switch between presets. Key levers to pull in order:

1. Disable bloom (biggest single save)
2. Reduce pixel ratio by 0.5
3. Disable shadows
4. Disable SMAA

**Impact**: Guarantees smooth experience across hardware tiers without manual user intervention.

---

#### 9. Half-Resolution Bloom

If staying with the current post-processing stack, render the bloom pass at half resolution:

```typescript
// In PostProcessingPipeline constructor:
const bloomResolution = new THREE.Vector2(
  Math.floor(width / 2),
  Math.floor(height / 2)
);
this.bloomPass = new UnrealBloomPass(bloomResolution, 0.8, 0.5, 0.3);
```

**Impact**: Reduces bloom computation by ~75% (quarter the pixels through 5+ blur passes). Bloom is naturally soft/blurry, so half-resolution is visually indistinguishable.

---

#### 10. Disable Frustum Culling for Avatar Meshes

The VRM avatar is always on screen, but Three.js checks every sub-mesh against the camera frustum every frame:

```typescript
vrm.scene.traverse((obj) => {
  obj.frustumCulled = false;
});
```

**Impact**: Small but free. Eliminates ~20+ bounding box calculations per frame for meshes that are always visible.

---

#### 11. Fixed Timestep for Spring Bones

Instead of variable `deltaTime` which can cause double-stepping on 120Hz displays:

```typescript
const PHYSICS_STEP = 1 / 60;
let accumulator = 0;

// In render loop:
accumulator += deltaTime;
while (accumulator >= PHYSICS_STEP) {
  vrm.update(PHYSICS_STEP);
  accumulator -= PHYSICS_STEP;
}
```

**Impact**: Consistent spring bone behavior across all refresh rates. Prevents the "jelly hair" effect on high-refresh displays and eliminates wasted computation on 120/144Hz monitors where spring bones don't benefit from extra updates.

---

### Tier 3: Advanced / High Effort

#### 12. OffscreenCanvas + Web Worker Rendering

Move the entire Three.js render pipeline to a Web Worker, freeing the main thread for React UI, chat SSE streaming, and DOM updates.

**Architecture**:
```
Main Thread:           Worker Thread:
  React UI               Three.js renderer
  Chat SSE               VRM + animations
  DOM events  ──msg──>   Spring bones
              <──msg──   Frame output
```

**Impact**: Decouples rendering from UI completely. Chat message processing, SSE streaming, and DOM layout/paint can no longer cause frame drops in the 3D rendering, and vice versa. Google Lighthouse scores improve. This is the highest-impact architectural change for perceived smoothness.

**Effort**: High - requires proxying input events, abstracting DOM access, and managing canvas transfer. Libraries like `three-offscreencanvas` or manual `transferControlToOffscreen()` can help.

**Browser support**: All modern browsers (Chrome, Firefox, Edge, Safari) support `OffscreenCanvas`.

---

#### 13. WebGPU Renderer (Future)

Three.js `WebGPURenderer` is production-ready and auto-falls back to WebGL 2:

```typescript
import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
await renderer.init();
```

**Impact**: 2-10x improvement for draw-call-heavy scenes. For a single avatar, the improvement is more modest (~10-20%) but opens the door to compute shaders for spring bone physics and GPU-driven particle effects.

**Browser support**: Chrome, Edge, Firefox, Safari (as of late 2025).

---

#### 14. Contact Shadow Plane (Low Preset Replacement)

Replace realtime shadows on the low preset with a pre-baked contact shadow:

```typescript
const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
const shadowTex = new THREE.TextureLoader().load('/textures/contact-shadow.png');
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = 0.01;
scene.add(shadowPlane);
```

**Impact**: Zero-cost shadow approximation. Eliminates the shadow map render pass entirely on low-end hardware while maintaining visual grounding.

---

#### 15. KTX2 Compressed Textures

Pre-process VRM textures to GPU-native compressed formats (BC7/ASTC/ETC2) using `gltf-transform`:

```bash
npx @gltf-transform/cli optimize input.vrm output.vrm \
  --texture-compress ktx2 \
  --texture-size 1024
```

Then load with `KTX2Loader`:

```typescript
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader()
  .setTranscoderPath('/basis/')
  .detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);
```

**Impact**: ~4-10x reduction in texture VRAM usage. Textures stay compressed on the GPU, reducing memory bandwidth. Especially impactful on mobile devices.

---

## Impact Estimation Summary

| # | Optimization | FPS Impact | Effort | Risk |
|---|-------------|-----------|--------|------|
| 1 | `alpha:false, stencil:false` | +1-2 fps | 5 min | None |
| 2 | Page Visibility pause | +0 fps (saves battery) | 15 min | None |
| 3 | Shadow `autoUpdate = false` | +2-4 fps | 10 min | Minimal |
| 4 | Tight shadow frustum | +1-2 fps (or lower map size) | 10 min | None |
| 5 | `renderer.compile()` | Eliminates first-frame jank | 5 min | None |
| 6 | `removeUnnecessaryVertices()` | +0-1 fps, less VRAM | 1 min | None |
| 7 | `pmndrs/postprocessing` | +3-8 fps (high preset) | 2-3 hrs | Low |
| 8 | Adaptive quality | Auto-maintains 60fps | 3-4 hrs | Low |
| 9 | Half-res bloom | +2-4 fps (high preset) | 15 min | None |
| 10 | Disable frustum culling | +0.5 fps | 5 min | None |
| 11 | Fixed timestep spring bones | Consistent physics | 30 min | Low |
| 12 | OffscreenCanvas worker | +5-10 fps (decoupled) | 1-2 days | Medium |
| 13 | WebGPU renderer | +5-15 fps (future) | 1 day | Medium |
| 14 | Contact shadow plane | +2-4 fps (low preset) | 1 hr | None |
| 15 | KTX2 textures | Less VRAM, faster load | 2-3 hrs | Low |

**Tier 1 alone (items 1-6)** should recover the missing 5 fps to hit stable 60, with ~45 minutes of implementation work.

**Tier 1 + items 7 and 9** would provide significant headroom, especially for the high quality preset where post-processing is the primary bottleneck.

---

## Diagnostic: Measuring What Matters

Before implementing, add instrumentation to identify the actual bottleneck:

```typescript
// In render loop:
const t0 = performance.now();
this.animationController.update(deltaTime);
const tAnim = performance.now();

this.vrm.update(Math.min(deltaTime, 1/30));
const tSpring = performance.now();

this.postProcessing.render(); // or renderer.render()
const tRender = performance.now();

// Log every 120 frames:
if (this._frameCount % 120 === 0) {
  console.log(`[Perf] anim=${(tAnim-t0).toFixed(1)}ms spring=${(tSpring-tAnim).toFixed(1)}ms render=${(tRender-tSpring).toFixed(1)}ms total=${(tRender-t0).toFixed(1)}ms`);
  const info = this.renderer.info;
  console.log(`[Perf] calls=${info.render.calls} tris=${info.render.triangles} textures=${info.memory.textures} geometries=${info.memory.geometries}`);
}
```

This will tell you whether the bottleneck is:
- **Animation/spring bones** (CPU-bound) - optimize items 11, 12
- **Shadow rendering** (GPU-bound) - optimize items 3, 4, 14
- **Post-processing** (GPU-bound) - optimize items 7, 9
- **Base scene render** (GPU-bound) - optimize items 1, 15

---

## References

- [Three.js WebGLRenderer Docs](https://threejs.org/docs/#api/en/renderers/WebGLRenderer)
- [Building Efficient Three.js Scenes (Codrops 2025)](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [@pixiv/three-vrm VRMUtils](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMUtils.html)
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)
- [OffscreenCanvas + Web Workers (Evil Martians)](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers)
- [Depth Pre-Pass Optimization](https://cprimozic.net/blog/threejs-depth-pre-pass-optimization/)
- [Three.js Performance Tips (Discover Three.js)](https://discoverthreejs.com/tips-and-tricks/)
- [Reducing Shader Compile Time (Three.js Forum)](https://discourse.threejs.org/t/reducing-shader-compile-time-on-scene-initialization/56572)
