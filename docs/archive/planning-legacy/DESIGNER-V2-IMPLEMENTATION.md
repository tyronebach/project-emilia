# Designer V2 — Frontend Implementation Plan

**For:** Claude/Codex coding agents
**Prereq:** Backend from `EMOTION-V2-IMPLEMENTATION.md` must be complete
**Codebase:** `/home/tbach/Projects/emilia-project/emilia-webapp/frontend/`
**Status:** Implemented (all phases complete, updated 2026-02-09 with mood simplification)

---

## Overview

The V1 Designer edits abstract "relationship types." **Scrap it.** 

V2 Designer focuses on:
1. **Agent Personality DNA** (what the agent IS — immutable per agent)
2. **User-Agent Relationships** (what the bond has BECOME — per user-agent pair)
3. **Trigger Calibration** (learned response profiles — the "my Rem ≠ your Rem" magic)

---

## Architecture Changes

### V1 Tabs (Current)
```
Agents | Moods | Relationships
```

### V2 Tabs (New)
```
Personality | Bonds | Calibration | Simulator
```

| Tab | Purpose |
|-----|---------|
| **Personality** | Edit agent DNA (baseline VAD, trigger sensitivities, trust dynamics) |
| **Bonds** | View/compare user-agent relationship states (trust, intimacy, etc.) |
| **Calibration** | Inspect per-user trigger calibration profiles |
| **Simulator** | Test interactions and see how triggers affect state |

---

## Phase 1: New Types & API Layer (2 tasks)

### Task 1.1: Update TypeScript types

**File:** `frontend/src/types/designer.ts`

**Replace/extend with:**
```typescript
// ============ AGENT PERSONALITY (DNA) ============

export interface AgentPersonality {
  id: string;
  name: string;
  description: string;
  vrm_model: string | null;
  voice_id: string | null;
  
  // Emotional Baseline
  baseline_valence: number;    // -1 to 1
  baseline_arousal: number;    // -1 to 1
  baseline_dominance: number;  // -1 to 1
  
  // Emotional Dynamics
  volatility: number;          // 0 to 3
  recovery_rate: number;       // 0 to 1
  mood_decay_rate: number;
  
  // Mood Disposition
  mood_baseline: Record<string, number>;
  
  // Trust Dynamics
  trust_gain_rate: number;     // 0 to 3
  trust_loss_rate: number;     // 0 to 3
  
  // Intrinsic Trigger Sensitivities (personality-based)
  // Maps trigger_type → sensitivity multiplier (0.1 to 3.0)
  trigger_sensitivities: Record<string, number>;
  
  // Essence Traits (hard limits)
  essence_floors: Record<string, number>;  // e.g., {"devotion": 0.7}
  essence_ceilings: Record<string, number>;
}

// ============ USER-AGENT BOND ============

export interface UserAgentBond {
  user_id: string;
  agent_id: string;
  agent_name: string;
  
  // Current Emotional State
  valence: number;
  arousal: number;
  dominance: number;
  
  // Mood State
  mood_weights: Record<string, number>;
  dominant_moods: string[];
  
  // Relationship Dimensions (0 to 1)
  trust: number;
  intimacy: number;
  playfulness_safety: number;
  conflict_tolerance: number;
  familiarity: number;
  attachment: number;
  
  // Temporal
  last_interaction: string;  // ISO timestamp
  interaction_count: number;
  
  // Has calibration data
  has_calibration: boolean;
}

export interface UserAgentBondSummary {
  user_id: string;
  agent_id: string;
  agent_name: string;
  trust: number;
  intimacy: number;
  interaction_count: number;
  last_interaction: string;
}

// ============ TRIGGER CALIBRATION ============

export interface TriggerCalibration {
  trigger_type: string;
  
  // Counts
  positive_weight: number;
  negative_weight: number;
  neutral_weight: number;
  occurrence_count: number;
  
  // Computed
  learned_multiplier: number;  // 0.5 to 1.5
  last_occurrence: string;     // ISO timestamp
}

export interface ContextBucket {
  key: string;  // e.g., "high_calm_ok"
  trust_level: 'low' | 'mid' | 'high';
  arousal_level: 'calm' | 'activated';
  recent_conflict: boolean;
  calibration: TriggerCalibration;
}

export interface ContextualCalibration {
  trigger_type: string;
  global: TriggerCalibration;
  buckets: ContextBucket[];
}

export interface UserCalibrationProfile {
  user_id: string;
  agent_id: string;
  agent_name: string;
  calibrations: ContextualCalibration[];
  total_interactions: number;
}

// ============ SIMULATION ============

export interface SimulationRequest {
  agent_id: string;
  user_id: string;
  message: string;
  // Optional: override current state for testing
  state_override?: Partial<UserAgentBond>;
}

export interface SimulationResult {
  detected_triggers: Array<{
    trigger: string;
    raw_intensity: number;
    effective_intensity: number;
    dna_sensitivity: number;
    bond_modifier: number;
    calibration_multiplier: number;
  }>;
  
  state_before: UserAgentBond;
  state_after: UserAgentBond;
  
  dimension_deltas: Record<string, number>;
  mood_shifts: Record<string, number>;
  
  context_block: string;  // What the LLM would see
}

// ============ MOOD GROUPS (added 2026-02-09) ============

export interface MoodInfo {
  valence: number;
  arousal: number;
}

export interface MoodGroup {
  label: string;    // e.g., "Warm & Caring"
  color: string;    // e.g., "#4ade80"
  moods: Record<string, MoodInfo>;
}

// ============ CONSOLIDATED TRIGGERS ============

export const TRIGGER_TAXONOMY = {
  play: ['teasing', 'banter', 'flirting'],
  care: ['comfort', 'praise', 'affirmation'],
  friction: ['criticism', 'rejection', 'boundary', 'dismissal'],
  repair: ['apology', 'accountability', 'reconnection'],
  vulnerability: ['disclosure', 'trust_signal'],
} as const;

export type TriggerCategory = keyof typeof TRIGGER_TAXONOMY;
export type TriggerType = typeof TRIGGER_TAXONOMY[TriggerCategory][number];
```

