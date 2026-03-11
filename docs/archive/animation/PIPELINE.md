# Animation Pipeline for VRM Models

## Overview

Convert motion capture data (BVH/FBX) to VRM-compatible animations (.vrma or embedded).

## Directory Structure

```
assets/animations/
├── raw/                    # Source files (BVH, FBX)
│   ├── bandai-namco/       # 3077 BVH files ✓ Downloaded
│   ├── cmu-mocap/          # CMU database (manual download)
│   ├── unity-packs/        # Unity Asset Store exports
│   └── booth-vrma/         # Native VRMA from BOOTH
├── converted/              # Intermediate FBX (Blender output)
└── vrma/                   # Final VRM Animation files
```

## Downloaded Assets

| Source | Count | Format | Status |
|--------|-------|--------|--------|
| Bandai Namco | 3,077 | BVH | ✓ Downloaded |
| VRoid VRMA Pack | 7 | VRMA | Manual (BOOTH) |
| CMU Mocap FBX | 2,500+ | FBX | Manual (Archive.org) |
| Unity Packs | varies | FBX | Manual (Asset Store) |

---

## Prerequisites

### Required Software

```bash
# Blender (CLI batch processing)
sudo apt install blender
# or snap install blender --classic

# Python dependencies
pip install bvh numpy
```

### Blender Addons

1. **VRM Add-on for Blender** — https://vrm-addon-for-blender.info/en/
   - Import/export VRM models
   - Required for skeleton matching

2. **VRM Animation Importer** (optional)
   - For direct VRMA export

---

## Pipeline 1: BVH → FBX → VRM (Blender)

### Step 1: BVH to FBX Conversion

```python
# blender_bvh_to_fbx.py
import bpy
import sys
import os

bvh_path = sys.argv[-2]
fbx_path = sys.argv[-1]

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Import BVH
bpy.ops.import_anim.bvh(filepath=bvh_path)

# Export FBX
bpy.ops.export_scene.fbx(
    filepath=fbx_path,
    use_selection=True,
    bake_anim=True,
    add_leaf_bones=False
)
```

**Batch convert:**
```bash
for bvh in raw/bandai-namco/dataset/*/data/*.bvh; do
    name=$(basename "$bvh" .bvh)
    blender -b -P blender_bvh_to_fbx.py -- "$bvh" "converted/${name}.fbx"
done
```

### Step 2: Retarget to VRM Skeleton

1. Open Blender with VRM addon installed
2. Import your target VRM model (establishes skeleton)
3. Import FBX animation
4. Use **Pose > Apply > Apply Selected as Rest Pose** on VRM
5. Retarget via NLA Editor or Rigify retargeting

**Key bone mappings (Bandai → VRM):**

| Bandai Namco | VRM Humanoid |
|--------------|--------------|
| Hips | hips |
| Spine/Spine1/Spine2 | spine/chest/upperChest |
| Neck/Head | neck/head |
| LeftUpLeg/LeftLeg/LeftFoot | leftUpperLeg/leftLowerLeg/leftFoot |
| LeftArm/LeftForeArm/LeftHand | leftUpperArm/leftLowerArm/leftHand |

### Step 3: Export as VRMA or GLB

**Option A: Embedded animation in GLB**
```
Export > glTF 2.0 (.glb)
☑ Include: Selected Objects
☑ Animation: Bake All Actions
```

**Option B: VRMA (VRM Animation file)**
- Requires VRM Animation exporter addon
- Or use three-vrm + vrm-animation-vrma in JS pipeline

---

## Pipeline 2: FBX → VRMA (three.js)

For web-based conversion using three-vrm:

```javascript
// Node.js conversion script
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// Load FBX animation
const fbxLoader = new FBXLoader();
const fbx = await fbxLoader.loadAsync('animation.fbx');
const clip = fbx.animations[0];

// Load target VRM
const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
const gltf = await gltfLoader.loadAsync('model.vrm');
const vrm = gltf.userData.vrm;

// Retarget animation to VRM skeleton
// (requires bone name mapping)
```

---

## Pipeline 3: Direct VRMA Sources (No Conversion)

### BOOTH.pm Downloads

1. **VRoid Official Pack** (7 animations)
   - https://booth.pm/ja/items/5512385
   - Login required, free download

