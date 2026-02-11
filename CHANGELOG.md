# Changelog

All notable changes to Emilia Web App will be documented in this file.

---

## [5.6.3] - 2026-02-11

### Added - Group Rooms (V1)

- **Backend room model + APIs** - Added `rooms`, `room_participants`, `room_agents`, `room_messages` with new `/api/rooms/*` router.
- **Multi-agent room chat** - Added mention-based routing (`mention_agents`, `@name`, `response_mode`) with sender attribution in persisted history.
- **Room SSE streaming** - Added per-agent stream events (`agent_start`, content chunks, `agent_done`, `agent_error`) for group chat responses.
- **Frontend room flows** - Added room list/create and room chat routes:
  - `/user/$userId/rooms`
  - `/user/$userId/rooms/$roomId`
- **Client room state/hooks** - Added `roomStore` + `useRoomChat` + room API client methods.
- **Tests** - Added backend room API tests (`backend/tests/test_rooms.py`) covering CRUD, access control, agent management, and routing/attribution.
- **Docs sync** - Updated `README.md`, `DOCUMENTATION.md`, `frontend/README.md`, and `docs/planning/P005-group-chat.md` to reflect shipped behavior and deferred items.

### Notes

- Backend health endpoint version string remains `5.5.3` in `backend/main.py`; changelog entries track delivered features.

---

## [5.6.2] - 2026-02-10

### Added - Drift + Mood Injection Tuning

- **Drift Simulator expansion** - Added natural, phased archetypes with weekly cycling behavior (`rough_day_then_recover`, `lonely_then_playful`, `moody_week`)
- **Drift mood analytics fix** - Mood distribution now uses weighted mood mix instead of only dominant mood labels
- **Injection-focused Drift charts** - Added primary/secondary injected mood count pies and LLM context mood preview
- **Global dynamics controls** - New Designer V2 `Dynamics` tab to tune and persist mood injection knobs in DB
- **Backend settings persistence** - Added `app_settings` table and mood injection settings API endpoints
- **Volatility-driven mood selection** - LLM mood injection now allows controlled variation among close top moods based on volatility and global knobs
- **Preset handling for profiles** - Backend now resolves trigger response presets to numeric deltas; explicit axis values override preset-derived values

#### Files Added
- `backend/db/repositories/app_settings.py`
- `backend/services/drift_simulator.py`
- `frontend/src/components/designer/DriftSimulatorTab.tsx`
- `frontend/src/components/designer/GlobalDynamicsTab.tsx`
- `backend/scripts/agent_profiles/profile_template.json`
- `backend/scripts/agent_profiles/playful_companion_profile.json`
- `backend/tests/test_mood_injection_dynamics.py`
- `backend/tests/test_drift_mood_distribution.py`
- `backend/tests/test_drift_simulator_phases.py`
- `backend/tests/test_trigger_presets.py`

#### Files Modified
- `backend/services/emotion_engine.py`
- `backend/routers/designer_v2.py`
- `backend/db/connection.py`
- `backend/db/repositories/__init__.py`
- `backend/scripts/agent_profiles/README.md`
- `backend/scripts/agent_profiles/rem_rezero_profile.json`
- `frontend/src/components/designer/DesignerPageV2.tsx`
- `frontend/src/components/designer/DesignerTabsV2.tsx`
- `frontend/src/types/designer.ts`
- `frontend/src/utils/designerApiV2.ts`

#### Validation
- Targeted backend tests passing (`mood injection`, `drift distribution`, `phase cycling`, `trigger preset`)
- Targeted frontend lint passing for updated designer components

---

## [5.6.1] - 2026-02-05

### Fixed - Streaming Chat + First Reply Lip Sync

- **Streaming tag cleanup** - Bracketed `[MOOD:...]`/`[ANIM:...]` (and angle) tags are stripped during streaming, not just on final response
- **First message lip sync** - TTS now waits briefly for the avatar renderer before starting lip sync on the initial greeting

#### Files Modified
- `frontend/src/utils/api.ts` - Streaming-safe avatar tag stripping
- `frontend/src/hooks/useChat.ts` - Streaming cleanup + lip sync wait for renderer
- `frontend/src/utils/api.test.ts` - Added tag/streaming tests

#### Test Results
- **Frontend tests**: 88/88 passing ✅

## [5.6.0] - 2026-02-04

### Fixed - VRM Lip Sync 👄

#### Backend: ElevenLabs TTS Rewrite
- **Switched from WebSocket to REST API** - Uses `/v1/text-to-speech/{voice_id}/with-timestamps` endpoint
- **Reliable alignment data** - Character-level timing now returned consistently
- **Simplified code** - Removed async WebSocket complexity, uses httpx client
- **Debug logging** - Logs response structure to stderr for troubleshooting

#### Frontend: LipSyncEngine Rewrite
- **VRM standard expressions** - Now uses `aa, ih, ou, ee, oh` instead of Oculus `viseme_*`
- **Character-to-mouth mapping** - Vowels and consonants map to appropriate VRM mouth shapes
- **Auto-detection** - Detects available mouth shapes on VRM model load
- **Fallback support** - Works with both lowercase (`aa`) and uppercase (`A`) expression names
- **Consolidated scaling** - Timestamp scaling moved into `LipSyncEngine.setAlignment(alignment, audioDurationMs)`
- **Tunable parameters** - `LipSyncConfig` with `maxWeight`, `blendSpeed`, `minHoldMs`
- **State reset fix** - `startSync()` now resets state to avoid delayed animation start

