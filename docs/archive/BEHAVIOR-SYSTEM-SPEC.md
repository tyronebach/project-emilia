# Behavior System Specification

> **Status:** Proposed  
> **Author:** Beatrice 💗  
> **Date:** 2026-02-06  
> **Purpose:** Transform Emilia from an animation player into a character performer

---

## Executive Summary

The current avatar system animates a **model**. Production companion avatars animate a **character**. This document specifies the architectural changes needed to add a **Behavior Layer** between LLM output and animation execution.

### The Core Problem

```
Current:    LLM → [anim:wave] → AnimationController → VRM
Production: LLM → intent → BehaviorPlanner → behavior → AnimationController → VRM
```

The missing middle layer is why VTubers and apps like Grok feel "alive" while our avatar feels robotic.

---

## Architecture Overview

### Current System

```
┌──────────────────────────────────────────────────────────────────┐
│                         LLM Response                              │
│                    [emotion:happy] [anim:wave]                    │
└────────────────────────────┬─────────────────────────────────────┘
                             │ (direct command)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     AnimationController                           │
│              setMood('happy'), triggerGesture('wave')             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                          VRM Model                                │
└──────────────────────────────────────────────────────────────────┘
```

**Problems:**
1. LLM must specify exact animations (puppet model)
2. No contextual decision-making
3. No reaction to user actions (touch, silence, attention)
4. Idle feels dead between interactions

### Target System

```
┌──────────────────────────────────────────────────────────────────┐
│                         LLM Response                              │
│                    [intent:greeting mood:happy]                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      BehaviorPlanner                              │
│                                                                   │
│  Inputs:                     │  Outputs:                         │
│  • intent (from LLM)         │  • facialEmotion + intensity      │
│  • mood (from LLM)           │  • attentionTarget                │
│  • energy (from LLM)         │  • bodyAction (gesture/pose)      │
│  • conversationState         │  • microBehaviors[]               │
│  • userActions (touch/gaze)  │  • vocalModifiers                 │
│  • timeSinceLastInteraction  │                                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ (behavioral decision)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     AnimationController                           │
│                    (Pure execution layer)                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                          VRM Model                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Technical Debt Fixes

**Must complete before adding BehaviorPlanner. These are architectural violations that will cause bugs.**

### 0.1 Route LipSync Through ExpressionMixer

**Current (broken):**
```typescript
// LipSyncEngine.ts
this.vrm.expressionManager.setValue('aa', weight);  // Direct write!
```

**Target:**
```typescript
// LipSyncEngine.ts
this.expressionMixer.setExpression('lipsync', 'aa', weight);

// ExpressionMixer handles all VRM writes
```

**Changes Required:**

1. `LipSyncEngine.ts`:
   - Remove direct `expressionManager` access
   - Accept `ExpressionMixer` reference in constructor
   - Output to 'lipsync' channel only

2. `ExpressionMixer.ts`:
   - Already has priority system (lipsync: 100)
   - Becomes the ONLY component that writes to `expressionManager`

3. **Separate phonemes from emotions:**
   
   | Channel | Controls | Priority |
   |---------|----------|----------|
   | lipsync | aa, ih, ou, ee, oh, jawOpen | 100 |
   | emotion | happy, sad, angry, surprised, relaxed | 80 |
   | blink | blink, blinkLeft, blinkRight | 60 |
   
   Mouth visemes and facial emotions should not compete.

### 0.2 Unify Animation Mixers

**Current (broken):**
```typescript
// IdleAnimations.ts
this.mixer = new THREE.AnimationMixer(vrm.scene);  // Mixer 1

// AnimationPlayer.ts  
this.mixer = new THREE.AnimationMixer(vrm.scene);  // Mixer 2
```

Two mixers fighting over the same bones.

**Target: Single AnimationGraph**

```typescript
// AnimationGraph.ts (new)
class AnimationGraph {
  private mixer: THREE.AnimationMixer;
  
  // Layers (additive blending)
  private baseLayer: AnimationLayer;      // Idle (always playing)
  private additiveLayer: AnimationLayer;  // Gestures (blend on top)
  
