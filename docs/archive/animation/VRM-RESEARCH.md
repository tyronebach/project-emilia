# VRM Animation Research

**Date:** 2026-01-31  
**Author:** Beatrice  
**Purpose:** Research for scaling Emilia Project to 5-10 avatars with unified animations

---

## Executive Summary

**Good news:** VRM is designed for exactly this use case. Animations are model-agnostic by design — one animation file works on any VRM model without manual retargeting.

**Recommended approach:**
1. Use **.vrma format** (native VRM animation) OR **Mixamo FBX + retargeting library**
2. Build/curate a unified animation library once
3. Swap VRM models freely — animations just work

---

## Animation Formats for VRM

### 1. VRMA (VRM Animation) — Native Format

**Best for:** Production, cross-model compatibility, future-proofing

- Official VRM Consortium format
- File extension: `.vrma`
- Works on ANY VRM model without conversion
- Supports: humanoid bones, facial expressions, gaze control
- Described in glTF format

**How it works:**
```
Animation file (.vrma) → @pixiv/three-vrm-animation → Any VRM model
```

No retargeting needed. The animation stores bone *names* (e.g., "leftUpperArm"), not bone *indices*. VRM models have standardized bone names.

### 2. Mixamo FBX — Largest Free Library

**Best for:** Rapid prototyping, massive animation variety

- 2000+ free animations at mixamo.com
- Download as FBX
- Requires retargeting to VRM bone structure

**Retargeting library (Three.js):**
```bash
npm install vrm-mixamo-retarget
```

```javascript
import { retargetAnimation } from 'vrm-mixamo-retarget'

const fbxAsset = await fbxLoader.loadAsync('idle.fbx')
const clip = retargetAnimation(fbxAsset, vrm)  // Works on any VRM
```

**Key library:** https://github.com/saori-eth/vrm-mixamo-retargeter
- Automatic bone mapping (Mixamo → VRM)
- Height scaling
- Works in browser

### 3. BVH (Motion Capture)

**Best for:** Using mocap data

- Standard motion capture format
- Can convert to VRMA via `bvh2vrma` tool
- Tool: https://vrm-c.github.io/bvh2vrma/

---

## Animation Resources (Free)

### Pre-Made VRMA Collections