#### Debug Panel Enhancements
- **Timestamp scaling toggle** - Enable/disable scaling to actual audio duration
- **Live tuning sliders** - Adjust maxWeight, blendSpeed, minHoldMs in real-time
- **Expression logging** - Console shows all available VRM expressions and shape transitions

#### Files Modified
- `backend/services/elevenlabs.py` - Complete rewrite: WebSocket → REST with-timestamps API
- `backend/routers/chat.py` - Cleaned up speak endpoint
- `frontend/src/avatar/LipSyncEngine.ts` - Rewritten with tunable config and proper state reset
- `frontend/src/components/AvatarDebugPanel.tsx` - Added tuning controls
- `frontend/src/hooks/useChat.ts` - Uses consolidated scaling API

---

## [5.5.5] - 2026-02-04

### Fixed - Session State Management 🔧

#### Bug Fixes
- **Chat history cross-contamination** - Switching between agents no longer shows wrong agent's history
- **Blank history on refresh** - History now loads correctly after page refresh
- **Stale closure in fetchHistory** - Added `currentAgent?.id` to dependency array
- **Race condition on init** - Added guard to wait for agent hydration before fetching history
- **History overwrite on new chat** - fetchHistory no longer overwrites messages from InitializingPage
- **Messages cleared prematurely** - App.tsx only clears messages when sessionId actually changes

#### Infrastructure
- **Docker volume mount** - Added `~/.openclaw/agents` mount for backend to read session JSONL files

#### Files Modified
- `docker-compose.yml` - Added OpenClaw agents directory volume mount
- `frontend/src/App.tsx` - Conditional message clearing on session change
- `frontend/src/components/InitializingPage.tsx` - Small delay before navigation to ensure store sync
- `frontend/src/hooks/useSession.ts` - Fixed deps, agent validation, skip-overwrite logic

#### Test Results
- **Frontend tests**: 83/83 passing ✅
- **Backend tests**: 40/40 passing ✅

---

## [5.5.4] - 2026-02-04

### Added - Hands‑Free Voice in Main Chat 🎙️

#### Voice Input Pipeline
- **Hands‑Free Mode** - VAD + backend STT now runs in the main chat flow (no Web Speech API)
- **Auto Pause/Resume** - Mic pauses during `thinking`/`speaking` and resumes on `ready`
- **Debug Timeline** - Shared voice debug timeline with timestamps and STT/VAD events
- **Push‑To‑Talk Removed** - Hands‑free is the only supported input mode

#### User Preferences
- **User Settings Modal** - Hands‑free + TTS toggles persisted to user preferences
- **Preferences API** - PATCH `/api/users/{user_id}/preferences` merges JSON preferences
- **Route Separation** - Agent settings live at `/manage`; user settings are in‑app only

#### Testing + DX
- **Test DB Isolation** - `EMILIA_SEED_DATA=0` disables seeding and `/tmp` DB is used in tests
- **Async Test Client** - Backend API tests use `httpx.AsyncClient` to avoid Python 3.14 TestClient hang
- **Manual Transcribe Test** - Requests dependency is optional (skipped if missing)

#### Files Modified
- `frontend/src/services/VoiceService.ts` - Backend STT WAV upload + state handling
- `frontend/src/services/VoiceActivityDetector.ts` - Bundle VAD initialization
- `frontend/src/hooks/useVoiceChat.ts` - Voice control wrapper
- `frontend/src/App.tsx` - Hands‑free wiring, pause/resume, debug events
- `frontend/src/components/VoiceDebugTimeline.tsx` - Reusable debug list
- `frontend/src/components/DebugPanel.tsx` - View‑only voice debug timeline
- `frontend/src/components/UserSettingsModal.tsx` - New modal (hands‑free + TTS)
- `frontend/src/store/index.ts` - Hands‑free state
- `frontend/src/utils/api.ts` - Preferences update API
- `backend/routers/users.py` - Preferences patch endpoint
- `backend/db/repositories/users.py` - Preferences update
- `backend/db/connection.py` - Seeding guard via env var
- `backend/tests/test_api.py` - Async client + updated tests
- `backend/tests/conftest.py` - Test DB + seeding disabled
- `backend/tests/test_transcribe_manual.py` - Optional requests import

#### Test Results
- **Frontend tests**: 83/83 passing ✅
- **Backend tests**: 40/40 passing, 1 skipped ✅

## [5.5.3] - 2026-02-03

### Fixed - Frontend Robustness 🛡️

#### Streaming + Session Stability
- **Chat Abort Now Works** - Streaming requests honor `AbortController` and aborts no longer surface as errors
- **Session Validation Race** - Direct session lookup prevents false redirects when agent state is not yet loaded
- **History Fetch Guard** - Prevents stale history from overwriting the current session after rapid switches

