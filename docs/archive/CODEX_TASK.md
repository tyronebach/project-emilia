# Task: Integrate AnimationController into AvatarRenderer

## Objective

Replace the legacy individual animation systems in `AvatarRenderer` with the consolidated `AnimationController`.

## Current State

`AvatarRenderer` uses these legacy systems:
- `ExpressionController` - direct VRM expression manipulation
- `LipSyncEngine` - lip sync (keep, but route through AnimationController)
- `IdleAnimations` - idle movements (keep, but route through AnimationController)
- `AnimationPlayer` - gesture animations (keep, but route through AnimationController)
- `LookAtSystem` - eyes + head tracking (keep, but route through AnimationController)

## Target State

`AvatarRenderer` uses `AnimationController` which internally manages:
- `ExpressionMixer` - channel-based expression blending
- `BlinkController` - procedural eye blinks
- `LookAtSystem` - eyes + head tracking
- `LipSyncEngine` - lip sync
- `IdleAnimations` - idle movements
- `AnimationPlayer` - gesture animations

## Files to Modify

1. **`frontend/src/avatar/AvatarRenderer.ts`**
   - Import `AnimationController`
   - Replace individual system instantiation with single `AnimationController`
   - Update public accessors to go through AnimationController
   - Update `update()` loop to call `animationController.update()`
   - Keep backward compatibility for external access (lipSyncEngine, expressionController, lookAtSystem)

2. **`frontend/src/avatar/AnimationController.ts`**
   - Fix any issues with the existing implementation
   - Ensure it properly initializes all subsystems
   - Make sure LookAtSystem uses the updated version (VRM 0.x vs 1.0 handling)

3. **`frontend/src/avatar/layers/BlinkController.ts`**
   - Currently depends on ExpressionMixer
   - May need standalone mode for simpler integration OR
   - Ensure ExpressionMixer is properly set up

## Constraints

1. **DO NOT break existing functionality** - expressions, lip sync, look-at must still work
2. **Keep public API compatible** - `renderer.lipSyncEngine`, `renderer.expressionController` should still work (can be getters that delegate to AnimationController)
3. **Blinks must work** - avatar should blink automatically every 2-6 seconds
4. **Test both VRM 0.x and 1.0** - LookAtSystem has version-specific code paths

## Key Integration Points

### AvatarRenderer Changes

```typescript
// OLD
public lipSyncEngine: LipSyncEngine | null = null;
private idleAnimations: IdleAnimations | null = null;
public animationPlayer: AnimationPlayer | null = null;
public expressionController: ExpressionController | null = null;
public lookAtSystem: LookAtSystem | null = null;

// NEW
private animationController: AnimationController | null = null;

// Backward-compatible getters
get lipSyncEngine() { return this.animationController?.lipSync ?? null; }
get expressionController() { return this.animationController?.expressions ?? null; }
get lookAtSystem() { return this.animationController?.lookAt ?? null; }
get animationPlayer() { return this.animationController?.animations ?? null; }
```

### Update Loop

```typescript
// OLD
if (this.lipSyncEngine) this.lipSyncEngine.update(deltaTime);
if (this.lookAtSystem) this.lookAtSystem.update(deltaTime);
if (this.vrm) this.vrm.update(deltaTime);

// NEW
if (this.animationController) this.animationController.update(deltaTime);
if (this.vrm) this.vrm.update(deltaTime);
```

### Initialization (in loadVRM callback)

```typescript
// OLD
this.idleAnimations = new IdleAnimations(vrm);
this.animationPlayer = new AnimationPlayer(vrm);
this.expressionController = new ExpressionController(vrm);
this.lipSyncEngine = new LipSyncEngine(vrm);
this.lookAtSystem = new LookAtSystem(vrm, {...});
if (this.camera) this.lookAtSystem.setCamera(this.camera);

// NEW
this.animationController = new AnimationController();
this.animationController.init(vrm, this.camera);
```

## Testing Checklist

After implementation, verify:
- [ ] Avatar loads without errors
- [ ] Avatar blinks automatically (every 2-6 seconds)
- [ ] Expressions/moods work (debug panel)
- [ ] Lip sync works (TTS test)
- [ ] Head tracking works for VRM 0.x models
- [ ] Head tracking works for VRM 1.0 models
- [ ] Animations play (wave, bow, etc.)
- [ ] Debug panel still shows look-at state

## Reference Files

- `docs/AVATAR_ANIMATION_ARCHITECTURE.md` - architecture overview
- `frontend/src/avatar/AnimationController.ts` - the controller to integrate
- `frontend/src/avatar/expression/ExpressionMixer.ts` - expression blending
- `frontend/src/avatar/layers/BlinkController.ts` - blink system
- `frontend/src/avatar/layers/LookAtSystem.ts` - look-at (updated with VRM version handling)
