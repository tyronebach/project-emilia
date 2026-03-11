# BVH to VRM Animation Retargeting Guide

**Goal:** Convert Bandai-Namco BVH motion capture files to VRM-compatible animations for use with Emilia's VRM avatars.

**Why this matters:** BVH files have a different rest pose than VRM models. Direct playback causes weird bending (90° rotations, inverted limbs). Proper retargeting in Blender fixes this once, then all exported animations work perfectly.

---

## Overview

We'll use two Blender addons:
1. **BVH Retargeter** (Diffeomorphic) — Imports BVH and retargets to any armature
2. **VRM Add-on for Blender** — Exports to VRMA (VRM Animation) format

**Workflow:**
```
BVH file → Import to Blender → Retarget to VRM armature → Export as VRMA/GLB
```

---

## Part 1: Setup (One-Time)

### Install Blender 4.2+
Download from https://www.blender.org/download/

### Install VRM Add-on
1. Open Blender
2. `Edit → Preferences → Get Extensions`
3. Search "VRM format"
4. Click Install
5. Restart Blender

### Install BVH Retargeter
1. Download from: https://bitbucket.org/Diffeomorphic/retarget_bvh/downloads/
   - Get the latest `.zip` file
2. `Edit → Preferences → Add-ons → Install...`
3. Select the downloaded zip
4. Enable "BVH Retargeter" checkbox
5. Restart Blender

---

## Part 2: Prepare VRM Reference Model

You need a VRM model to retarget TO. This establishes the correct bone names and rest pose.

### Import Your VRM
1. `File → Import → VRM (.vrm)`
2. Select one of your VRM models (e.g., `emilia.vrm`)
3. The model appears with its armature

### Note the Armature Name
- In the Outliner, find the armature object (usually named after the model)
- This is your **target armature** for retargeting

---

## Part 3: Retarget Single BVH (Test First!)

Before batch processing, test with one file to get the settings right.

### Load BVH Animation
1. Select your VRM armature in the viewport
2. Find the BVH Retargeter panel (usually in the sidebar, press `N` to show)
3. Click **"Load And Retarget"**
4. Navigate to a BVH file from the Bandai-Namco dataset
5. Select it and click **"Load And Retarget"**

### Check the Result
- Press `Space` to play the animation
- The VRM model should move correctly
- If it looks wrong, check the **Source Armature** and **Target Armature** panels

### Troubleshooting
If bones are mapped wrong:
1. Go to **Target Armature** panel
2. Click **"Identify Target Rig"** — this auto-detects VRM humanoid bones
3. If needed, manually assign bones in the bone mapping

If rest pose is wrong:
1. Go to **T-Pose** panel
2. Click **"Set T-Pose"** on the target armature
3. Re-run the retarget

---

## Part 4: Export as VRM Animation

Once retargeting looks correct:

### Export VRMA
1. With the VRM armature selected
2. `File → Export → VRM Animation (.vrma)`
3. Choose filename and save

### Or Export as GLB (Alternative)
1. Select the armature
2. `File → Export → glTF 2.0 (.glb/.gltf)`
3. In export options:
   - Format: GLB
   - Include: ☑ Selected Objects
   - Animation: ☑ Export Animations
   - Armature: ☑ Export Deformation Bones Only
4. Save

---

## Part 5: Batch Processing (All 15k Files)

Once you've confirmed one file works, batch process the rest.

### Python Script for Batch Export

Save this as `batch_bvh_to_vrma.py`:

```python
"""
Batch convert BVH files to VRMA using Blender
Run from Blender: blender --background --python batch_bvh_to_vrma.py

Requires:
- VRM Add-on for Blender
- BVH Retargeter Add-on
- A VRM model for the target armature
"""

import bpy
import os
from pathlib import Path

# === CONFIGURATION ===
VRM_MODEL_PATH = "/path/to/your/emilia.vrm"  # Target VRM model
BVH_INPUT_DIR = "/path/to/bandai-namco-bvh/"  # Input BVH folder
OUTPUT_DIR = "/path/to/output/vrma/"          # Output VRMA folder
# =======================

def setup_scene():
    """Clear scene and import VRM model"""
    # Clear existing objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    # Import VRM
    bpy.ops.import_scene.vrm(filepath=VRM_MODEL_PATH)
    
    # Find the armature
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    raise RuntimeError("No armature found in VRM")

def retarget_bvh(armature, bvh_path):
    """Retarget BVH to the VRM armature"""
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    
    # Use BVH Retargeter
    bpy.ops.mcp.load_and_retarget(filepath=bvh_path)

def export_vrma(output_path):
    """Export current animation as VRMA"""
    bpy.ops.export_scene.vrma(filepath=output_path)

def clear_animation(armature):
    """Clear animation data for next file"""
    if armature.animation_data:
        armature.animation_data_clear()

def batch_convert():
    """Main batch conversion loop"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    armature = setup_scene()
    
    bvh_files = list(Path(BVH_INPUT_DIR).glob("**/*.bvh"))
    total = len(bvh_files)
    
    for i, bvh_path in enumerate(bvh_files):
        print(f"[{i+1}/{total}] Processing: {bvh_path.name}")
        
        try:
            retarget_bvh(armature, str(bvh_path))
            
            output_name = bvh_path.stem + ".vrma"
            output_path = os.path.join(OUTPUT_DIR, output_name)
            export_vrma(output_path)
            
            clear_animation(armature)
            
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
    
    print(f"Done! Converted {total} files.")

if __name__ == "__main__":
    batch_convert()
```

### Run Batch Script

```bash
# From terminal (headless, faster)
blender --background --python batch_bvh_to_vrma.py

# Or with GUI (to watch progress)
blender --python batch_bvh_to_vrma.py
```

---

## Part 6: Using Converted Animations

### In Emilia Web App

The converted VRMA files can be loaded directly. Update `AnimationLibrary.ts` to load VRMA:

```typescript
// VRMA files use VRM bone names directly - no retargeting needed
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

// Add plugin to GLTF loader
gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
```

### Or Use GLB

If you exported as GLB instead of VRMA, the bone names should already be VRM-compatible after retargeting.

---

## Appendix: Bone Name Reference

### Bandai-Namco BVH Names → VRM Names
| BVH | VRM |
|-----|-----|
| Hips | hips |
| Spine | spine |
| Spine1/Chest | chest |
| Neck | neck |
| Head | head |
| Shoulder_L | leftShoulder |
| UpperArm_L | leftUpperArm |
| LowerArm_L | leftLowerArm |
| Hand_L | leftHand |
| UpperLeg_L | leftUpperLeg |
| LowerLeg_L | leftLowerLeg |
| Foot_L | leftFoot |
| (Same pattern for _R) | (right*) |

---

## Resources

- **BVH Retargeter Docs:** http://diffeomorphic.blogspot.com/p/bvh-retargeter.html
- **VRM Add-on for Blender:** https://github.com/saturday06/VRM-Addon-for-Blender
- **VRM Animation Export:** https://vrm-addon-for-blender.info/en-us/ui/export_scene.vrma/
- **VRMA Spec:** https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0

---

## Quick Summary

1. **Setup:** Install VRM Add-on + BVH Retargeter in Blender 4.2+
2. **Import:** Load your VRM model as the target armature
3. **Test:** Retarget one BVH file, verify it looks correct
4. **Export:** Save as VRMA (or GLB)
5. **Batch:** Run Python script on all 15k files
6. **Use:** Load VRMA files in web app — they work with VRM models directly

The key insight: **retargeting is a one-time conversion step**, not runtime logic. Once converted, animations just work.

---

*Guide created by Ram — Feb 2026*