#### Audio + Routing Reliability
- **Audio Cleanup** - TTS and replay audio now stop on unmount and revoke object URLs to prevent leaks
- **Settings Navigation** - Agent settings route is `/manage` (avoids ad blocker issues with `/admin`)
- **STT Auth Consistency** - Transcription calls now reuse shared auth headers and context IDs

#### Avatar Asset Management
- **VRM Assets Organized** - Moved VRM files under `/public/vrm` and updated default paths
- **Debug Model List** - Loads available VRM models from `vrm-manifest.json` with safe fallbacks

#### Backend Hardening
- **Access Control** - Session detail, agent, and memory endpoints now enforce user access
- **DB Safety** - Foreign keys enabled and connections rollback on errors; DB path configurable
- **TTS Alignment** - ElevenLabs alignment normalized to frontend lip‑sync format
- **Chat Metrics** - Session `last_used` and `message_count` update only after successful responses
- **Tag Parsing** - Avatar mood intensity parsing is tolerant and clamped to [0, 1]

#### Testing
- **Test Runner Script** - `backend/scripts/run-tests.sh` runs pytest with safe defaults and docker fallback

#### Files Modified
- `frontend/src/utils/api.ts` - Streaming now supports abort signals
- `frontend/src/hooks/useChat.ts` - Abort handling + audio cleanup
- `frontend/src/hooks/useSession.ts` - History fetch race guard
- `frontend/src/hooks/useAudio.ts` - STT uses shared auth headers
- `frontend/src/hooks/useTTS.ts` - Audio cleanup on stop/unmount
- `frontend/src/components/MessageBubble.tsx` - Replay audio cleanup on unmount
- `frontend/src/components/UserSelection.tsx` - Settings navigation path
- `frontend/src/components/DebugPanel.tsx` - Removed redundant session hook usage
- `frontend/src/components/NewChatPage.tsx` - Single `useSession` instance
- `frontend/src/avatar/AvatarRenderer.ts` - Default VRM path update
- `frontend/src/components/AvatarPanel.tsx` - VRM base path update
- `frontend/src/components/InitializingPage.tsx` - VRM preload path update
- `frontend/src/components/AvatarDebugPanel.tsx` - Manifest-driven VRM selection
- `frontend/public/vrm/` - VRM assets + manifest
- `backend/routers/sessions.py` - Session detail access control
- `backend/routers/agents.py` - Agent access control
- `backend/routers/memory.py` - Memory access control + path safety
- `backend/routers/chat.py` - TTS alignment format + session metric timing
- `backend/parse_chat.py` - Safer mood intensity parsing
- `backend/db/connection.py` - Foreign keys + rollback + DB path config
- `backend/main.py` - Health version update
- `backend/scripts/run-tests.sh` - Backend test runner
- `frontend/public/vrm/voice-ids.json` - Expanded voice list

#### Test Results
- **Frontend tests**: 83/83 passing ✅
- **Lint**: Clean ✅
- **Backend tests (py3.11 container)**: 39/39 passing ✅

---

## [5.5.2] - 2026-02-02

### Fixed - Transcription Error Handling 🐛

#### Backend Transcribe Endpoint
- **Fixed 500 Internal Server Errors** - Resolved unhandled exceptions in `/api/transcribe` endpoint
  - Added graceful handling for missing `content_type` (defaults to `audio/webm`)
  - Added graceful handling for missing `filename` (defaults to `recording.webm`)
  - Added comprehensive exception handler for unexpected errors
  - Previously, any uncaught exception would return 500 without detail

#### Test Coverage
- **Added 7 Transcribe Tests** - Comprehensive test suite for transcription endpoint
  - `test_transcribe_requires_auth` - Validates authorization requirement
  - `test_transcribe_requires_file` - Validates file upload requirement
  - `test_transcribe_success` - Tests successful transcription flow
  - `test_transcribe_with_missing_content_type` - Tests None content type handling
  - `test_transcribe_stt_service_error` - Tests STT service 500 error handling
  - `test_transcribe_timeout` - Tests timeout exception handling (504)
  - `test_transcribe_connection_error` - Tests connection failure handling (503)
- **Test Results**: 39/39 passing ✅ (was 33/33, added 7 new tests)