  playBase(clip: THREE.AnimationClip): void;
  playAdditive(clip: THREE.AnimationClip, weight?: number): void;
  
  update(deltaTime: number): void;
}
```

**Key behavior changes:**
- Idle NEVER pauses
- Gestures blend additively on upper body
- No more `pause()`/`resume()` coordination

### 0.3 File Changes Summary

| File | Action |
|------|--------|
| `LipSyncEngine.ts` | Remove VRM writes, output to mixer |
| `ExpressionMixer.ts` | Become sole VRM expression writer |
| `IdleAnimations.ts` | Merge into AnimationGraph |
| `AnimationPlayer.ts` | Merge into AnimationGraph |
| `AnimationGraph.ts` | **NEW** - unified animation system |
| `AnimationController.ts` | Use AnimationGraph, simplified |

---

## Phase 1: BehaviorPlanner

The brain that decides *why* and *how* the avatar moves.

### 1.1 Intent System

**Replace animation commands with semantic intents.**

Current LLM output:
```
[emotion:happy] [anim:wave] Hello there!
```

New LLM output:
```
[intent:greeting] [mood:happy] [energy:high] Hello there!
```

#### Intent Vocabulary

| Intent | Meaning | Possible Behaviors |
|--------|---------|-------------------|
| `greeting` | Hello/welcome | wave, head tilt, smile, lean forward |
| `farewell` | Goodbye | wave, nod, slight bow |
| `agreement` | Yes/confirm | nod, smile, lean in |
| `disagreement` | No/deny | head shake, slight frown, lean back |
| `thinking` | Processing | look away, hand to chin, unfocused eyes |
| `listening` | Attentive | eye contact, small nods, still posture |
| `affection` | Love/care | soft smile, head tilt, warm eyes |
| `embarrassed` | Shy/flustered | look away, blush, nervous fidget |
| `playful` | Teasing/fun | smirk, exaggerated expressions |
| `curious` | Interested | lean forward, wide eyes, head tilt |
| `surprised` | Unexpected | wide eyes, slight jump, raised brows |
| `pleased` | Satisfaction | smile, relaxed posture, soft eyes |
| `annoyed` | Mild frustration | slight frown, sigh gesture |
| `attention-seeking` | Wants focus | lean in, direct gaze, small wave |

#### Mood Values

Persistent emotional state (changes slowly):
- `happy`, `sad`, `angry`, `calm`, `anxious`, `neutral`

#### Energy Levels

Affects intensity and speed:
- `low` — Subdued movements, slower
- `medium` — Natural pace
- `high` — Energetic, faster, larger movements

### 1.2 BehaviorPlanner Interface

```typescript
// types/behavior.ts

interface BehaviorInput {
  // From LLM response
  intent?: Intent;
  mood?: Mood;
  energy?: EnergyLevel;
  
  // Conversation state
  isSpeaking: boolean;
  isListening: boolean;
  turnCount: number;
  timeSinceUserMessage: number;
  
  // User actions
  userAction?: UserAction;
  
  // Time
  timeSinceLastBehavior: number;
  sessionDuration: number;
}

interface BehaviorOutput {
  // Face
  facialEmotion: {
    expression: string;
    intensity: number;      // 0-1
    transitionMs: number;
  };
  
  // Attention
  attention: {
    target: 'user' | 'away' | 'wander';
    duration?: number;
  };
  
  // Body
  bodyAction?: {
    gesture: string;        // Maps to animation
    intensity: number;
    additive: boolean;      // Blend with idle or replace
  };
  
  // Micro-behaviors (queue)
  microBehaviors: MicroBehavior[];
  
  // Voice modifiers (for TTS)
  vocalHints?: {
    speed: number;          // 0.8-1.2
    pitch: number;          // 0.9-1.1
  };
}