---

### Task 1.2: Create V2 API layer

**File:** `frontend/src/utils/designerApiV2.ts`

```typescript
/**
 * Designer API V2 - Personality, Bonds, Calibration
 */
import { fetchWithAuth } from './api';
import type {
  AgentPersonality,
  UserAgentBond,
  UserAgentBondSummary,
  UserCalibrationProfile,
  SimulationRequest,
  SimulationResult,
} from '../types/designer';

// ============ PERSONALITY (Agent DNA) ============

export async function getPersonalities(): Promise<AgentPersonality[]> {
  const res = await fetchWithAuth('/api/designer/v2/personalities');
  if (!res.ok) throw new Error(`Failed to fetch personalities: ${res.status}`);
  return res.json();
}

export async function getPersonality(agentId: string): Promise<AgentPersonality> {
  const res = await fetchWithAuth(`/api/designer/v2/personalities/${encodeURIComponent(agentId)}`);
  if (!res.ok) throw new Error(`Failed to fetch personality: ${res.status}`);
  return res.json();
}

export async function updatePersonality(
  agentId: string, 
  updates: Partial<AgentPersonality>
): Promise<AgentPersonality> {
  const res = await fetchWithAuth(`/api/designer/v2/personalities/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update personality: ${res.status}`);
  return res.json();
}

// ============ MOOD GROUPS (added 2026-02-09) ============

export async function getMoodGroups(): Promise<Record<string, MoodGroup>> {
  const res = await fetchWithAuth('/api/designer/v2/mood-groups');
  if (!res.ok) throw new Error(`Failed to fetch mood groups: ${res.status}`);
  return res.json();
}

// ============ BONDS (User-Agent Relationships) ============

export async function getBonds(agentId?: string): Promise<UserAgentBondSummary[]> {
  const url = agentId 
    ? `/api/designer/v2/bonds?agent_id=${encodeURIComponent(agentId)}`
    : '/api/designer/v2/bonds';
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch bonds: ${res.status}`);
  return res.json();
}

export async function getBond(userId: string, agentId: string): Promise<UserAgentBond> {
  const res = await fetchWithAuth(
    `/api/designer/v2/bonds/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch bond: ${res.status}`);
  return res.json();
}