#### Files Modified
- [backend/routers/chat.py](backend/routers/chat.py#L210-L235) - Enhanced error handling in `/api/transcribe`
- [backend/tests/test_api.py](backend/tests/test_api.py#L235-L380) - Added `TestTranscribeEndpoint` class

### Impact
- Microphone recording now works reliably without 500 errors
- Better error messages for debugging transcription issues
- Full test coverage for all transcribe endpoint error paths

---

## [5.5.1] - 2026-02-02

### Fixed - Session History 500 Errors 🐛

#### Backend Response Validation Issues
- **Missing `count` Field** - Fixed 500 errors in `/api/sessions/{id}/history` endpoint
  - Added required `count: 0` to 5 return statements that were missing it
  - Pydantic validation was failing silently, causing 500 responses
  - Affected paths: no access, session not found, missing files, exceptions
- **Timestamp Type Mismatch** - Changed `MessageHistoryItem.timestamp` from `float` to `string`
  - JSONL files contain ISO 8601 timestamps (`2026-02-02T20:58:37.996Z`)
  - Schema expected Unix timestamp (float)
  - Frontend already expects strings, so no frontend changes needed
- **Files Modified**:
  - `backend/routers/sessions.py` - Added count to all response returns
  - `backend/schemas/responses.py` - Changed timestamp type to Optional[str]

#### Backend Test Suite Modernization
- **Updated 18 API Tests** - Refactored to match new modular architecture (v5.5.0)
  - Removed outdated tests for old monolithic structure
  - Updated health endpoint (now returns `{status, version}`)
  - Fixed chat tests to use new headers (`X-User-Id`, `X-Agent-Id`)
  - Added session endpoint tests (new router)
  - Added user endpoint tests (new router)
  - Added admin endpoint tests (new router)
  - Simplified speak endpoint tests (removed obsolete mocking)
- **Test Results**: 33/33 passing ✅ (was 14 failed, 5 errors)
- **Files Modified**:
  - `backend/tests/test_api.py` - Complete rewrite for new architecture
  - `backend/tests/conftest.py` - Simplified fixtures

### Impact
- Session history now loads correctly without 500 errors
- All backend tests passing and aligned with current codebase structure
- Improved test maintainability for future development

---

## [5.5.0] - 2026-02-02

### Changed - Backend Architecture Refactoring 🏗️

#### Complete Modular Restructuring
- **Router-Based Architecture** - Split monolithic `main.py` (763 lines) into modular routers
  - Reduced `main.py` to 54 lines (-93%) - now only app setup and health endpoint
  - Created `routers/` directory with 6 specialized modules (765 lines total):
    - `users.py` (63 lines) - User management endpoints (4 routes)
    - `agents.py` (20 lines) - Agent details endpoint (1 route)
    - `sessions.py` (184 lines) - Session CRUD + history (6 routes)
    - `chat.py` (318 lines) - Chat, transcribe, speak endpoints (3 routes)
    - `memory.py` (105 lines) - Memory file access (3 routes)
    - `admin.py` (59 lines) - Admin/manage operations (5 routes)

#### New Backend Modules Created
- **Configuration Layer**:
  - `config.py` (48 lines) - Centralized settings and environment variables
  - `dependencies.py` (104 lines) - Reusable FastAPI dependencies for auth and headers
- **Request/Response Models**:
  - `schemas/requests.py` (82 lines) - Pydantic request models with validation
  - `schemas/responses.py` (138 lines) - Response models for 100% OpenAPI coverage
- **Service Layer** - External API clients isolated:
  - `services/clawdbot.py` (118 lines) - LLM API client
  - `services/elevenlabs.py` (109 lines) - TTS WebSocket client
  - `services/stt.py` (47 lines) - Speech-to-text client
- **Repository Pattern** - Database operations abstracted:
  - `db/repositories/users.py` (66 lines) - User CRUD operations
  - `db/repositories/agents.py` (76 lines) - Agent CRUD operations
  - `db/repositories/sessions.py` (190 lines) - Session CRUD with access control
  - `db/connection.py` (99 lines) - Database management and schema
  - `db/seed.py` (44 lines) - Test data seeding
- **Exception Handling**:
  - `core/exceptions.py` (88 lines) - Custom exceptions and HTTP error factories
- **Backward Compatibility**:
  - `database.py` (173 lines) - Compatibility wrapper for existing code

#### Docker Updates
- **Updated Dockerfile** - Now copies complete modular structure:
  - All new Python modules (config, dependencies, schemas, core, services, db, routers)
  - Fixes `ModuleNotFoundError` in Docker builds

### Benefits
- **Clear Separation of Concerns** - Each module has single responsibility
- **Improved Maintainability** - Easy to locate and modify specific endpoints
- **Scalable Architecture** - Simple to add new routers or services
- **Better Code Organization** - Professional FastAPI project structure
- **Type Safety Preserved** - All Pydantic models and type hints intact

### Technical Details
- All 27 API routes maintained and functional
- Test suite: 15/15 passing ✅
- Zero breaking changes to API contracts
- Complete backward compatibility maintained

---

## [5.4.0] - 2026-02-02

### Fixed - Session Management & State Persistence 🔧

#### Session ID Storage Issues
- **Removed localStorage Persistence** - `sessionId` no longer stored in localStorage
  - Prevents stale sessions when switching users/agents
  - Session now kept only in memory (ephemeral)
  - Automatically cleared when user or agent changes
- **Added `clearSessionId()` Method** - New store action for explicit session clearing
- **Auto-Clear on User/Agent Change** - `userStore` now automatically clears sessionId on:
  - User switch
  - Agent switch
  - Logout

#### New Chat Page Bug Fix
- **Fixed 403 Forbidden Errors** - Resolved errors when navigating to `/chat/new` with stale sessions
- **Backend Graceful Handling** - Session history endpoint now returns empty array for inaccessible sessions (instead of 403)
- **Frontend Error Handling** - `getSessionHistory` handles 403/404 gracefully without throwing
- **Session Cleanup** - NewChatPage clears sessionId on mount and removes old localStorage entries

### Added - Frontend Code Quality & Testing 🧹

#### Comprehensive Unit Tests
- **83 Tests Across 5 Suites** - Complete test coverage for critical code
  - `helpers.test.ts` (34 tests) - Utility functions
  - `chatStore.test.ts` (16 tests) - Chat state management
  - `statsStore.test.ts` (14 tests) - Statistics tracking
  - `api.test.ts` (9 tests) - API utilities
  - `chat.test.ts` (10 tests) - Input validation
- **Testing Framework** - Vitest + React Testing Library + jsdom
- **Test Scripts** - Added to package.json:
  - `npm test` - Run all tests once
  - `npm run test:watch` - Watch mode
  - `npm run test:ui` - Visual test runner
  - `npm run test:coverage` - Coverage reports
- **Documentation** - Created comprehensive `TESTING.md` guide

#### Code Cleanup & Refactoring
- **Removed Dead Code**:
  - Deleted unused hooks: `useSessionsQuery.ts`, `useMemoryQuery.ts`
  - Cleaned up duplicate exports in `hooks/index.ts`
- **Fixed Type Duplications**:
  - `AdminPanel` now imports `Agent` type from `api.ts` (no duplication)
  - Created `AgentWithWorkspace` interface for admin-specific extensions
- **New Utility Module** - Created `utils/helpers.ts` with reusable functions:
  - `formatDate()` - Smart relative date formatting
  - `formatSessionName()` - Consistent session name display
  - `truncate()` - String truncation with ellipsis
  - `safeJsonParse()` - Safe JSON parsing with fallbacks
  - `debounce()` - Function debouncing
  - `formatBytes()` - Human-readable byte formatting
  - `formatNumber()` - Number formatting with commas
  - `isDefined()` - Type-safe null/undefined checks
- **Improved Modularity**:
  - Consistent import ordering across all components
  - Extracted duplicated logic into reusable utilities
  - All stores properly typed with no errors

### Technical Details
- All frontend changes verified with zero TypeScript compilation errors
- Test suite runs in ~1.5s with 100% pass rate
- Frontend codebase now follows consistent patterns and best practices

---

## [5.3.0] - 2026-02-02

### Changed - Multi-Agent Memory System 🗂️

#### Database-Driven Agent Configuration
- **Removed JSON Configuration** - Deleted `avatars.json` and `backend/avatars.py` module
- **SQLite as Single Source of Truth** - All agent data now stored in database
- **Added `workspace` Field** - Each agent has its own workspace path in database
  - `emilia-thai` → `/home/tbach/clawd-emilia-thai`
  - `emilia-emily` → `/home/tbach/clawd-emilia-emily`
  - `rem` → `/home/tbach/clawd-rem`

#### Memory Endpoints Refactored
- **Agent-Specific Memory Access** - Memory files now served per agent from their workspace
- **Query Parameter Required** - All memory endpoints now require `?agent_id={agent_id}`
  - `GET /api/memory?agent_id={agent_id}` - Get agent's MEMORY.md
  - `GET /api/memory/list?agent_id={agent_id}` - List agent's memory files
  - `GET /api/memory/{filename}?agent_id={agent_id}` - Get specific memory file
- **Removed Hardcoded Workspace** - No longer uses `EMILIA_WORKSPACE` environment variable

#### Frontend Updates
- **API Calls Updated** - All memory functions now pass `agent_id` from current agent
- **Agent Validation** - Memory functions validate agent is selected before making requests

#### Docker Configuration
- **Multiple Workspace Mounts** - docker-compose.yml now mounts all three agent workspaces
- **Removed Legacy Config** - Removed obsolete `EMILIA_WORKSPACE` environment variable

#### Database Schema
- Added `workspace TEXT` column to `agents` table
- Added `get_agents()` function to retrieve all agents
- Added `update_agent()` function with field validation for `workspace`, `display_name`, `voice_id`, `vrm_model`, `clawdbot_agent_id`
- Updated `create_agent()` to accept `workspace` parameter

#### Documentation
- Updated API.md with correct memory endpoint signatures and examples
- Added response examples showing workspace paths and file listings

---

## [5.2.0] - 2026-02-02

### Fixed - New Chat Flow & Session Routing 🔧

#### Multi-Page Chat Initialization
- **Separate Pages for Each State** - Eliminated race conditions with dedicated routes:
  - `/user/:userId/chat/new` - New chat page with "Chat with Agent" button
  - `/user/:userId/chat/initializing/:sessionId` - Loading screen during session setup
  - `/user/:userId/chat/:sessionId` - Main chat view for existing sessions

#### InitializingPage Fixes
- **Single Execution Guarantee** - Added `hasStartedRef` to prevent duplicate initialization runs
- **Direct Session Lookup** - Uses `getSession(sessionId)` instead of fetching all sessions (more efficient)
- **Removed Dependency Array Issue** - No longer re-runs when sessions list updates
- **Console Logging** - Added debug logs for troubleshooting flow

#### App.tsx Session Validation
- **Fresh API Validation** - Always fetches fresh session data before redirecting
- **One-Time Validation** - Uses `hasValidatedRef` to validate once per sessionId
- **No More Redirect Loops** - Fixed loop where new sessions would bounce between routes

#### Routing Improvements
- **AgentSelection** - Routes to `/chat/new` when user has no existing sessions
- **Drawer** - Redirects to `/chat/new` after deleting current session
- **Store** - Allows empty `sessionId` for new session states

### Technical
- New route files: `chat.new.tsx`, `chat.initializing.$sessionId.tsx`
- New components: `NewChatPage.tsx`, `InitializingPage.tsx`
- Updated `routeTree.gen.ts` with new route definitions
- `AppProvider` wrapper on InitializingRoute for `useChat` hook access

---

## [5.1.0] - 2026-02-01

### Added - Frontend Polish & Routing 🎨

#### Routing (TanStack Router)
- **Nested Routes** - `/user/:userId/chat/:sessionId` structure
- **Deep Linking** - Direct links to specific sessions
- **State Isolation** - Clean state on route changes, no bleed between users

#### UI Redesign
- **User Select Page**
  - Avatar-as-button design (no visible button frame)
  - Name as footer text below avatar
  - Badge showing agent count per user
  - Cog icon → Admin panel

- **Agent Select Page**
  - Same avatar-centric pattern
  - Back button to user select

#### Admin Panel (`/admin`)
- List all agents from `avatars.json`
- Edit `voice_id` per agent
- Backend: `GET /api/admin/agents`, `PUT /api/admin/agents/:id`

#### Memory Viewer
- Dropdown selector for memory files
- `MEMORY.md` listed first
- Daily files (`memory/YYYY-MM-DD.md`) sorted newest-first
- View only (no edit/delete)
- Backend: `GET /api/memory/list`, `GET /api/memory/:filename`

#### Debug HUD Improvements
- Scrollable state log (fixed max-height)
- Per-stage latency display (P50/P95)
- Error display section
- `stageLatencies` in statsStore

#### Error Handling (Partial)
- Error store wired up
- DebugPanel displays errors
- Hooks for STT/TTS/WS failures pending

### Technical
- New routes in `routeTree.gen.ts`
- `AdminPanel.tsx` component
- `MemoryModal.tsx` with dropdown
- Updated `DebugPanel.tsx` with scrollable log

---

## [5.0.0] - 2026-02-01

### Added - React Frontend + SQLite Backend 🚀

#### Frontend (React + Vite + TanStack Router)
- **User Selection** - Multi-user support with agent counts
- **Agent Selection** - Pick companion per user
- **Session Management** - Create, switch, rename, delete sessions
- **Chat Interface** - Streaming responses with avatar integration
- **"Start Chat" Flow** - For new users with no sessions, shows "Bringing Emilia to life..." button
- **Drawer** - Session list with 3-dot menu for rename/delete
- **VRM Avatar** - Three.js + @pixiv/three-vrm integration

#### Backend (FastAPI + SQLite)
- **Database Schema** - `users`, `agents`, `user_agents`, `sessions`, `session_participants`
- **Session CRUD** - Create, read, update (rename), delete
- **Admin Endpoints** - `/api/admin/sessions`, bulk delete by agent
- **Auth Headers** - `X-User-Id`, `X-Agent-Id`, `X-Session-Id`
- **Clawdbot Integration** - Reads history from JSONL, proxies chat to gateway

#### Data
- `avatars.json` - Avatar configs (agent_id, voice_id, vrm_model)
- `emilia.db` - SQLite for users/sessions (in `/data/`)

### Technical
- Frontend: `frontend/src/` (React 19, Zustand, React Query)
- Backend: `backend/main.py`, `database.py` (FastAPI, SQLite)
- Docker: `docker-compose.yml` with backend + nginx frontend
- API docs: `docs/API.md` fully updated

---

## [4.1.0] - 2026-01-31

### Added - Avatar Animation System 🎭
- **Lip Sync** - Real-time viseme animation from ElevenLabs character timestamps
  - WebSocket TTS with `with_timestamps: character` for per-character alignment
  - Viseme mapping from phonemes (aa, ih, ou, ee, oh, ff, th, etc.)
  - Smooth interpolation and decay for natural mouth movement

- **Expression System** - Dynamic facial expressions from mood tags
  - SSE event parsing for `[mood:happy]`, `[mood:thinking]`, etc.
  - Expression controller with blend support and priorities
  - Expressions: happy, sad, surprised, angry, thinking, neutral

- **Idle Animations** - Continuous micro-movements for lifelike avatar
  - Blink: Randomized 2-6 second intervals with natural timing
  - Breathe: Subtle spine rotation on sine wave
  - Sway: Micro head movements for organic feel

- **Triggered Animations** - On-demand gestures and poses
  - Nod: Affirmative head gesture
  - Wave: Friendly greeting animation
  - Thinking pose: Head tilt with hand gesture
  - Easing curves and blend support

### Technical
- `frontend/js/lip-sync.js` - LipSyncEngine with viseme queue and timing
- `frontend/js/avatar-controller.js` - AvatarExpressionController for moods
- `frontend/js/idle-animations.js` - IdleAnimationSystem with pause/resume
- `frontend/js/animation-trigger.js` - AnimationTriggerSystem for gestures
- Updated `frontend/avatar.js` to integrate all animation modules
- Backend returns `alignment` data in `/api/speak` JSON response
- Global window functions: `triggerAnimation()`, `setAvatarExpression()`

---

## [3.5.0] - 2026-01-31

### Added
- **VRM Avatar Panel** - Collapsible avatar display integrated into main dashboard
- **Rose Model** - Default VRM from 100Avatars (Arweave hosted)
- **Avatar State Persistence** - Collapse state saved to localStorage
- **Load Status Indicator** - Shows "Loading...", "Rose ✓", or "Error" in panel header

### Technical
- Import map for three.js + @pixiv/three-vrm CDN modules
- Avatar panel above chat filters, collapsible with chevron toggle
- Custom events `avatarLoaded` / `avatarError` dispatched by avatar.js
- CSS for `.avatar-panel`, `.avatar-panel.collapsed` transitions
- Mobile responsive: smaller height, hidden in landscape

### VRM Details
- Model: Rose (Avatar 057) from 100Avatars R1 collection
- URL: `https://arweave.net/Ea1KXujzJatQgCFSMzGOzp_UtHqB1pyia--U3AtkMAY`
- License: CC0 (no attribution required)
- Features: Idle blink animation, lip sync API stub

---

## [3.4.0] - 2026-01-31

### Added
- **SSE Streaming** - Chat responses now stream in real-time via Server-Sent Events
- **Stop Button** - Interrupt generation or TTS playback mid-stream
- **Replay Button** - Play icon on assistant messages to re-hear TTS
- **Voice Ring Animation** - Visual ring pulses outward while Emilia speaks
- **Auto-focus Input** - Text input focused on page load for immediate typing

### Technical
- `GET /api/chat?stream=1` returns SSE with `{content: "..."}` chunks
- `AbortController` integration for cancellable fetch requests
- `currentAudio` tracking for stop functionality
- CSS `@keyframes voice-ring-pulse` with staggered multi-ring effect
- `textInput.focus()` in init for auto-focus

---

## [3.3.0] - 2026-01-31

### Added
- **TTS toggle** - Voice checkbox in header (default OFF), persisted to localStorage
- **Session switcher** - Dropdown to switch between Emilia sessions
- **Session list API** - `GET /api/sessions/list` calls gateway tools/invoke
- **Sessions hint** - UI warning when gateway blocks session listing
- **Parse tests** - pytest suite for `parse_chat.py`

### Changed
- **Memory viewer read-only** - Removed contentEditable, no more save-on-blur (security)
- **Parsing** - Handles `message.content` as string OR array of content parts
- **Meta filter** - Now actually hides `.message-meta` when unchecked

### Fixed
- TTS no longer fires when toggle is OFF
- Reasoning/thinking extraction from array-style content parts

### Technical
- Added `backend/parse_chat.py` module
- Added `backend/tests/test_parse_chat.py` (2 tests)
- Use venv for Python dev: `python3 -m venv backend/.venv`

---

## [3.2.0] - 2026-01-30

### Added - Dashboard Mode (Full Agent Debug View)
- **Memory viewer panel** - Left sidebar with MEMORY.md + daily logs tabs
- **Editable memory** - Click to edit memory files, auto-save on blur
- **Live memory updates** - Auto-refresh every 5s to see Emilia's changes
- **Memory write API** - POST /api/memory and POST /api/memory/{filename}
- **Chat filters** - Toggle reasoning, thinking, tokens, metadata display
- **Reasoning display** - LLM reasoning shown in chat (when present)
- **Thinking display** - Extended thinking shown in chat (when present)
- **Token usage** - Per-message token stats (prompt + completion + total)
- **Stats panel** - Right sidebar with message count, total tokens, avg latency, model
- **State log** - Real-time state transition log with timestamps
- **Enhanced metadata** - Chat responses include model, finish_reason, usage, reasoning, thinking

### Changed
- **Backend version** - Updated to 3.2.0
- **Frontend layout** - 3-panel dashboard (memory + chat + stats)
- **Chat response** - Now includes full metadata (model, tokens, reasoning)
- **Docker volume** - Emilia workspace mounted read-write (was read-only)
- **Memory endpoints** - Now support both read (GET) and write (POST)

### Technical
- Added `MemoryUpdateRequest` Pydantic model
- Added POST /api/memory for MEMORY.md updates
- Added POST /api/memory/{filename} for daily file updates
- Enhanced chat response with reasoning/thinking extraction
- Dashboard JavaScript extensions (~300 LOC)
- Memory auto-refresh with 5s polling
- Editable pre tags with contentEditable
- Stats tracking (messages, tokens, latency)
- State logging with timestamps
- Enhanced `addMessage()` with reasoning/thinking/tokens
- Filter toggles for chat display options

---

## [3.1.0] - 2026-01-30

### Added - UI Redesign + Text Input
- **Text input box** - Type messages instead of voice-only PTT
- **Send button** - Click or press Enter to send text
- **Avatar display area** - Placeholder for VRM/Live2D avatar (left panel)
- **Redesigned layout** - Avatar (left) + Chat (right) + Input (bottom)
- **Compact PTT button** - Smaller voice button next to text input
- **Text/voice flexibility** - Choose between typing or speaking

### Changed
- **Layout architecture** - New flexbox layout with avatar container
- **PTT button** - Now compact 50px button in input controls
- **Chat panel** - More prominent, takes full right side
- **Input controls** - Bottom bar with text box + send + PTT
- **Responsive design** - Avatar hides on mobile, chat expands

### Technical
- Added `sendTextMessage()` function
- Added text input and send button event handlers
- Text input enabled independently of mic (works always)
- PTT button class changed to `ptt-button-compact`
- New CSS grid layout for app structure
- Avatar container with placeholder styling

---

## [3.0.0] - 2026-01-30

### Added - Milestone 3: TTS Integration
- **ElevenLabs TTS** - High-quality voice synthesis integration
- **POST /api/speak** endpoint - Convert text to speech via ElevenLabs API
- **Auto-play responses** - Voice plays automatically after text appears
- **Speaking state** - New UI state with green pulsing button during playback
- **Voice selection** - Sarah voice (EXAVITQu4vr4xnSDxMaL) for Emilia
- **Fast model** - `eleven_turbo_v2_5` for sub-second generation
- **Seamless UX** - Text appears first, then voice plays automatically
- **Error handling** - Graceful fallback if TTS fails (text still shown)

### Changed
- **Complete conversation loop** - Now includes voice output
- **Backend version** - Updated to 3.0.0
- **Frontend version** - Updated to 3.0.0
- **Docker Compose** - Added ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL env vars

### Technical
- Added `speakText()` function for TTS playback
- Added `SpeakRequest` Pydantic model
- Updated `getAgentResponse()` to call TTS after text display
- Added speaking state to CSS with green pulse animation
- Audio elements created dynamically and cleaned up after playback
- Response headers include processing time and text length

---

## [2.0.0] - 2026-01-30

### Added
- **Conversation history** - Scrollable chat view showing all message exchanges
- **Message timestamps** - HH:MM:SS format on each message
- **Performance metrics** - Display language, duration, and processing time per message
- **Clear conversation button** - One-click history reset with confirmation
- **Collapsible debug panel** - Toggle debug log visibility via header button
- **Clear debug log button** - Reset debug output independently
- **Chat bubble layout** - Distinct styling for user (right, blue) vs assistant (left, gray)
- **Auto-scroll** - Conversation view automatically scrolls to latest message
- **Empty state** - Friendly prompt when no messages exist yet
- **Header controls** - Icon buttons for clear and debug toggle
- **Better state indicators** - Enhanced visual feedback for all states
- **Message metadata display** - Show performance stats below each message

### Changed
- **UI layout** - Replaced single-response view with persistent conversation history
- **PTT button size** - Reduced from 200px to 180px for better proportions
- **Container max-width** - Increased to 900px for more breathing room
- **Debug panel** - Now collapsible instead of always visible
- **Footer text** - Updated to reflect Milestone 2 completion

### Fixed
- **Mixed content blocking** - Added nginx reverse proxy for `/api/*`
- **Microphone retry** - Improved error handling and manual retry mechanism
- **Stream cleanup** - Properly dispose audio streams between retries
- **State management** - Better handling of error states and recovery

### Technical
- Frontend now uses relative URLs via nginx proxy
- Both containers on `network_mode: host` for localhost communication
- Nginx listens on ports 3000 (HTTP → redirect) and 3443 (HTTPS)
- Backend API proxied through frontend HTTPS endpoint
- v1 files backed up with `-v1` suffix

---

## [1.0.0] - 2026-01-29

### Added
- **Push-to-talk interface** - Hold button or spacebar to record
- **MediaRecorder integration** - WebM/Opus audio capture with fallback
- **STT service integration** - Faster Whisper on RTX 3060 (192.168.88.252:8765)
- **Transcription display** - Show transcribed text with metadata
- **Brain integration** - Connect to Clawdbot Gateway (Emilia agent)
- **Chat API** - Send transcribed text to LLM and receive response
- **Modern dark theme** - Custom CSS with indigo primary color
- **Status indicators** - Visual feedback for recording/processing states
- **Debug panel** - Timestamped log of all events and API calls
- **Touch support** - Mobile-friendly PTT button
- **Keyboard support** - Spacebar PTT control
- **Health checks** - Backend monitors STT and Brain service status
- **Docker deployment** - Full stack with docker-compose
- **HTTPS support** - Self-signed certificate for localhost
- **NGINX frontend** - Static file serving with SSL termination
- **FastAPI backend** - Python server for STT/Brain proxy
- **CORS configuration** - Development-friendly headers

### Technical
- Backend: Python 3.11, FastAPI, httpx
- Frontend: Vanilla JS, modern CSS, no frameworks
- Deployment: Docker Compose with nginx + Python services
- Network: Host mode for backend, port mapping for frontend
- Auth: Bearer token (static for dev)

---

## Version Scheme

Format: `MAJOR.MINOR.PATCH`

- **MAJOR**: New milestones (1.x = Milestone 1, 2.x = Milestone 2, etc.)
- **MINOR**: Feature additions within a milestone
- **PATCH**: Bug fixes and minor improvements

---

**Maintainer:** Ram 🩷
**Project:** Emilia waifu voice assistant
**Repository:** /home/tbach/Projects/emilia-project/emilia-webapp
