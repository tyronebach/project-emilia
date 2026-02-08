# Avatar Tech Decision: Live2D vs Three.js/VRM

**Date:** 2026-01-30  
**Decision:** Three.js + VRM  
**Reason:** Pluggable architecture, standardized interface, easy model swapping

---

## Executive Summary

For the waifu webapp's pluggable architecture (Emilia → Rem → Ram → any agent), **Three.js + VRM** is the clear choice. VRM provides standardized blend shapes and expressions, allowing the same animation code to work across any model. Live2D requires custom parameter mapping per model and locks you into commissioned art.

---

## Comparison Matrix

| Criteria | Live2D | Three.js + VRM | Winner |
|----------|---------|----------------|--------|
| **Swap models** | Hard (proprietary format, commissioned art) | Easy (drag-drop .vrm files) | ✅ VRM |
| **Data interface** | Custom params per model | Standardized blend shapes | ✅ VRM |
| **Free models** | Rare, mostly commercial | Huge library (VRoid Hub, Booth) | ✅ VRM |
| **DIY creation** | Requires artist + Cubism Editor ($) | VRoid Studio (free, no skill needed) | ✅ VRM |
| **Lip sync** | Need custom param mapping | Standard viseme blend shapes | ✅ VRM |
| **Performance** | Lighter (2D sprites) | Heavier (3D rendering) | ⚠️ Live2D |
| **Anime aesthetic** | Can be very polished | Good but more "3D anime" | ⚠️ Live2D |
| **Community** | VTuber-focused, closed ecosystem | Open-source, active dev community | ✅ VRM |
| **Tech stack** | pixi-live2d or cubism-web SDK | three-vrm plugin for Three.js | Tie |

---

## Data Passing (Critical for Pluggable Architecture)

### Live2D (Non-Standard)
```javascript
// Each model has custom parameter names
model.setParameterValueByName('ParamMouthOpenY', 0.8);
model.setParameterValueByName('ParamEyeLOpen', 0.0); // blink
// No standard — every artist names things differently
```

**Problem:** Every time you swap models, you need to remap parameter names.

### VRM (Standardized)
```javascript
// Standardized blend shapes (VRM spec)
vrm.expressionManager.setValue('happy', 0.8);
vrm.expressionManager.setValue('aa', 0.6); // mouth shape for "ah"
// Every VRM model uses same names
```

**Benefit:** Same animation code works for any VRM model without modification.

---

## Model Swapping Process

### Live2D Workflow
1. Commission artist ($200-2000+)
2. Receive custom .moc3 + texture files
3. Update model loader code
4. **Map all parameter names** (every model has different names)
5. Adjust physics/motion settings per model
6. Debug edge cases

**Time:** Days to weeks per new character

### VRM Workflow
1. Download .vrm from VRoid Hub (free) or commission ($50-500)
2. Update model path: `loader.load('new-waifu.vrm')`
3. Done. Same animation code works.

**Time:** Minutes per new character

---

## Lip Sync Integration (ElevenLabs)

### Three.js/VRM Implementation
```javascript
// ElevenLabs returns viseme timestamps
// Map directly to VRM blend shapes
const visemeMap = {
  'aa': 'aa',  // "ah"
  'E': 'e',    // "eh"
  'I': 'i',    // "ee"
  'O': 'o',    // "oh"
  'U': 'u'     // "oo"
};

// Animate based on TTS phoneme data
visemeData.forEach(v => {
  vrm.expressionManager.setValue(visemeMap[v.name], v.weight);
});
```

This code works for **any VRM model** without modification. VRM spec defines standard viseme blend shapes.

### Live2D Implementation
Each model would need custom mapping:
```javascript
// Model A
model.setParameterValueByName('ParamMouthOpenY', weight);
model.setParameterValueByName('ParamMouthForm', formValue);

// Model B (different artist)
model.setParameterValueByName('MOUTH_OPEN', weight);
model.setParameterValueByName('MOUTH_SMILE', formValue);
```

Every model swap requires code changes.

---

## Why VRM Wins for This Project

1. **Pluggable architecture** — Core design goal is swapping Emilia → Rem → Ram → any agent easily
2. **Standardized interface** — Same animation/expression code works for all models
3. **Free testing** — Download 50+ VRM models from VRoid Hub, test which aesthetic works
4. **Low barrier to entry** — Thai or Emily can create custom model in VRoid Studio in 30 mins
5. **ElevenLabs integration** — VRM viseme blend shapes map 1:1 to TTS phoneme data
6. **Open ecosystem** — Active community, MIT-licensed tools, no vendor lock-in

**Trade-off:** Live2D can achieve more "hand-drawn anime" aesthetic polish, but you'd be locked into commissioned art ($$$) and custom integration per character.

---

## Implementation Path

### Milestone 4: VRM Avatar (Three.js)

**Dependencies:**
- Working dashboard (in progress)
- ElevenLabs TTS integration (✅ done)
- Agent brain API (✅ done)

**Tasks:**
1. Add three-vrm dependency to webapp
2. Load default VRM model (select from VRoid Hub)
3. Map ElevenLabs viseme data → VRM blend shapes
4. Add idle animations (breathing, blinking, eye tracking)
5. **Test model swap:** Load different .vrm file, verify same code works
6. Add expression triggers (happy, sad, surprised) based on agent response metadata

**Estimated effort:** 4-6 hours (Ram)

**Testing:**
- Download 5-10 VRM models with different aesthetics
- Verify lip sync works for all without code changes
- Verify expressions work for all without code changes

---

## Technical Resources

### Libraries
- **three-vrm:** https://github.com/pixiv/three-vrm (Official VRM loader for Three.js)
- **@pixiv/three-vrm:** npm package, MIT license

### Model Sources
- **VRoid Hub:** https://hub.vroid.com/ (Free, community-uploaded models)
- **Booth.pm:** https://booth.pm/ (Paid/free Japanese marketplace)
- **VRoid Studio:** https://vroid.com/studio (Free model creator, no art skills needed)

### Reference Implementations
- **KalidoKit:** https://github.com/yeemachine/kalidokit (VRM + MediaPipe face tracking)
- **Talking VRM:** https://github.com/pixiv/ChatVRM (VRM + TTS example by Pixiv)

### VRM Specification
- https://vrm.dev/en/ (Official spec)
- Standard blend shapes: happy, sad, angry, surprised, aa, i, u, e, o, blink, blinkLeft, blinkRight

---

## Long-Term Benefits

### Scenario: Adding New Character (e.g., Ram agent)

**With VRM:**
1. Find/create Ram VRM model
2. Add to webapp: `const models = { emilia: 'emilia.vrm', ram: 'ram.vrm' }`
3. Agent selector switches model path
4. Done. All animations work.

**With Live2D:**
1. Commission Ram Live2D model ($500+)
2. Add model files
3. **Write custom parameter mappings** for Ram's specific rig
4. Debug physics differences
5. Test all expressions/animations
6. Repeat for every future character

---

## Decision Log

**Date:** 2026-01-30  
**Decided by:** Thai + Beatrice  
**Implemented by:** Ram (pending)  
**Status:** Approved, awaiting dashboard completion before implementation

---

## Next Steps

1. ✅ Save this research doc
2. ⏳ Thai tests dashboard
3. → Ram implements Milestone 4 (VRM Avatar)
4. → Select default model from VRoid Hub
5. → Test model swapping with 3-5 different VRMs
6. → Ship!
