# P007: Drift Simulator Accuracy — Data-Driven Archetypes

**Date:** 2026-02-11  
**Status:** Proposed  
**Scope:** Align drift simulator with live chat behavior. UI-driven archetype management via Designer V2.

---

## 1. Problem Statement

The drift simulator is used to test agent personas during design. However, it does not accurately mirror live chat behavior:

| Aspect | Live Chat | Current Drift Simulator |
|--------|-----------|-------------------------|
| Triggers per message | **Multiple** (all above threshold) | **One** (sampled from probability) |
| Intensity source | Classifier confidence (0.0-1.0) | Random `uniform(0.3, 1.0)` |
| Trigger selection | Deterministic (classifier output) | Probabilistic (weighted random) |
| Archetype definition | N/A (real user) | Hand-crafted probability weights |

**Result:** Simulator tests a simplified approximation, not actual emotion engine behavior. Personas tuned in simulator may behave differently in production.

---

## 2. Goals

1. Drift simulator applies **multiple triggers per message** (like live chat)
2. Trigger intensities come from **real classifier confidence scores**
3. Archetypes managed via **Designer V2 UI** (no CLI required)
4. Users can **upload .txt files** to generate archetypes
5. Full **CRUD for archetypes** in Designer
6. Simulator behavior matches live chat's `_process_emotion_pre_llm()` exactly
7. Backward compatible — built-in system archetypes still available

---

## 3. Architecture Overview

### 3.1 Data Flow

```
Designer V2 UI
    │
    ├── Upload .txt file ──► POST /api/designer/v2/archetypes/generate
    │                              │
    │                              ▼
    │                        TriggerClassifier.classify() per line
    │                              │
    │                              ▼
    │                        Save to drift_archetypes table
    │
    ├── CRUD archetypes ──► GET/POST/PUT/DELETE /api/designer/v2/archetypes
    │
    └── Run Drift Sim ──► Simulator loads archetypes from DB
                               │
                               ▼
                         Replay trigger sets (like live chat)
```

### 3.2 Live Chat Flow (Reference)

```python
# In _process_emotion_pre_llm()
triggers = engine.detect_triggers(user_message)  # Returns [(trigger, confidence), ...]

for trigger, intensity in triggers:
    deltas = engine.apply_trigger_calibrated(state, trigger, intensity, calibration)
    total_va_delta[axis] += deltas.get(axis, 0.0)

# Then project V/A deltas onto moods
mood_deltas = engine.calculate_mood_deltas_from_va(total_va_delta)
engine.apply_mood_deltas(state, mood_deltas)
```

**Key behaviors simulator must match:**
- Multiple triggers per message
- Each trigger has classifier-derived intensity
- V/A deltas accumulated across all triggers
- Single mood projection after all triggers applied

---

## 4. Database Schema

### 4.1 New Table: `drift_archetypes`

```sql
CREATE TABLE IF NOT EXISTS drift_archetypes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '2',
    message_triggers TEXT NOT NULL,      -- JSON: [[["trigger", intensity], ...], ...]
    outcome_weights TEXT DEFAULT '{}',   -- JSON: {"positive": 0.33, ...}
    sample_count INTEGER DEFAULT 0,
    source_filename TEXT,                -- Original uploaded filename
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    created_by TEXT,                     -- user_id who created
    is_system INTEGER DEFAULT 0          -- 1 = built-in, 0 = user-created
);

CREATE INDEX IF NOT EXISTS idx_drift_archetypes_system ON drift_archetypes(is_system);
```

### 4.2 Data Format

**message_triggers (JSON array):**
```json
[
  [["annoyance", 0.72], ["disapproval", 0.65]],
  [["disappointment", 0.58]],
  [["annoyance", 0.81], ["anger", 0.45]],
  [],
  [["disapproval", 0.91]]
]
```

Each inner array = triggers detected for one message (can be empty).