| Source | Count | Format | License |
|--------|-------|--------|---------|
| [VRoid Official BOOTH](https://booth.pm/ja/items/5512385) | 7 | .vrma | Free |
| [tk256ailab/vrm-viewer](https://github.com/tk256ailab/vrm-viewer) | 11 | .vrma | MIT |
| [VRM-Assets-Pack-For-Silly-Tavern](https://github.com/test157t/VRM-Assets-Pack-For-Silly-Tavern) | 111 | .fbx/.bvh | Free |
| BOOTH marketplace | 100+ | .vrma | Varies |

### VRoid Official Animations (7 free)
- Wave
- Dance
- Cheer
- Shy
- Pose
- Walk
- Jump

### tk256ailab Viewer Animations (11)
- Angry, Blush, Clapping, Goodbye, Jump
- LookAround, Relax, Sad, Sleepy, Surprised, Thinking

### SillyTavern Animation Pack (111)
Emotion-mapped animations for AI characters:
- admiration, amusement, anger, annoyance, approval
- caring, confusion, curiosity, desire, disappointment
- disgust, embarrassment, excitement, fear, gratitude
- grief, joy, love, nervousness, neutral
- optimism, pride, realization, relief, remorse
- sadness, surprise + hitbox reactions

### Mixamo (2000+)
- Idle loops, walks, runs, jumps
- Combat, dance, gestures
- Emotions, reactions
- Free for commercial use

---

## Retargeting: How It Works

### Why VRM Doesn't Need Traditional Retargeting

Traditional 3D animation requires:
1. Source skeleton → Target skeleton bone mapping
2. Rotation/position adjustments per bone
3. Manual tweaking per model

**VRM eliminates this** because:
1. All VRM models use the same humanoid bone *names*
2. Animations target bone names, not indices
3. Runtime applies rotations to matching bones

```
Animation: "leftUpperArm rotation: 45°"
VRM Model A: finds "leftUpperArm" bone → applies rotation
VRM Model B: finds "leftUpperArm" bone → applies rotation
```

### Mixamo → VRM Retargeting

Mixamo uses different bone names (`mixamorigLeftUpLeg` vs VRM's `leftUpperLeg`).

The `vrm-mixamo-retarget` library handles this:

```javascript
const BONE_MAP = {
  'mixamorigHips': 'hips',
  'mixamorigSpine': 'spine',
  'mixamorigSpine1': 'chest',
  'mixamorigSpine2': 'upperChest',
  'mixamorigNeck': 'neck',
  'mixamorigHead': 'head',
  'mixamorigLeftShoulder': 'leftShoulder',
  'mixamorigLeftArm': 'leftUpperArm',
  // ... all bones mapped
}
```

**Result:** Load Mixamo FBX once → retarget once → works on all VRM models.

---

## Multi-Avatar Strategy (5-10 Avatars)

### Recommended Architecture

```
/animations/
├── vrma/                    # Native VRMA files (preferred)
│   ├── idle.vrma
│   ├── happy.vrma
│   ├── thinking.vrma
│   └── wave.vrma
│
├── mixamo/                  # Mixamo FBX (backup/variety)
│   ├── walking.fbx
│   ├── jumping.fbx
│   └── dancing.fbx
│
└── retargeted/              # Cache of retargeted clips (optional)
    └── (generated at runtime)

/models/
├── emilia.vrm
├── rem.vrm
├── ram.vrm
├── beatrice.vrm
└── minerva.vrm
```

### Runtime Flow

```javascript
class AvatarManager {
  constructor() {
    this.animationCache = new Map()  // Animation clips (model-agnostic)
    this.avatars = new Map()         // Loaded VRM models
  }

  async loadAnimation(name, url) {
    if (url.endsWith('.vrma')) {
      // VRMA: load directly, works on any model
      const clip = await loadVRMA(url)
      this.animationCache.set(name, clip)
    } else if (url.endsWith('.fbx')) {
      // Mixamo: retarget once, cache result
      const fbx = await fbxLoader.loadAsync(url)
      const clip = retargetAnimation(fbx, this.referenceVRM)
      this.animationCache.set(name, clip)
    }
  }

  playAnimation(avatarId, animationName) {
    const avatar = this.avatars.get(avatarId)
    const clip = this.animationCache.get(animationName)
    
    // Same clip works on any avatar
    const mixer = new THREE.AnimationMixer(avatar.scene)
    mixer.clipAction(clip).play()
  }
}
```

### Scaling Strategy

| Avatars | Approach | Effort |
|---------|----------|--------|
| 1-2 | Load animations per model | Low |
| 3-5 | Shared animation cache | Low |
| 5-10 | Animation manager + lazy loading | Medium |
| 10+ | Animation streaming + LOD | High |

**For 5-10 avatars:** Use a shared animation cache. Load animations once, apply to any active model.

---

## Tools

### Creation

| Tool | Purpose | Platform |
|------|---------|----------|
| [VRM Add-on for Blender](https://vrm-addon-for-blender.info/) | Create/edit VRMA in Blender | Blender |
| [Mixamo](https://mixamo.com) | Free animation library | Web |
| [VRoid Studio](https://vroid.com/studio) | Create VRM models | Windows/Mac |
| [bvh2vrma](https://vrm-c.github.io/bvh2vrma/) | Convert BVH → VRMA | Web |
| [VRM Posing Desktop](https://store.steampowered.com/app/1895630/) | Create poses/animations | Steam |

### Runtime (Three.js)

| Library | Purpose | Install |
|---------|---------|---------|
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | VRM loader + runtime | `npm i @pixiv/three-vrm` |
| [@pixiv/three-vrm-animation](https://github.com/pixiv/three-vrm-animation) | VRMA loader | `npm i @pixiv/three-vrm-animation` |
| [vrm-mixamo-retarget](https://github.com/saori-eth/vrm-mixamo-retargeter) | Mixamo → VRM | `npm i vrm-mixamo-retarget` |

### Reference Implementations

| Project | Description | URL |
|---------|-------------|-----|
| tk256ailab/vrm-viewer | VRMA viewer + sample anims | https://github.com/tk256ailab/vrm-viewer |
| SillyTavern/Extension-VRM | Full VRM + animation system | https://github.com/SillyTavern/Extension-VRM |
| three-vrm examples | Official examples | https://pixiv.github.io/three-vrm/packages/three-vrm/examples/ |

---

## Recommended Action Plan

### Phase 1: Quick Win (1 day)

1. Download SillyTavern animation pack (111 animations)
2. Integrate `vrm-mixamo-retarget` library
3. Test retargeting on Rose model
4. Verify animations work

### Phase 2: VRMA Native (2-3 days)

1. Download VRoid official VRMA pack (7 animations)
2. Integrate `@pixiv/three-vrm-animation`
3. Build animation loader that handles both VRMA and FBX
4. Create animation manager for multi-avatar

### Phase 3: Curate Library (ongoing)

1. Pick ~20-30 essential animations:
   - Idle variants (3-5)
   - Emotions: happy, sad, angry, surprised, thinking, shy (6)
   - Actions: wave, nod, shake head, clap (4)
   - Reactions: confused, embarrassed, excited (3)
   
2. Convert to VRMA for consistency
3. Test across all 5-10 avatars

### Phase 4: Production

1. Commission custom Emilia VRM model
2. Verify all animations work on custom model (they will)
3. Add avatar-specific idle variations if needed

---

## Key Takeaways

1. **VRM is designed for this.** One animation → any model. It's not a hack, it's the spec.

2. **VRMA > Mixamo FBX** for long-term. VRMA is native, no retargeting needed. But Mixamo has more variety.

3. **Retargeting is solved.** `vrm-mixamo-retarget` handles Mixamo → VRM in one function call.

4. **Start with SillyTavern pack.** 111 emotion-mapped animations, already curated for AI characters.

5. **Minimal per-avatar work.** Swap `.vrm` file, animations just work. No manual adjustment.

---

## References

- VRM Animation Spec: https://vrm.dev/en/vrma/
- three-vrm: https://github.com/pixiv/three-vrm
- vrm-mixamo-retarget: https://github.com/saori-eth/vrm-mixamo-retargeter
- Mixamo: https://mixamo.com
- BOOTH VRM animations: https://booth.pm/en/browse/3D%20Motion%2FAnimation?in_stock=true&tags%5B%5D=VRMA