type Intent = 
  | 'greeting' | 'farewell' | 'agreement' | 'disagreement'
  | 'thinking' | 'listening' | 'affection' | 'embarrassed'
  | 'playful' | 'curious' | 'surprised' | 'pleased'
  | 'annoyed' | 'attention-seeking' | 'neutral';

type Mood = 'happy' | 'sad' | 'angry' | 'calm' | 'anxious' | 'neutral';

type EnergyLevel = 'low' | 'medium' | 'high';

interface UserAction {
  type: 'tap_face' | 'tap_body' | 'drag' | 'hold' | 'rapid_taps' | 'idle_timeout';
  position?: { x: number; y: number };
  duration?: number;
}

interface MicroBehavior {
  type: 'glance_away' | 'glance_back' | 'blink' | 'posture_shift' | 
        'head_tilt' | 'anticipation' | 'nod_small';
  delay: number;            // ms from now
  duration?: number;
}
```

### 1.3 BehaviorPlanner Implementation

```typescript
// behavior/BehaviorPlanner.ts

class BehaviorPlanner {
  private currentMood: Mood = 'neutral';
  private currentEnergy: EnergyLevel = 'medium';
  private behaviorHistory: BehaviorOutput[] = [];
  
  constructor(private config: BehaviorConfig) {}
  
  /**
   * Main decision function - called when new input arrives
   */
  plan(input: BehaviorInput): BehaviorOutput {
    // Update persistent state
    if (input.mood) this.currentMood = input.mood;
    if (input.energy) this.currentEnergy = input.energy;
    
    // Decide behavior based on intent + context
    const behavior = this.selectBehavior(input);
    
    // Add micro-behaviors for naturalness
    behavior.microBehaviors = this.planMicroBehaviors(input, behavior);
    
    // Record for history
    this.behaviorHistory.push(behavior);
    
    return behavior;
  }
  
  private selectBehavior(input: BehaviorInput): BehaviorOutput {
    // Intent-based selection with randomization
    const candidates = this.getBehaviorCandidates(input.intent);
    const selected = this.weightedSelect(candidates, input);
    
    // Adjust intensity based on energy
    selected.facialEmotion.intensity *= this.energyMultiplier();
    
    return selected;
  }
  
  private getBehaviorCandidates(intent: Intent): BehaviorCandidate[] {
    // Example: greeting has multiple valid expressions
    switch (intent) {
      case 'greeting':
        return [
          { gesture: 'wave', weight: 0.4 },
          { gesture: 'nod', weight: 0.3 },
          { gesture: 'head_tilt', weight: 0.2 },
          { gesture: null, weight: 0.1 },  // Just smile
        ];
      // ... other intents
    }
  }
  
  private planMicroBehaviors(
    input: BehaviorInput, 
    mainBehavior: BehaviorOutput
  ): MicroBehavior[] {
    const micros: MicroBehavior[] = [];
    
    // While listening: occasional small nods
    if (input.isListening && Math.random() < 0.3) {
      micros.push({ type: 'nod_small', delay: 500 + Math.random() * 1000 });
    }
    
    // Before speaking: anticipation
    if (input.intent && !input.isSpeaking) {
      micros.push({ type: 'anticipation', delay: 0 });
    }
    
    // Idle: occasional glances
    if (input.timeSinceLastBehavior > 3000) {
      micros.push({ type: 'glance_away', delay: 0, duration: 800 });
      micros.push({ type: 'glance_back', delay: 1200 });
    }
    
    return micros;
  }
  
  private energyMultiplier(): number {
    switch (this.currentEnergy) {
      case 'low': return 0.7;
      case 'medium': return 1.0;
      case 'high': return 1.3;
    }
  }
}
```

### 1.4 Behavior Mapping Table

Maps intents → concrete behaviors. BehaviorPlanner uses this + randomization.

```typescript
// behavior/behavior-mappings.ts

