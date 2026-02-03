# Animation System

**Version:** 2.0  
**Date:** 2026-02-02  
**Author:** Ram 🩷

## Overview

The animation system plays pre-made animations on VRM avatars. It uses:
- **GLB files** for animation clips (from Mixamo, Blender, etc.)
- **Three.js AnimationMixer** for playback
- **Automatic retargeting** from Mixamo bone names to VRM

## Architecture

```
frontend/public/animations/
├── wave.glb
├── nod.glb
├── thinking.glb
├── idle.glb
└── ...

frontend/src/avatar/
├── AnimationLibrary.ts   # Load & cache GLB animations
├── AnimationPlayer.ts    # Three.js AnimationMixer wrapper
├── LipSyncEngine.ts      # ElevenLabs alignment → visemes
├── ExpressionController.ts # Mood → VRM expressions
└── IdleAnimations.ts     # Blink, breathing (procedural)
```

## Components

### AnimationLibrary

Singleton that loads and caches animation clips.

```typescript
import { animationLibrary } from './avatar';

// Register animations (do this once at startup)
animationLibrary.register('wave', '/animations/wave.glb');
animationLibrary.register('nod', '/animations/nod.glb');

// Preload all registered
await animationLibrary.preloadAll();

// Or load on demand
const clip = await animationLibrary.load('wave');
```

### AnimationPlayer

Plays animations on VRM model using Three.js AnimationMixer.

```typescript
// Triggered by avatar commands from LLM
renderer.animationPlayer.play('wave');

// With options
renderer.animationPlayer.play('wave', {
  loop: false,      // Play once
  fadeIn: 0.25,     // Crossfade in (seconds)
  fadeOut: 0.25,    // Crossfade out
  timeScale: 1.0    // Playback speed
});

// Queue multiple animations
renderer.animationPlayer.play('wave');
renderer.animationPlayer.play('nod'); // Queued, plays after wave
```

### Bone Retargeting

Animations are automatically retargeted from Mixamo naming to VRM:

| Mixamo | VRM |
|--------|-----|
| mixamorigHips | hips |
| mixamorigSpine | spine |
| mixamorigHead | head |
| mixamorigRightArm | rightUpperArm |
| ... | ... |

## Adding Animations

### Option 1: Quaternius Universal Animation Library (Recommended)

Free CC0 animations, already in GLB format:

1. **Download from itch.io:**
   - Go to https://quaternius.itch.io/universal-animation-library
   - Click "Download Now" → "No thanks, just take me to downloads"
   - Download "Universal Animation Library[Standard].zip"

2. **Extract and copy:**
   ```bash
   cd /home/tbach/Projects/emilia-project/emilia-webapp/frontend/public
   unzip ~/Downloads/Universal\ Animation\ Library*.zip -d animations/
   ```

3. **Register animations:**
   ```typescript
   // In AnimationLibrary.ts constructor or initialization
   animationLibrary.register('wave', '/animations/GLB/Emotes/Wave.glb');
   animationLibrary.register('nod', '/animations/GLB/Emotes/Agree.glb');
   animationLibrary.register('thinking', '/animations/GLB/Emotes/Think.glb');
   animationLibrary.register('idle', '/animations/GLB/Idle/Idle.glb');
   ```

### Option 2: Mixamo

1. Go to [Mixamo](https://www.mixamo.com/) (Adobe login required)
2. Upload a T-pose character or use a preset
3. Browse animations (wave, nod, thinking, etc.)
4. Download as FBX with "Without Skin" option
5. Convert to GLB:
   ```bash
   # Using gltf-transform
   npx @gltf-transform/cli copy input.fbx output.glb
   
   # Or in Blender: File → Export → glTF 2.0 (.glb)
   ```

### Fallback Behavior

If GLB files aren't found, the system automatically falls back to **procedural animations** (AnimationTrigger). These provide basic:
- Wave (arm raise + happy expression)
- Nod (head movement)
- Thinking (head tilt)
- Head shake

So the app works without GLB files, just with simpler animations.

## Agent Integration

Emilia emits animation tags in responses:

```
[MOOD:happy:0.8] [ANIM:wave] Hello there!
```

Backend parses tags → frontend receives:
```json
{
  "text": "Hello there!",
  "moods": [{"mood": "happy", "intensity": 0.8}],
  "animations": ["wave"]
}
```

Frontend triggers:
```typescript
// In useChat.ts or store
renderer.animationPlayer.play('wave');
renderer.expressionController.setMood('happy', 0.8);
```

## Lip Sync

Lip sync uses ElevenLabs alignment data (character timestamps).

**Backend** (`/api/speak`):
- Requests TTS with `alignment: true`
- Returns `audio_base64` + `alignment` data

**Frontend** (`LipSyncEngine`):
- Maps characters → visemes
- Syncs VRM blend shapes to audio playback

```typescript
// Already wired in useChat.speakText()
if (result.alignment) {
  renderer.lipSyncEngine.setAlignment(result.alignment);
  renderer.lipSyncEngine.startSync(audioElement);
}
```

## Supported Visemes

VRM Oculus visemes:
```
sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U
```

Character mapping:
- Vowels: a→aa, e→E, i→I, o→O, u→U
- Consonants: p,b,m→PP, f,v→FF, t,d→DD, k,g→kk, s,z→SS, r→RR

## Testing

```bash
# Check available animations
console.log(animationLibrary.getAvailableAnimations());

# Trigger manually
renderer.animationPlayer.play('wave');

# Check lip sync alignment
console.log('[LipSync] Prepared X timing entries');
```

## Files

| File | Purpose |
|------|---------|
| `AnimationLibrary.ts` | GLB loader + cache |
| `AnimationPlayer.ts` | Mixer wrapper + retargeting |
| `LipSyncEngine.ts` | Character → viseme sync |
| `ExpressionController.ts` | Mood → expression blending |
| `IdleAnimations.ts` | Procedural blink/breathe |
| `AnimationTrigger.ts` | Legacy (deprecated) |

---

*Ram 🩷*