**outcome_weights (JSON object):**
```json
{
  "positive": 0.10,
  "neutral": 0.30,
  "negative": 0.60
}
```

### 4.3 System Archetypes Seed

On DB init, seed built-in archetypes with `is_system = 1`:
- aggressive, supportive, playful, flirty, neutral, random
- These use legacy v1 format (probability weights) for backward compat
- Users cannot delete system archetypes

---

## 5. Backend API

### 5.1 Endpoints

**List Archetypes**
```
GET /api/designer/v2/archetypes
```
Response:
```json
{
  "archetypes": [
    {
      "id": "aggressive",
      "name": "Aggressive",
      "description": "Demanding, critical user",
      "version": "1",
      "sample_count": null,
      "is_system": true,
      "created_at": 1707600000
    },
    {
      "id": "my-custom-archetype",
      "name": "Frustrated Customer",
      "description": "Derived from 150 support messages",
      "version": "2",
      "sample_count": 150,
      "is_system": false,
      "created_at": 1707650000
    }
  ]
}
```

**Get Archetype Detail**
```
GET /api/designer/v2/archetypes/{id}
```
Response includes full `message_triggers` and `outcome_weights`.

**Create Archetype (Manual)**
```
POST /api/designer/v2/archetypes
```
Body:
```json
{
  "id": "my-archetype",
  "name": "My Archetype",
  "description": "Custom archetype",
  "message_triggers": [...],
  "outcome_weights": {...}
}
```

**Generate Archetype from File**
```
POST /api/designer/v2/archetypes/generate
Content-Type: multipart/form-data

file: <messages.txt>
id: "frustrated-customer"
name: "Frustrated Customer"
description: "Support ticket messages"
```

Process:
1. Read uploaded .txt file
2. For each non-empty line: `TriggerClassifier.classify(line)`
3. Build `message_triggers` array
4. Save to DB with `version = "2"`

Response:
```json
{
  "id": "frustrated-customer",
  "name": "Frustrated Customer",
  "sample_count": 150,
  "trigger_distribution": {
    "annoyance": 0.28,
    "disappointment": 0.22,
    ...
  }
}
```

**Update Archetype**
```
PUT /api/designer/v2/archetypes/{id}
```
Body (partial update):
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "outcome_weights": {"positive": 0.2, "neutral": 0.4, "negative": 0.4}
}
```
Note: `message_triggers` not editable directly (regenerate via file upload).

**Delete Archetype**
```
DELETE /api/designer/v2/archetypes/{id}
```
- Only allowed for user-created archetypes (`is_system = 0`)
- Returns 403 for system archetypes

### 5.2 Repository

**File:** `backend/db/repositories/archetype_repository.py`

```python
class ArchetypeRepository:
    @staticmethod
    def get_all() -> list[dict]:
        """Get all archetypes (system + user)."""
    
    @staticmethod
    def get_by_id(archetype_id: str) -> dict | None:
        """Get archetype by ID with full data."""
    
    @staticmethod
    def create(data: dict) -> dict:
        """Create new archetype."""
    
    @staticmethod
    def update(archetype_id: str, data: dict) -> dict | None:
        """Update archetype fields."""
    
    @staticmethod
    def delete(archetype_id: str) -> bool:
        """Delete archetype (user-created only)."""
    
    @staticmethod
    def generate_from_messages(
        archetype_id: str,
        name: str,
        description: str,
        messages: list[str],
        created_by: str | None = None
    ) -> dict:
        """Classify messages and create v2 archetype."""
```

---

## 6. Drift Simulator Refactor

### 6.1 Load Archetypes from DB

```python
# In drift_simulator.py

from db.repositories import ArchetypeRepository