const BEHAVIOR_MAPPINGS: Record<Intent, BehaviorMapping> = {
  greeting: {
    emotions: [
      { expression: 'happy', intensity: 0.7, weight: 0.6 },
      { expression: 'relaxed', intensity: 0.5, weight: 0.4 },
    ],
    gestures: [
      { name: 'wave', weight: 0.4, additive: true },
      { name: 'nod', weight: 0.3, additive: true },
      { name: null, weight: 0.3 },  // No gesture
    ],
    attention: { target: 'user' },
  },
  
  thinking: {
    emotions: [
      { expression: 'neutral', intensity: 0.3, weight: 1.0 },
    ],
    gestures: [
      { name: 'thinking', weight: 0.6, additive: false },
      { name: null, weight: 0.4 },
    ],
    attention: { target: 'away' },
  },
  
  embarrassed: {
    emotions: [
      { expression: 'relaxed', intensity: 0.4, weight: 0.5 },
      { expression: 'happy', intensity: 0.3, weight: 0.5 },  // Shy smile
    ],
    gestures: [
      { name: 'shy', weight: 0.5, additive: true },
      { name: null, weight: 0.5 },
    ],
    attention: { target: 'away' },
    microBehaviors: ['glance_away', 'glance_back'],
  },
  
  // ... all other intents
};
```

### 1.5 Integration with AnimationController

```typescript
// AnimationController.ts (updated)

class AnimationController {
  private behaviorPlanner: BehaviorPlanner;
  private animationGraph: AnimationGraph;
  private expressionMixer: ExpressionMixer;
  
  /**
   * Called when LLM response arrives
   * OLD: setMood('happy'); triggerGesture('wave');
   * NEW: handleIntent({ intent: 'greeting', mood: 'happy' });
   */
  handleIntent(input: Partial<BehaviorInput>): void {
    const fullInput: BehaviorInput = {
      ...input,
      isSpeaking: this.lipSync.isActive,
      isListening: !this.lipSync.isActive,
      turnCount: this.conversationState.turnCount,
      timeSinceUserMessage: this.conversationState.timeSinceUser,
      timeSinceLastBehavior: this.lastBehaviorTime,
      sessionDuration: this.sessionStart,
    };
    
    const behavior = this.behaviorPlanner.plan(fullInput);
    this.executeBehavior(behavior);
  }
  
  private executeBehavior(behavior: BehaviorOutput): void {
    // Face
    this.expressionMixer.transitionTo(
      'emotion',
      behavior.facialEmotion.expression,
      behavior.facialEmotion.intensity,
      behavior.facialEmotion.transitionMs
    );
    
    // Attention
    this.lookAtSystem.setTarget(behavior.attention.target);
    
    // Body
    if (behavior.bodyAction) {
      this.animationGraph.playAdditive(
        behavior.bodyAction.gesture,
        behavior.bodyAction.intensity
      );
    }
    
    // Queue micro-behaviors
    for (const micro of behavior.microBehaviors) {
      setTimeout(() => this.executeMicro(micro), micro.delay);
    }
  }
}
```

---

## Phase 2: Interaction System

Allow touch/click to generate emotional responses.

### 2.1 InteractionSensor

```typescript
// interaction/InteractionSensor.ts

class InteractionSensor {
  private canvas: HTMLCanvasElement;
  private raycaster: THREE.Raycaster;
  private vrm: VRM;
  
  // Callbacks
  onInteraction: (action: UserAction) => void;
  
  constructor(canvas: HTMLCanvasElement, vrm: VRM) {
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
  }
  
  private handlePointerDown(e: PointerEvent): void {
    const hit = this.raycast(e);
    if (!hit) return;
    
    this.touchStart = {
      time: Date.now(),
      position: hit.point,
      bone: this.getNearestBone(hit.point),
    };
  }
  
  private handlePointerUp(e: PointerEvent): void {
    if (!this.touchStart) return;
    
    const duration = Date.now() - this.touchStart.time;
    const zone = this.getZone(this.touchStart.bone);
    
    let action: UserAction;
    
    if (duration < 200) {
      action = { type: zone === 'head' ? 'tap_face' : 'tap_body' };
    } else if (duration < 1000) {
      action = { type: 'hold', duration };
    } else {
      action = { type: 'hold', duration };  // Long hold
    }
    
    this.onInteraction?.(action);
  }
  