2. **Search "vrma" on BOOTH**
   - https://booth.pm/en/browse/3D%20Motion%20&%20Animation?q=vrma

### Using VRMA in three-vrm

```javascript
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

// Add plugin to loader
gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

// Load VRMA
const vrmaGltf = await gltfLoader.loadAsync('animation.vrma');
const vrmAnimation = vrmaGltf.userData.vrmAnimations[0];

// Apply to VRM
const mixer = new THREE.AnimationMixer(vrm.scene);
const clip = vrmAnimation.createAnimationClip(vrm);
mixer.clipAction(clip).play();
```

---

## Bandai Namco Motion Categories

### Dataset 1 (175 files) — Stylized Actions
- `bow` — Bowing with style variations (active, angry, childish, feminine, etc.)
- `bye/byebye` — Farewell gestures
- `call` — Beckoning/calling
- `dance-short/long` — Dance sequences
- `dash/run/walk` — Locomotion
- `guide` — Pointing/guiding
- `kick/punch/slash` — Combat moves
- `respond` — Reaction animations

### Dataset 2 (2,902 files) — Locomotion + Gestures
- `walk/run` — With style variations
- `walk-turn-left/right` — Directional changes
- `raise-up-*-hand(s)` — Hand raises
- `wave-*-hand(s)` — Waving gestures

**Style suffixes:** `_active`, `_angry`, `_childish`, `_feminine`, `_giant`, `_happy`, `_masculinity`, `_musical`, `_normal`, `_old`, `_proud`, `_robot`, `_sad`, `_sexy`, `_shy`, `_sneaky`, `_tired`, `_zombie`

---

## Manual Downloads Required

### 1. CMU Mocap FBX Library
```bash
# From Internet Archive
wget https://archive.org/download/Huge_FBX_Mocap_Library/Huge_FBX_Mocap_Library.zip
unzip Huge_FBX_Mocap_Library.zip -d raw/cmu-mocap/
```
~2,500 pre-converted FBX files. License: Commercial OK (no resale).

### 2. VRoid VRMA Pack
- URL: https://booth.pm/ja/items/5512385
- Download manually (requires pixiv login)
- Place in: `raw/booth-vrma/`

### 3. Unity Asset Store Packs

Export from Unity:
1. Import pack into Unity project
2. Select animation clips in Project window
3. Right-click > Export Package (or use FBX Exporter)
4. Place in: `raw/unity-packs/`

**Recommended free packs:**
- Kevin Iglesias: Human Basic Motions FREE
- Explosive: RPG Character Mecanim Animation Pack FREE

### 4. ActorCore (Reallusion)
- URL: https://actorcore.reallusion.com/free
- Sign up, download FBX format
- Place in: `raw/actorcore/`

---

## Quick Reference: Bone Names

| VRM Humanoid | Unity Humanoid | Mixamo | BVH Standard |
|--------------|----------------|--------|--------------|
| hips | Hips | mixamorig:Hips | Hips |
| spine | Spine | mixamorig:Spine | Spine |
| chest | Chest | mixamorig:Spine1 | Spine1 |
| upperChest | UpperChest | mixamorig:Spine2 | Spine2 |
| neck | Neck | mixamorig:Neck | Neck |
| head | Head | mixamorig:Head | Head |
| leftUpperArm | LeftUpperArm | mixamorig:LeftArm | LeftArm |
| leftLowerArm | LeftForeArm | mixamorig:LeftForeArm | LeftForeArm |
| leftHand | LeftHand | mixamorig:LeftHand | LeftHand |

---

## Troubleshooting

### Animation plays but model distorts
- Skeleton mismatch — retarget with bone constraints
- Rest pose differs — apply rest pose before retargeting

### Animation too fast/slow
- Frame rate mismatch — Bandai uses 30fps, VRM typically 60fps
- Scale in Blender: Dope Sheet > Key > Scale (S)

### Feet sliding
- Root motion not baked — enable "Bake Animation" in export
- Or: Extract root motion to separate track

---

## License Summary

| Source | Commercial Use | Attribution |
|--------|----------------|-------------|
| Bandai Namco | ✓ (R&D focus) | Required |
| CMU Mocap | ✓ | Appreciated |
| Unity Store | Per-asset | Check license |
| BOOTH | Per-creator | Check terms |
| ActorCore | ✓ | Not required |