export async function compareBonds(
  agentId: string, 
  userIds: string[]
): Promise<UserAgentBond[]> {
  const res = await fetchWithAuth(`/api/designer/v2/bonds/compare`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, user_ids: userIds }),
  });
  if (!res.ok) throw new Error(`Failed to compare bonds: ${res.status}`);
  return res.json();
}

export async function resetBond(userId: string, agentId: string): Promise<void> {
  const res = await fetchWithAuth(
    `/api/designer/v2/bonds/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`Failed to reset bond: ${res.status}`);
}

// ============ CALIBRATION ============

export async function getCalibration(
  userId: string, 
  agentId: string
): Promise<UserCalibrationProfile> {
  const res = await fetchWithAuth(
    `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch calibration: ${res.status}`);
  return res.json();
}

export async function resetCalibration(
  userId: string, 
  agentId: string, 
  triggerType?: string
): Promise<void> {
  const url = triggerType
    ? `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}/${encodeURIComponent(triggerType)}`
    : `/api/designer/v2/calibration/${encodeURIComponent(userId)}/${encodeURIComponent(agentId)}`;
  const res = await fetchWithAuth(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to reset calibration: ${res.status}`);
}

// ============ SIMULATION ============

export async function simulate(request: SimulationRequest): Promise<SimulationResult> {
  const res = await fetchWithAuth('/api/designer/v2/simulate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Simulation failed: ${res.status}`);
  return res.json();
}
```

---

## Phase 2: Personality Tab (2 tasks)

### Task 2.1: Create PersonalityTab component

**File:** `frontend/src/components/designer/PersonalityTab.tsx`

This replaces the old AgentListTab with V2-specific fields.

**Key sections:**
1. **Basic Info** — Name, description, avatar
2. **Emotional Baseline** — VAD sliders (-1 to 1)
3. **Emotional Dynamics** — Volatility, recovery rate
4. **Trust Dynamics** — Trust gain/loss rates
5. **Trigger Sensitivities** — Grouped by category (play, care, friction, repair, vulnerability)
6. **Essence Traits** — Floors and ceilings

**UI Pattern:**
```tsx
function PersonalityTab() {
  // List all agents with expandable cards
  // Each card shows personality DNA with editable fields
  // Group trigger sensitivities by TRIGGER_TAXONOMY categories
}
```

**Trigger Sensitivity Editor:**
```tsx
function TriggerSensitivityEditor({ 
  sensitivities, 
  onChange 
}: {
  sensitivities: Record<string, number>;
  onChange: (updated: Record<string, number>) => void;
}) {
  // Render grouped by category
  // Each trigger has a slider 0.1 → 3.0
  // Show visual indicator: <1 = muted, 1 = neutral, >1 = amplified
  // Color coding: red (0.1-0.5), yellow (0.5-0.8), green (0.8-1.2), blue (1.2-2), purple (2-3)
}
```

---

### Task 2.2: Create PersonalityCard component

**File:** `frontend/src/components/designer/PersonalityCard.tsx`

**Features:**
- Expandable card with agent name/id header
- Sections for each personality aspect
- Visual "essence preview" showing personality archetype
- Comparison mode: highlight differences from default

---

## Phase 3: Bonds Tab (3 tasks)

### Task 3.1: Create BondsTab component

**File:** `frontend/src/components/designer/BondsTab.tsx`

**Layout:**
1. Agent selector dropdown at top
2. List of user bonds for selected agent
3. Each bond card shows relationship dimensions

**Key features:**
- Filter by agent
- Sort by trust, interaction count, last active
- Quick stats: average trust, most/least bonded users

---

### Task 3.2: Create BondCard component

**File:** `frontend/src/components/designer/BondCard.tsx`

**Visual elements:**
```
┌─────────────────────────────────────────────────┐
│ User: thai_123          Agent: rem              │
│ Last active: 2 hours ago  |  142 interactions   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Trust          ████████████░░░░░  78%         │
│  Intimacy       ██████████░░░░░░░  65%         │
│  Playfulness    ██████████████░░░  89%         │
│  Conflict Tol   ███████░░░░░░░░░░  45%         │
│                                                 │
│  Dominant Moods: bashful, supportive            │
│  Current: Valence +0.3 | Arousal 0.2            │
│                                                 │
│  [View Calibration]  [Compare]  [Reset]         │
└─────────────────────────────────────────────────┘
```

**Components:**
- DimensionBar: Horizontal progress bar with color gradient
- MoodChips: Small badges showing dominant moods
- VADIndicator: Compact valence/arousal display

---

### Task 3.3: Create BondCompareView component

**File:** `frontend/src/components/designer/BondCompareView.tsx`

**Purpose:** Side-by-side comparison of same agent with different users.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Comparing: Rem                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │ User A (Thai)       │    │ User B (Guest)      │             │
│  │                     │    │                     │             │
│  │ Trust: 78% ████████ │    │ Trust: 32% ███░░░░░ │  ← DIVERGED │
│  │ Intimacy: 65%       │    │ Intimacy: 15%       │             │
│  │ Playfulness: 89%    │    │ Playfulness: 40%    │             │
│  │                     │    │                     │             │
│  │ 142 interactions    │    │ 8 interactions      │             │
│  └─────────────────────┘    └─────────────────────┘             │
│                                                                  │
│  Divergence Score: 0.73 (HIGH)                                  │
│  "These are effectively different Rems now"                      │
└─────────────────────────────────────────────────────────────────┘
```

**Divergence calculation:**
```typescript
function calculateDivergence(bondA: UserAgentBond, bondB: UserAgentBond): number {
  const dims = ['trust', 'intimacy', 'playfulness_safety', 'conflict_tolerance'];
  const diffs = dims.map(d => Math.abs(bondA[d] - bondB[d]));
  return diffs.reduce((a, b) => a + b, 0) / dims.length;
}
```

---

## Phase 4: Calibration Tab (3 tasks)

### Task 4.1: Create CalibrationTab component

**File:** `frontend/src/components/designer/CalibrationTab.tsx`

**Layout:**
1. Agent + User selector
2. Overview: calibration health, total interactions
3. Per-trigger calibration cards

---

### Task 4.2: Create CalibrationCard component

**File:** `frontend/src/components/designer/CalibrationCard.tsx`

**Shows one trigger's calibration profile:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Trigger: teasing                                     Category: play │
├─────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Global Multiplier: 1.35 ████████████████████░░░░ (amplified)     │
│  Occurrences: 127  |  Positive: 115  |  Negative: 12              │
│                                                                    │
│  Context Buckets:                                                  │
│  ┌──────────────────┬───────────┬────────┐                        │
│  │ Context          │ Multiplier│ Samples│                        │
│  ├──────────────────┼───────────┼────────┤                        │
│  │ high_calm_ok     │ 1.42      │ 89     │ ← Best context         │
│  │ mid_calm_ok      │ 1.15      │ 28     │                        │
│  │ low_calm_ok      │ 0.85      │ 10     │ ← Cautious             │
│  └──────────────────┴───────────┴────────┘                        │
│                                                                    │
│  Interpretation: "Teasing is very safe at high trust"             │
│                                                                    │
│  [Reset This Trigger]                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Visual indicators:**
- Multiplier bar: red (<0.8), yellow (0.8-1.0), green (1.0-1.2), blue (>1.2)
- Confidence indicator based on occurrence_count vs MIN_SAMPLES (30)
- Context bucket breakdown table

---

### Task 4.3: Create CalibrationHeatmap component

**File:** `frontend/src/components/designer/CalibrationHeatmap.tsx`

**Visual matrix showing all triggers × contexts:**
```
                     │ high_calm │ mid_calm │ low_calm │ high_act │ ...
─────────────────────┼───────────┼──────────┼──────────┼──────────┼────
teasing              │   🟢 1.4  │  🟢 1.2  │  🟡 0.9  │  🟢 1.3  │
banter               │   🟢 1.3  │  🟢 1.1  │  🟡 0.8  │  🟢 1.2  │
flirting             │   🟢 1.5  │  🟢 1.3  │  🔴 0.6  │  🔵 1.6  │
criticism            │   🟡 0.9  │  🟡 0.9  │  🔴 0.7  │  🔴 0.6  │
...
```

**Color scale:**
- 🔴 0.5-0.7: Strongly muted
- 🟡 0.7-0.95: Slightly muted
- ⚪ 0.95-1.05: Neutral
- 🟢 1.05-1.3: Slightly amplified
- 🔵 1.3-1.5: Strongly amplified

---

## Phase 5: Simulator Tab (2 tasks)

### Task 5.1: Create SimulatorTab component

**File:** `frontend/src/components/designer/SimulatorTab.tsx`

**Purpose:** Test messages and see how they affect emotional state.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Agent: [Rem ▼]    User: [Thai ▼]    [Load Current State]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Message: [You're such a dork sometimes, you know that? 💕    ]  │
│                                                    [Simulate]    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ DETECTED TRIGGERS                                                │
│ ┌────────────┬───────┬───────┬───────┬───────┬─────────┐        │
│ │ Trigger    │ Raw   │ DNA   │ Bond  │ Calib │ Final   │        │
│ ├────────────┼───────┼───────┼───────┼───────┼─────────┤        │
│ │ teasing    │ 0.70  │ ×1.5  │ ×1.2  │ ×1.35 │ = 1.70  │        │
│ │ affirmation│ 0.30  │ ×1.2  │ ×1.1  │ ×1.0  │ = 0.40  │        │
│ └────────────┴───────┴───────┴───────┴───────┴─────────┘        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ STATE CHANGES                                                    │
│                                                                  │
│ Valence:    +0.3 → +0.5  (+0.2)                                 │
│ Arousal:     0.2 →  0.4  (+0.2)                                 │
│ Trust:       0.78 → 0.78 (unchanged)                            │
│ Playfulness: 0.89 → 0.91 (+0.02)                                │
│                                                                  │
│ Mood Shifts: bashful +2, flirty +1                              │
│ New Dominant: bashful, flirty                                    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ CONTEXT BLOCK (what LLM sees)                                    │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ [EMOTIONAL_STATE]                                          │   │
│ │ You're feeling strongly bashful, with hints of flirty.     │   │
│ │                                                            │   │
│ │ Valence: +50% | Energy: 40% (moderate)                     │   │
│ │ Trust: 78% — comfortable, feels safe                       │   │
│ │ Intimacy: 65% — emotionally close                          │   │
│ │ Dynamic: teasing is safe and bonding                       │   │
│ │ [/EMOTIONAL_STATE]                                         │   │
│ └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Task 5.2: Create SimulationHistory component

**File:** `frontend/src/components/designer/SimulationHistory.tsx`

**Purpose:** Chain multiple simulations to test conversation flow.

**Features:**
- Run multiple messages in sequence
- See cumulative state changes
- Export simulation as test case
- "Replay" saved scenarios

---

## Phase 6: Shared Components (3 tasks)

### Task 6.1: Create DimensionBar component

**File:** `frontend/src/components/designer/DimensionBar.tsx`

```tsx
interface DimensionBarProps {
  label: string;
  value: number;  // 0 to 1
  delta?: number; // Optional change indicator
  colorScale?: 'trust' | 'intensity' | 'multiplier';
}

function DimensionBar({ label, value, delta, colorScale = 'trust' }: DimensionBarProps) {
  // Horizontal progress bar
  // Color gradient based on value and scale type
  // Optional delta indicator (+/-) with color
}
```

---

### Task 6.2: Create TriggerBadge component

**File:** `frontend/src/components/designer/TriggerBadge.tsx`

```tsx
interface TriggerBadgeProps {
  trigger: TriggerType;
  intensity?: number;
  multiplier?: number;
  size?: 'sm' | 'md';
}

function TriggerBadge({ trigger, intensity, multiplier, size = 'md' }: TriggerBadgeProps) {
  // Colored badge based on trigger category
  // play = blue, care = green, friction = red, repair = yellow, vulnerability = purple
  // Shows trigger name + optional intensity/multiplier
}
```

---

### Task 6.3: Create ContextBucketChip component

**File:** `frontend/src/components/designer/ContextBucketChip.tsx`

```tsx
interface ContextBucketChipProps {
  bucket: ContextBucket;
  onClick?: () => void;
}

function ContextBucketChip({ bucket, onClick }: ContextBucketChipProps) {
  // Small chip showing context state
  // Icons for trust level, arousal, conflict
  // Click to expand details
}
```

---

## Phase 7: Backend API Endpoints (Reference)

The frontend assumes these endpoints exist. Backend team should implement:

```python
# Personality (Agent DNA)
GET    /api/designer/v2/personalities
GET    /api/designer/v2/personalities/{agent_id}
PUT    /api/designer/v2/personalities/{agent_id}

# Trigger Defaults
GET    /api/designer/v2/trigger-defaults

# Mood Groups (added 2026-02-09)
GET    /api/designer/v2/mood-groups

# Bonds (User-Agent Relationships)
GET    /api/designer/v2/bonds?agent_id=...
GET    /api/designer/v2/bonds/{user_id}/{agent_id}
POST   /api/designer/v2/bonds/compare
DELETE /api/designer/v2/bonds/{user_id}/{agent_id}

# Calibration
GET    /api/designer/v2/calibration/{user_id}/{agent_id}
DELETE /api/designer/v2/calibration/{user_id}/{agent_id}
DELETE /api/designer/v2/calibration/{user_id}/{agent_id}/{trigger_type}

# Simulation
POST   /api/designer/v2/simulate
```

---

## File Structure

```
frontend/src/
├── components/designer/
│   ├── DesignerPageV2.tsx          # Main page with new tabs
│   ├── DesignerTabsV2.tsx          # Tab navigation
│   │
│   ├── PersonalityTab.tsx          # Phase 2
│   ├── PersonalityCard.tsx         # Includes Mood Baseline section
│   ├── TriggerResponseEditor.tsx   # Per-trigger presets + mood drift badges
│   ├── MoodBaselineEditor.tsx      # Grouped mood sliders (added 2026-02-09)
│   │
│   ├── BondsTab.tsx                # Phase 3
│   ├── BondCard.tsx
│   ├── BondCompareView.tsx
│   │
│   ├── CalibrationTab.tsx          # Phase 4
│   ├── CalibrationCard.tsx
│   ├── CalibrationHeatmap.tsx
│   │
│   ├── SimulatorTab.tsx            # Phase 5
│   ├── SimulationHistory.tsx
│   │
│   ├── DimensionBar.tsx            # Phase 6 (shared)
│   ├── TriggerBadge.tsx
│   ├── ContextBucketChip.tsx
│   ├── SliderField.tsx             # Reusable slider
│   ├── Tooltip.tsx                 # HelpDot tooltip
│   │
│   └── (V1 components removed)
│
├── types/
│   └── designer.ts                 # V2 types (incl. MoodInfo, MoodGroup)
│
└── utils/
    └── designerApiV2.ts            # V2 API (incl. getMoodGroups)
```

---

## Migration Strategy

1. **Keep V1 running** — Don't break existing functionality
2. **Add V2 as `/designer-v2`** — New route during development
3. **Feature flag** — Allow switching between V1/V2 in UI
4. **Deprecate V1** — After V2 is stable, redirect old route

---

## Success Criteria

- [x] Can view all agent personalities with V2 fields
- [x] Can edit trigger responses with presets (threatening→intense) grouped by category
- [x] Can edit mood baseline via grouped sliders (MoodBaselineEditor)
- [x] Can see all user-agent bonds with relationship dimensions
- [x] Can compare same agent across different users
- [x] Can inspect calibration profiles with context buckets
- [x] Simulator shows three-layer delta breakdown + mood shifts via V/A projection
- [x] TriggerResponseEditor shows mood drift preview badges per trigger
- [x] Divergence score clearly shows "my Rem ≠ your Rem"

---

## Spawn Strategy

For parallel work with sub-agents:

1. **Agent A:** Phase 1 (types + API) → Phase 2 (Personality)
2. **Agent B:** Phase 3 (Bonds) + BondCompareView
3. **Agent C:** Phase 4 (Calibration) + Heatmap
4. **Agent D:** Phase 5 (Simulator) + Phase 6 (shared components)
5. **Final:** Integration, routing, feature flag

Dependencies: Phase 1 must complete first. Others can proceed in parallel.

---

*"A designer should reveal the soul of the system, not obscure it."*

— Beatrice 💗