  private getZone(bone: string): 'head' | 'body' | 'hands' {
    if (['head', 'neck', 'leftEye', 'rightEye'].includes(bone)) return 'head';
    if (['leftHand', 'rightHand'].includes(bone)) return 'hands';
    return 'body';
  }
}
```

### 2.2 Interaction → Emotion Mapping

```typescript
// interaction/interaction-responses.ts

const INTERACTION_RESPONSES: Record<string, InteractionResponse> = {
  tap_face: {
    reactions: [
      { intent: 'surprised', weight: 0.4 },
      { intent: 'annoyed', weight: 0.3 },
      { intent: 'playful', weight: 0.3 },
    ],
  },
  
  tap_body: {
    reactions: [
      { intent: 'curious', weight: 0.5 },
      { intent: 'surprised', weight: 0.3 },
      { intent: 'neutral', weight: 0.2 },
    ],
  },
  
  hold: {
    reactions: [
      { intent: 'affection', weight: 0.5 },
      { intent: 'embarrassed', weight: 0.3 },
      { intent: 'pleased', weight: 0.2 },
    ],
  },
  
  rapid_taps: {
    reactions: [
      { intent: 'annoyed', weight: 0.6 },
      { intent: 'playful', weight: 0.4 },
    ],
  },
  
  idle_timeout: {  // No interaction for 30+ seconds
    reactions: [
      { intent: 'attention-seeking', weight: 0.7 },
      { intent: 'neutral', weight: 0.3 },
    ],
  },
};
```

---

## Phase 3: Micro-Behaviors

The subtle movements that make avatars feel alive.

### 3.1 MicroBehaviorController

```typescript
// behavior/MicroBehaviorController.ts

class MicroBehaviorController {
  private queue: ScheduledMicro[] = [];
  
  schedule(behavior: MicroBehavior): void {
    this.queue.push({
      behavior,
      executeAt: Date.now() + behavior.delay,
    });
  }
  
  update(deltaTime: number): MicroBehavior | null {
    const now = Date.now();
    const ready = this.queue.find(m => m.executeAt <= now);
    
    if (ready) {
      this.queue = this.queue.filter(m => m !== ready);
      return ready.behavior;
    }
    
    return null;
  }
}
```

### 3.2 Micro-Behavior Types

| Behavior | Implementation | When |
|----------|---------------|------|
| `glance_away` | LookAt → random offset | Idle, thinking |
| `glance_back` | LookAt → user | After glance_away |
| `nod_small` | Subtle head dip | Listening |
| `head_tilt` | Slight rotation | Curious, greeting |
| `posture_shift` | Small body movement | Long idle |
| `anticipation` | Slight inhale/lean | Before speaking |
| `blink` | Force blink | Transition moments |

### 3.3 Ambient Behavior Loop

Runs continuously during idle:

```typescript
// behavior/AmbientBehavior.ts

class AmbientBehavior {
  private lastGlance = 0;
  private lastShift = 0;
  
  update(deltaTime: number, state: BehaviorState): MicroBehavior[] {
    const now = Date.now();
    const micros: MicroBehavior[] = [];
    
    // Occasional glances (every 4-8 seconds)
    if (now - this.lastGlance > 4000 + Math.random() * 4000) {
      if (!state.isSpeaking && Math.random() < 0.4) {
        micros.push({ type: 'glance_away', delay: 0, duration: 600 });
        micros.push({ type: 'glance_back', delay: 900 });
        this.lastGlance = now;
      }
    }
    
    // Posture shifts (every 10-20 seconds)
    if (now - this.lastShift > 10000 + Math.random() * 10000) {
      micros.push({ type: 'posture_shift', delay: 0 });
      this.lastShift = now;
    }
    
    return micros;
  }
}
```

---

## Phase 4: Agent Prompt Updates

Update agent system prompts to emit intents instead of animations.

### Current Prompt Section

```
You can include these tags in responses:
[emotion:happy] [emotion:sad] [emotion:angry]
[anim:wave] [anim:nod] [anim:bow]
```

### New Prompt Section

```
Express yourself naturally with these tags:

INTENT (how you're communicating):
[intent:greeting] - Hello, welcome
[intent:farewell] - Goodbye
[intent:agreement] - Yes, nodding along
[intent:disagreement] - No, shaking head
[intent:thinking] - Processing, considering
[intent:listening] - Attentive, engaged
[intent:affection] - Warm, caring
[intent:embarrassed] - Shy, flustered
[intent:playful] - Teasing, fun
[intent:curious] - Interested, questioning
[intent:surprised] - Unexpected reaction
[intent:pleased] - Satisfied, content
[intent:annoyed] - Mild frustration

MOOD (your current emotional state):
[mood:happy] [mood:sad] [mood:calm] [mood:anxious]

ENERGY (intensity of expression):
[energy:low] - Subdued, tired
[energy:medium] - Normal
[energy:high] - Excited, energetic

Example:
[intent:greeting] [mood:happy] [energy:high] Oh! Welcome back! I missed you!
[intent:thinking] [mood:calm] Hmm, let me consider that...
[intent:embarrassed] [mood:happy] [energy:low] I-it's not like I was waiting for you...
```

---

## Migration Checklist

### Phase 0: Technical Debt
- [ ] `LipSyncEngine.ts` - Remove direct VRM writes
- [ ] `ExpressionMixer.ts` - Become sole expression writer
- [ ] `AnimationGraph.ts` - Create unified animation system
- [ ] `IdleAnimations.ts` - Merge into AnimationGraph
- [ ] `AnimationPlayer.ts` - Merge into AnimationGraph
- [ ] `AnimationController.ts` - Use new AnimationGraph
- [ ] Test: Verify lipsync + emotion blend correctly
- [ ] Test: Verify gestures blend with idle (no pausing)

### Phase 1: BehaviorPlanner
- [ ] `types/behavior.ts` - Define interfaces
- [ ] `behavior/BehaviorPlanner.ts` - Core planner
- [ ] `behavior/behavior-mappings.ts` - Intent → behavior tables
- [ ] `AnimationController.ts` - Add `handleIntent()` method
- [ ] Update chat response parser for new tags
- [ ] Test: Greeting intent produces varied behaviors
- [ ] Test: Mood persists across turns

### Phase 2: Interaction
- [ ] `interaction/InteractionSensor.ts` - Touch detection
- [ ] `interaction/interaction-responses.ts` - Response mappings
- [ ] Wire InteractionSensor → BehaviorPlanner
- [ ] Test: Tap face → surprised/annoyed reaction
- [ ] Test: Long hold → affection response

### Phase 3: Micro-Behaviors
- [ ] `behavior/MicroBehaviorController.ts` - Scheduling
- [ ] `behavior/AmbientBehavior.ts` - Idle behaviors
- [ ] Implement glance, nod, shift behaviors
- [ ] Test: Avatar glances away during long idle
- [ ] Test: Small nods while listening

### Phase 4: Agent Updates
- [ ] Update Emilia agent prompt
- [ ] Test: Agent emits intent tags
- [ ] Verify no [anim:] tags in output
- [ ] Fine-tune behavior mappings based on testing

---

## File Structure (Final)

```
frontend/src/avatar/
├── AvatarRenderer.ts
├── AnimationController.ts      # Updated - uses BehaviorPlanner
├── AnimationGraph.ts           # NEW - unified animation
├── LipSyncEngine.ts            # Updated - writes to mixer only
│
├── behavior/
│   ├── BehaviorPlanner.ts      # NEW - the brain
│   ├── behavior-mappings.ts    # NEW - intent → behavior
│   ├── MicroBehaviorController.ts  # NEW
│   └── AmbientBehavior.ts      # NEW
│
├── interaction/
│   ├── InteractionSensor.ts    # NEW - touch detection
│   └── interaction-responses.ts # NEW
│
├── expression/
│   └── ExpressionMixer.ts      # Updated - sole VRM writer
│
├── layers/
│   ├── BlinkController.ts
│   └── LookAtSystem.ts
│
└── types/
    └── behavior.ts             # NEW - behavior interfaces
```

---

## Success Criteria

After implementation, the avatar should:

1. **React variedly** — Same greeting intent produces different behaviors
2. **Feel alive in idle** — Occasional glances, shifts, micro-movements
3. **Respond to touch** — Tap face → reaction (surprised, annoyed, playful)
4. **Maintain mood** — Persistent emotional state affects all behaviors
5. **Never pause idle** — Gestures blend additively, idle always runs
6. **Lip sync cleanly** — No more emotion/phoneme conflicts

---

## LLM Response Tag Specification

### Tag Format

```
[intent:<intent>] [mood:<mood>] [energy:<level>] Response text...
```

**All tags are optional.** Missing tags use defaults:
- `intent` → `neutral`
- `mood` → persists from previous (or `neutral`)
- `energy` → `medium`

**Examples:**
```
[intent:greeting] [mood:happy] [energy:high] Hello there! I'm so glad you're here!
[intent:thinking] [mood:calm] Hmm, let me consider that for a moment...
[intent:embarrassed] [mood:happy] [energy:low] I-it's not like I was waiting for you...
[intent:agreement] Yes, I think you're absolutely right about that.
[intent:farewell] [mood:sad] [energy:low] I'll miss you... come back soon.
[intent:playful] [mood:happy] [energy:high] Hehe, wouldn't you like to know~
```

---

### Tag Reference

#### Intent Values

| Intent | Meaning | Typical Behaviors |
|--------|---------|-------------------|
| `greeting` | Hello, welcome | wave, smile, head tilt, lean forward |
| `farewell` | Goodbye | wave, nod, slight bow, soft smile |
| `agreement` | Yes, confirm | nod, smile, lean in |
| `disagreement` | No, deny | head shake, slight frown, lean back |
| `thinking` | Processing | look away, hand to chin, unfocused eyes |
| `listening` | Attentive | eye contact, small nods, still posture |
| `affection` | Love, care | soft smile, head tilt, warm eyes |
| `embarrassed` | Shy, flustered | look away, blush, nervous fidget |
| `playful` | Teasing, fun | smirk, exaggerated expressions, energy |
| `curious` | Interested | lean forward, wide eyes, head tilt |
| `surprised` | Unexpected | wide eyes, slight jump, raised brows |
| `pleased` | Satisfied | smile, relaxed posture, soft eyes |
| `annoyed` | Mild frustration | slight frown, sigh, tension |
| `attention-seeking` | Wants focus | lean in, direct gaze, small gestures |
| `neutral` | Default | minimal expression, idle pose |

#### Mood Values

Persistent emotional state. Changes slowly, affects all behaviors.

| Mood | Description |
|------|-------------|
| `happy` | Positive, upbeat baseline |
| `sad` | Melancholy, subdued |
| `angry` | Frustrated, tense |
| `calm` | Peaceful, relaxed |
| `anxious` | Nervous, on edge |
| `neutral` | Default baseline |

#### Energy Values

Controls intensity and speed of all expressions/movements.

| Energy | Multiplier | Description |
|--------|------------|-------------|
| `low` | 0.7x | Subdued, slower, smaller movements |
| `medium` | 1.0x | Normal pace and intensity |
| `high` | 1.3x | Energetic, faster, larger movements |

---

### Backend Parsing Implementation

```python
# backend/utils/tag_parser.py

import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class ParsedResponse:
    text: str
    intent: str = "neutral"
    mood: Optional[str] = None      # None = persist previous
    energy: str = "medium"

# Regex patterns
INTENT_PATTERN = re.compile(r'\[intent:(\w+)\]\s*', re.IGNORECASE)
MOOD_PATTERN = re.compile(r'\[mood:(\w+)\]\s*', re.IGNORECASE)
ENERGY_PATTERN = re.compile(r'\[energy:(\w+)\]\s*', re.IGNORECASE)

# Valid values
VALID_INTENTS = {
    'greeting', 'farewell', 'agreement', 'disagreement',
    'thinking', 'listening', 'affection', 'embarrassed',
    'playful', 'curious', 'surprised', 'pleased',
    'annoyed', 'attention-seeking', 'neutral'
}

VALID_MOODS = {'happy', 'sad', 'angry', 'calm', 'anxious', 'neutral'}

VALID_ENERGY = {'low', 'medium', 'high'}


def parse_response(raw_text: str) -> ParsedResponse:
    """Parse agent response tags."""
    text = raw_text
    result = ParsedResponse(text=text)
    
    # Parse [intent:X]
    match = INTENT_PATTERN.search(text)
    if match:
        intent = match.group(1).lower()
        if intent in VALID_INTENTS:
            result.intent = intent
        text = INTENT_PATTERN.sub('', text)
    
    # Parse [mood:X]
    match = MOOD_PATTERN.search(text)
    if match:
        mood = match.group(1).lower()
        if mood in VALID_MOODS:
            result.mood = mood
        text = MOOD_PATTERN.sub('', text)
    
    # Parse [energy:X]
    match = ENERGY_PATTERN.search(text)
    if match:
        energy = match.group(1).lower()
        if energy in VALID_ENERGY:
            result.energy = energy
        text = ENERGY_PATTERN.sub('', text)
    
    result.text = text.strip()
    return result


def parse_agent_response(raw_text: str) -> dict:
    """Parse agent response and return dict for API."""
    parsed = parse_response(raw_text)
    return {
        "text": parsed.text,
        "intent": parsed.intent,
        "mood": parsed.mood,
        "energy": parsed.energy,
    }
```

---

### Frontend Tag Parsing (TypeScript)

```typescript
// utils/tagParser.ts

interface ParsedResponse {
  text: string;
  intent: Intent;
  mood: Mood | null;
  energy: EnergyLevel;
}

const INTENT_REGEX = /\[intent:(\w+)\]\s*/gi;
const MOOD_REGEX = /\[mood:(\w+)\]\s*/gi;
const ENERGY_REGEX = /\[energy:(\w+)\]\s*/gi;

export function parseAgentResponse(rawText: string): ParsedResponse {
  let text = rawText;
  let intent: Intent = 'neutral';
  let mood: Mood | null = null;
  let energy: EnergyLevel = 'medium';

  // Parse [intent:X]
  const intentMatch = INTENT_REGEX.exec(text);
  if (intentMatch) {
    intent = intentMatch[1].toLowerCase() as Intent;
    text = text.replace(INTENT_REGEX, '');
  }

  // Parse [mood:X]
  const moodMatch = MOOD_REGEX.exec(text);
  if (moodMatch) {
    mood = moodMatch[1].toLowerCase() as Mood;
    text = text.replace(MOOD_REGEX, '');
  }

  // Parse [energy:X]
  const energyMatch = ENERGY_REGEX.exec(text);
  if (energyMatch) {
    energy = energyMatch[1].toLowerCase() as EnergyLevel;
    text = text.replace(ENERGY_REGEX, '');
  }

  return {
    text: text.trim(),
    intent,
    mood,
    energy,
  };
}
```

---

### API Response Schema

Update `/api/chat` response to include parsed tags:

```typescript
interface ChatResponse {
  // Text content (tags stripped)
  text: string;
  
  // Audio (optional)
  audio?: string;                    // base64
  alignment?: {
    chars: string[];
    charStartTimesMs: number[];
    charDurationsMs: number[];
  };
  
  // Behavior system
  behavior: {
    intent: Intent;
    mood: Mood | null;               // null = persist previous
    energy: EnergyLevel;
  };
}
```

---

## References

- Original critique: Thai's Telegram message (2026-02-06)
- Current architecture: `../animation/ARCHITECTURE.md`
- VRM specs: https://vrm.dev/en/

---

**Author:** Beatrice 💗  
**For:** Ram 🩷 (implementation)  
**Reviewed:** Pending
