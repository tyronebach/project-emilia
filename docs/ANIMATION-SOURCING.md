# Animation Sourcing Guide

This document covers where to source professional animations for Kokoro and how to retarget them to VRM.

## Retargeting Workflow

### FBX → VRM (Runtime)

Use **[vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter)** — retargets Mixamo/standard humanoid FBX to VRM directly in Three.js:

```typescript
import { retargetAnimation } from 'vrm-mixamo-retarget'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

// Load VRM
const gltfLoader = new GLTFLoader()
gltfLoader.register((parser) => new VRMLoaderPlugin(parser))
const gltf = await gltfLoader.loadAsync('avatar.vrm')
const vrm = gltf.userData.vrm

// Load FBX animation
const fbxLoader = new FBXLoader()
const fbxAsset = await fbxLoader.loadAsync('animation.fbx')

// Retarget
const clip = retargetAnimation(fbxAsset, vrm)
const mixer = new THREE.AnimationMixer(vrm.scene)
mixer.clipAction(clip).play()
```

### Prebake Workflow (Recommended for Production)

1. Import FBX into Blender
2. Use [VRM Add-on for Blender](https://vrm-addon-for-blender.info/) 
3. Retarget to VRM skeleton
4. Export as `.vrma` (VRM Animation format)
5. Load `.vrma` directly with `@pixiv/three-vrm-animation`

Benefits: Smaller files, no runtime retargeting cost, can tweak animations.

### Conversion Tools

- **[bvh2vrma](https://vrm-c.github.io/bvh2vrma/)** — Online BVH → VRMA converter
- **[XR Animator](https://github.com/ButzYung/SystemAnimatorOnline)** — FBX/BVH → VRM compatible
- **Blender + VRM Add-on** — Most flexible option

---

## FREE Animation Sources

### Mixamo (Adobe) ⭐ Recommended Starting Point

- **URL:** https://www.mixamo.com/
- **Price:** FREE
- **Format:** FBX
- **Library:** Huge — hundreds of animations
- **Categories:** Idle, talking, gestures, emotions, locomotion, dance, combat
- **Workflow:** Upload any humanoid mesh → auto-rig → download with animation

**Best for Kokoro:**
- Idle Breathing variations
- Talking/Conversation gestures
- Emotional reactions (happy, sad, surprised)
- Standing shifts and fidgets

### Unity Asset Store (Free)

| Pack | URL | Clips | Notes |
|------|-----|-------|-------|
| **Human Basic Motions FREE** | [Link](https://assetstore.unity.com/packages/3d/animations/human-basic-motions-free-154271) | ~30 | Kevin Iglesias. 15k+ favorites. Idles, run, jump, fall |
| **Humanoid Idle Motion** | [Link](https://assetstore.unity.com/packages/3d/animations/free-download-humanoid-idle-motion-281422) | Idle set | Viewport. Breathing/standing idles |
| **RPG Character Mecanim FREE** | [Link](https://assetstore.unity.com/packages/3d/animations/rpg-character-mecanim-animation-pack-free-65284) | ~30 | Combat + locomotion starter |

### Unreal / Fab (Free)

| Pack | URL | Notes |
|------|-----|-------|
| **MoCap Online Free Pack** | [Link](https://www.fab.com/listings/64c53af0-dcb7-4483-9d65-5cbc84bd9a93) | AAA mocap quality. Idles, talking, basic movement |
| **Epic Monthly Freebies** | Check Fab marketplace | Rotate free packs monthly — watch for animation drops |

---

## PAID Animation Sources

### Unity Asset Store

| Pack | Price | Clips | Best For |
|------|-------|-------|----------|
| **[Basic Motions PRO](https://assetstore.unity.com/packages/3d/animations/basic-motions-157744)** | $18 | 100+ | Full locomotion + emotions + actions |
| **Kevin Iglesias Bundle** | $50-100 | 500+ | Industry standard quality, multiple packs |

**Kevin Iglesias packs** (all high quality):
- Human Basic Motions
- Human Dance Animations  
- Human Melee Animations
- Human Spellcasting Animations
- Human Mega Animations Pack

### Unreal Marketplace

| Pack | Price | Clips | Best For |
|------|-------|-------|----------|
| **[Conversation Gesture Pack](https://www.unrealengine.com/marketplace/en-US/product/conversation-gesture-animation-pack)** | ~$15 | 82 | ⭐ Talking gestures — perfect for chat app |
| **[Female Interaction Pack](https://www.unrealengine.com/marketplace/en-US/product/female-interaction-animation-pack)** | ~$20 | 35 | Dialog, gestures, idles, reactions (female mocap) |
| **[MC Idles Pack](https://www.unrealengine.com/marketplace/en-US/product/mc-idles-pack)** | ~$25 | 50+ | ⭐ Lifelike idle variety — fidgets, weight shifts |
| **[Character Conversation MoCap](https://www.unrealengine.com/marketplace/en-US/product/pedestrian-conversations-mocap-pack)** | ~$20 | 40+ | Talking, gesturing, emotional states |
| **[MC Core Motion Pack](https://www.unrealengine.com/marketplace/en-US/product/mocap-studio-series-core-motion-pack)** | ~$30 | 200+ | Foundation: idles, walks, talking, waving |
| **[Mobility Basic MoCap](https://www.unrealengine.com/marketplace/en-US/product/mobility-01-basic-mocap-pack)** | ~$20 | 100+ | Locomotion foundation |

### Standalone / Premium

| Source | Price Range | Notes |
|--------|-------------|-------|
| **[MoCap Central](https://mocapcentral.com/)** | $30-60/pack | Pro mocap studio, modular packs, excellent quality |
| **ActorCore / Reallusion** | $$$ | Premium AAA mocap, expensive |
| **[Rokoko](https://www.rokoko.com/products/studio)** | Free software | Mocap suit company, has free animation library |

---

## Recommended Setup for Kokoro

### Phase 1: Free Testing (~$0)

1. **Mixamo** — Download 10-15 clips:
   - 3x idle variations (breathing, weight shift, fidget)
   - 3x talking gestures
   - 3x emotional reactions (happy, sad, thinking)
   - 2x transitions

2. **Human Basic Motions FREE** — Baseline locomotion

3. Test retargeting workflow with `vrm-mixamo-retargeter`

### Phase 2: Production Quality (~$60-80)

| Pack | Price | Why |
|------|-------|-----|
| **Conversation Gesture Pack** | $15 | 82 talking gestures — core interaction |
| **MC Idles Pack** | $25 | Lifelike idle variety — always-on animations |
| **Female Interaction Pack** | $20 | Female-specific mocap if needed |

### Phase 3: Expansion (Optional)

- **MC Core Motion Pack** ($30) — Comprehensive foundation
- **Kevin Iglesias dance/emotion packs** — Character variety

---

## Animation Categories Needed

For a chat companion app, prioritize:

| Priority | Category | Clips Needed | Source Recommendation |
|----------|----------|--------------|----------------------|
| ⭐⭐⭐ | **Idle** | 3-5 variations | MC Idles Pack or Mixamo |
| ⭐⭐⭐ | **Talking gestures** | 10-20 | Conversation Gesture Pack |
| ⭐⭐ | **Emotional reactions** | 5-10 (happy, sad, surprised, thinking) | Mixamo + Female Interaction |
| ⭐⭐ | **Acknowledgment** | 3-5 (nod, wave, point) | Mixamo |
| ⭐ | **Transitions** | Idle↔Talk blends | Can generate procedurally |

---

## File Organization

```
assets/
├── animations/
│   ├── raw/                    # Original FBX files (not in git)
│   │   ├── mixamo/
│   │   ├── unity/
│   │   └── unreal/
│   ├── vrma/                   # Converted VRMA files
│   │   ├── idle1.vrma
│   │   ├── idle2.vrma
│   │   ├── talking_gesture_01.vrma
│   │   └── ...
│   └── LICENSE.txt             # Track licenses per source
```

---

## License Notes

- **Mixamo:** Free for commercial use (Adobe account required)
- **Unity Asset Store:** Check each pack — most allow commercial use in games/apps
- **Unreal Marketplace:** Generally allows use in any project, not just UE
- **Always verify** license terms before shipping

---

## References

- [vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter) — FBX→VRM retargeting
- [VRM Add-on for Blender](https://vrm-addon-for-blender.info/) — Blender VRM tools
- [bvh2vrma](https://vrm-c.github.io/bvh2vrma/) — Online BVH converter
- [three-vrm discussions](https://github.com/pixiv/three-vrm/discussions/1088) — Community retargeting tips