def load_archetypes() -> dict:
    """Load all archetypes from database."""
    rows = ArchetypeRepository.get_all()
    archetypes = {}
    for row in rows:
        archetype_id = row["id"]
        archetypes[archetype_id] = {
            "name": row["name"],
            "description": row["description"],
            "version": row["version"],
            "message_triggers": json.loads(row["message_triggers"]) if row["message_triggers"] else [],
            "outcome_weights": json.loads(row["outcome_weights"]) if row["outcome_weights"] else {},
            "sample_count": row["sample_count"],
        }
    return archetypes

# Called at simulation start, not module load
# (allows DB changes to be picked up)
```

### 6.2 Refactored Message Processing

```python
def run(self) -> DriftSimulationResult:
    # ... setup ...
    
    for day in range(self.config.duration_days):
        for session in range(self.config.sessions_per_day):
            # Apply decay (unchanged)
            if day > 0 or session > 0:
                gap = self._calculate_gap(day, session)
                self.state = self.engine.apply_decay(self.state, gap * 3600)
                self.engine.apply_mood_decay(self.state, gap * 3600)
                elapsed_hours += gap

            for msg in range(self.config.messages_per_session):
                # === NEW: Multi-trigger processing (like live chat) ===
                trigger_set = self._get_next_trigger_set(day)
                
                # Accumulate V/A deltas across all triggers
                total_va_delta = {'valence': 0.0, 'arousal': 0.0}
                
                for trigger, intensity in trigger_set:
                    deltas = self.engine.apply_trigger(self.state, trigger, intensity)
                    total_va_delta['valence'] += deltas.get('valence', 0.0)
                    total_va_delta['arousal'] += deltas.get('arousal', 0.0)
                    self._track_trigger(trigger_agg, trigger, intensity, deltas)
                
                # Single mood projection after all triggers (like live chat)
                if trigger_set:
                    mood_deltas = self.engine.calculate_mood_deltas_from_va(total_va_delta)
                    if mood_deltas:
                        self.engine.apply_mood_deltas(self.state, mood_deltas)
                # === END NEW ===
                
                # Outcome (unchanged)
                outcome = self._sample_outcome(day)
                self._apply_outcome(outcome)
                
                # Record point (unchanged)
                ...
```

### 6.3 Trigger Set Selection

```python
def _get_next_trigger_set(self, day: int) -> list[tuple[str, float]]:
    """Get trigger set for current message."""
    version = self.archetype.get("version", "1")
    
    if version == "2":
        # V2: Replay from classified messages
        message_triggers = self._get_phase_message_triggers(day)
        if not message_triggers:
            return []
        
        if self.config.replay_mode == "sequential":
            idx = self._message_index % len(message_triggers)
            self._message_index += 1
            return [(t, i) for t, i in message_triggers[idx]]
        else:  # "random"
            selected = self.rng.choice(message_triggers)
            return [(t, i) for t, i in selected]
    
    else:
        # V1 Legacy: Probability sampling (backward compat)
        trigger = self._sample_trigger_legacy(day)
        intensity = self.rng.uniform(0.3, 1.0)
        return [(trigger, intensity)]
```

---

## 7. Frontend — Designer V2 Archetypes Tab

### 7.1 New Components

**File:** `frontend/src/components/designer/ArchetypesTab.tsx`

**Sections:**
1. **Archetype List** — Table showing all archetypes (system badge, sample count, actions)
2. **Create Modal** — Upload .txt file, set name/description
3. **Edit Modal** — Update name, description, outcome_weights
4. **Detail View** — Show trigger distribution chart, sample triggers

### 7.2 UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Archetypes                                    [+ New Archetype] │
├─────────────────────────────────────────────────────────────────┤
│ Name                │ Type   │ Samples │ Created    │ Actions  │
├─────────────────────┼────────┼─────────┼────────────┼──────────┤
│ Aggressive          │ System │ —       │ Built-in   │ View     │
│ Supportive          │ System │ —       │ Built-in   │ View     │
│ Playful             │ System │ —       │ Built-in   │ View     │
│ Frustrated Customer │ Custom │ 150     │ 2 hours ago│ Edit Del │
│ Happy User          │ Custom │ 80      │ Yesterday  │ Edit Del │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Create Archetype Flow

1. Click "+ New Archetype"
2. Modal opens:
   - ID field (slug, auto-generated from name)
   - Name field
   - Description field
   - File upload (drag & drop .txt)
   - Outcome weights sliders (positive/neutral/negative)
3. Click "Generate"
4. Backend classifies → saves → returns stats
5. Modal shows: "Created archetype with 150 messages, 8 unique triggers"
6. Close modal, list refreshes

### 7.4 API Client

**File:** `frontend/src/utils/designerApiV2.ts`

```typescript
// Add to existing file

export async function getArchetypes(): Promise<Archetype[]> {
  const res = await fetchWithAuth('/api/designer/v2/archetypes');
  const data = await res.json();
  return data.archetypes;
}

export async function getArchetype(id: string): Promise<ArchetypeDetail> {
  const res = await fetchWithAuth(`/api/designer/v2/archetypes/${id}`);
  return res.json();
}

export async function generateArchetype(
  file: File,
  id: string,
  name: string,
  description: string
): Promise<ArchetypeDetail> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('id', id);
  formData.append('name', name);
  formData.append('description', description);
  
  const res = await fetchWithAuth('/api/designer/v2/archetypes/generate', {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function updateArchetype(
  id: string,
  data: Partial<Archetype>
): Promise<ArchetypeDetail> {
  const res = await fetchWithAuth(`/api/designer/v2/archetypes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteArchetype(id: string): Promise<void> {
  await fetchWithAuth(`/api/designer/v2/archetypes/${id}`, {
    method: 'DELETE',
  });
}
```

### 7.5 Update DriftSimulatorTab

- Archetype dropdown fetches from `/api/designer/v2/archetypes`
- Shows badge for v1 (legacy) vs v2 (data-driven)
- Adds replay mode selector for v2 archetypes (sequential/random)

---

## 8. Implementation Phases

### Phase 1: Database & Repository (Est: 2 hours)

**Files:**
- [ ] `backend/db/connection.py` — Add `drift_archetypes` table
- [ ] `backend/db/repositories/archetype_repository.py` — NEW
- [ ] `backend/db/repositories/__init__.py` — Export

**Acceptance:**
- [ ] Table created on startup
- [ ] System archetypes seeded (v1 format)
- [ ] Repository CRUD methods work

### Phase 2: Backend API (Est: 3 hours)

**Files:**
- [ ] `backend/routers/designer_v2.py` — Add archetype endpoints
- [ ] `backend/schemas/requests.py` — Add request models
- [ ] `backend/schemas/responses.py` — Add response models

**Acceptance:**
- [ ] All CRUD endpoints work
- [ ] File upload + classification works
- [ ] System archetypes protected from delete

### Phase 3: Refactor Drift Simulator (Est: 3-4 hours)

**Files:**
- [ ] `backend/services/drift_simulator.py` — Major refactor

**Changes:**
- [ ] Load archetypes from DB (not hardcoded)
- [ ] Multi-trigger processing per message
- [ ] V/A accumulation before mood projection
- [ ] Support v1 (legacy) and v2 (message_triggers) formats
- [ ] Replay mode (sequential/random)

**Acceptance:**
- [ ] V2 archetypes replay real trigger sets
- [ ] V1 archetypes still work (backward compat)
- [ ] Math matches live chat flow

### Phase 4: Frontend — Archetypes Tab (Est: 4-5 hours)

**Files:**
- [ ] `frontend/src/components/designer/ArchetypesTab.tsx` — NEW
- [ ] `frontend/src/components/designer/ArchetypeCreateModal.tsx` — NEW
- [ ] `frontend/src/components/designer/ArchetypeDetailModal.tsx` — NEW
- [ ] `frontend/src/components/designer/DesignerTabsV2.tsx` — Add tab
- [ ] `frontend/src/utils/designerApiV2.ts` — Add API methods
- [ ] `frontend/src/types/designer.ts` — Add types

**Acceptance:**
- [ ] Archetypes tab shows list
- [ ] Can create archetype via file upload
- [ ] Can edit/delete user-created archetypes
- [ ] Detail view shows trigger distribution

### Phase 5: Update Drift Simulator Tab (Est: 1-2 hours)

**Files:**
- [ ] `frontend/src/components/designer/DriftSimulatorTab.tsx`

**Changes:**
- [ ] Fetch archetypes from API (not hardcoded)
- [ ] Show v1/v2 badge
- [ ] Add replay mode selector for v2

**Acceptance:**
- [ ] Dropdown shows DB archetypes
- [ ] New archetypes appear after creation
- [ ] Replay mode works

---

## 9. Testing

### Backend Tests

**File:** `backend/tests/test_archetypes.py`

| Test | Description |
|------|-------------|
| `test_create_archetype` | Create user archetype |
| `test_generate_from_file` | Upload .txt, verify classification |
| `test_delete_user_archetype` | Delete allowed |
| `test_delete_system_archetype` | Delete blocked (403) |
| `test_list_archetypes` | Returns system + user |

**File:** `backend/tests/test_drift_simulator_v2.py`

| Test | Description |
|------|-------------|
| `test_v2_multi_trigger` | Multiple triggers applied per message |
| `test_va_accumulation` | V/A deltas accumulate correctly |
| `test_v1_backward_compat` | Legacy archetypes still work |
| `test_replay_sequential` | Sequential mode cycles correctly |
| `test_replay_random` | Random mode samples from pool |

### Frontend Tests

| Test | Description |
|------|-------------|
| `ArchetypesTab.test.tsx` | List renders, CRUD actions work |
| `ArchetypeCreateModal.test.tsx` | File upload flow |

---

## 10. File Changes Summary

### New Files
- `backend/db/repositories/archetype_repository.py`
- `backend/tests/test_archetypes.py`
- `backend/tests/test_drift_simulator_v2.py`
- `frontend/src/components/designer/ArchetypesTab.tsx`
- `frontend/src/components/designer/ArchetypeCreateModal.tsx`
- `frontend/src/components/designer/ArchetypeDetailModal.tsx`

### Modified Files
- `backend/db/connection.py` — Add table + seed
- `backend/db/repositories/__init__.py` — Export
- `backend/routers/designer_v2.py` — Add endpoints
- `backend/schemas/requests.py` — Add models
- `backend/schemas/responses.py` — Add models
- `backend/services/drift_simulator.py` — Major refactor
- `frontend/src/components/designer/DesignerTabsV2.tsx` — Add tab
- `frontend/src/components/designer/DriftSimulatorTab.tsx` — Use API
- `frontend/src/utils/designerApiV2.ts` — Add methods
- `frontend/src/types/designer.ts` — Add types

---

## 11. Definition of Done

1. [ ] Archetypes stored in database with CRUD API
2. [ ] Users can upload .txt and generate archetype via Designer UI
3. [ ] System archetypes seeded and protected from deletion
4. [ ] Drift simulator applies multiple triggers per message (like live chat)
5. [ ] V/A deltas accumulate correctly before mood projection
6. [ ] V1 (legacy) archetypes still work
7. [ ] Designer UI shows archetypes tab with full CRUD
8. [ ] Drift simulator dropdown fetches from API
9. [ ] Tests cover API, simulator refactor, and backward compat

---

## 12. Future Extensions (Out of Scope)

- **Outcome derivation:** Auto-derive outcome_weights from sentiment analysis
- **Archetype sharing:** Export/import archetype JSON
- **Phased archetypes v2:** Upload multiple files for multi-phase archetypes
- **Live capture:** Record production conversations as archetype source
- **A/B comparison:** Compare persona behavior across archetype versions
