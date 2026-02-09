# Frontend Code Review - Feb 2026

## Status: COMPLETE

All items resolved. Build passes, 88 tests pass.

---

### A. Dead Code & Unused Files

- [x] **1. Remove 7 unused shadcn/ui primitives** — deleted `dropdown-menu`, `switch`, `tooltip`, `avatar`, `badge`, `card`, `input`
- [x] **2. Remove `services/SpeechRecognizer.ts`** — deleted, unused Web Speech API wrapper
- [x] **3. Remove `hooks/useAudio.ts`** — deleted, unused push-to-talk hook

### B. Backwards-Compat Layer

- [x] **4. Remove `context/AppContext.tsx`** — deleted entire file + directory. All consumers now use Zustand stores directly (`useAppStore`, `useChatStore`). Removed `AppProvider` wrapper from `App.tsx` and `chat.initializing` route.

### C. Duplicated Logic

- [x] **5. Consolidate `Message` type** — renamed api.ts `Message` to `HistoryMessage` (it's the API response type). App-internal `Message` stays in `types/index.ts`. Added `HistoryMessage` to type re-exports.
- [x] **6. Consolidate `AppStatus` type** — `avatar/types.ts` now re-exports from `types/index.ts` instead of defining its own subset.
- [x] **7. Merge `AvatarState`/`AvatarCommand`** — `AvatarState` is now a type alias for `AvatarCommand`.
- [x] **8. Extract base64 audio decode utility** — added `base64ToAudioBlob()` to `utils/helpers.ts`. Replaced duplicated decode logic in `useChat.ts`, `useTTS.ts`, and `MessageBubble.tsx`.
- [x] **9. Remove `formatLastUsed` from Drawer.tsx** — replaced with `formatDate` from `utils/helpers.ts`.
- [x] **10. Deduplicate `statusColors` map** — extracted `STATUS_COLORS` to `types/index.ts`. Used by `App.tsx`, `Header.tsx`, `DebugPanel.tsx`.

### D. Type Safety / Code Quality

- [x] **11. Move hardcoded auth token to env var** — `api.ts` now reads `import.meta.env.VITE_AUTH_TOKEN` with dev token fallback.
- [x] **12. Fix `QualityPreset` type lie** — added `'custom'` to `QualityPreset` union. Removed `as QualityPreset` cast in renderStore.
- [x] **13. Replace `require()` with top-level import** — `AvatarRenderer.ts` now imports `useRenderStore` at module level (no circular dep since store uses `type` import).
- [x] **14. Fix double blink channel creation** — removed duplicate `createChannel('blink')` from AnimationController constructor (BlinkController creates it).

### E. Complexity / Cleanup

- [x] **15. AvatarDebugPanel.tsx** — kept as-is (2485 lines). It's a debug-only tool, not user-facing. Breaking it up adds complexity without user benefit.
- [x] **16. Remove `WakeWordDetector.ts`** — deleted. Its `WakeWord` type and `simulateWakeWord` logic inlined into `VoiceService.ts`. Cleaned up `services/index.ts`.
- [x] **17. Remove empty switch cases** — `anticipation` case removed entirely (no animation exists). `posture_shift` now routes through `triggerGesture()` like other micro-behaviors.

### F. Minor

- [x] **18. Fix setTimeout in AmbientBehavior.ts** — replaced `setTimeout` glance reset with frame-based `glanceResetTimer`/`glanceResetDuration` tracked in the `update()` loop.
- [x] **19. Cap `addLatency` arrays in statsStore.ts** — already capped at 100 per stage via `.slice(-100)`. No change needed.

---

### Files Deleted (12)
- `components/ui/dropdown-menu.tsx`
- `components/ui/switch.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/avatar.tsx`
- `components/ui/badge.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `services/SpeechRecognizer.ts`
- `services/WakeWordDetector.ts`
- `hooks/useAudio.ts`
- `context/AppContext.tsx`
- `context/` (directory)

### Files Modified (19)
- `types/index.ts` — merged AvatarState/AvatarCommand, added STATUS_COLORS, re-export HistoryMessage
- `avatar/types.ts` — re-export AppStatus instead of defining duplicate
- `utils/api.ts` — renamed Message to HistoryMessage, env var for auth token
- `utils/helpers.ts` — added base64ToAudioBlob
- `hooks/useChat.ts` — use stores directly, use base64ToAudioBlob
- `hooks/useTTS.ts` — use stores directly, use base64ToAudioBlob
- `components/MessageBubble.tsx` — use base64ToAudioBlob
- `components/Header.tsx` — use stores directly, use STATUS_COLORS
- `components/DebugPanel.tsx` — use stores directly, use STATUS_COLORS
- `components/ChatPanel.tsx` — use stores directly
- `components/InputControls.tsx` — use stores directly
- `components/AvatarPanel.tsx` — use local ref instead of context ref
- `components/Drawer.tsx` — use formatDate from helpers
- `App.tsx` — remove AppProvider, use stores directly, use STATUS_COLORS
- `routes/user/$userId/chat.initializing.$sessionId.tsx` — remove AppProvider
- `services/VoiceService.ts` — inline WakeWordDetector logic
- `services/index.ts` — remove WakeWordDetector exports
- `store/renderStore.ts` — fix 'custom' type cast
- `avatar/QualityPresets.ts` — add 'custom' to QualityPreset union
- `avatar/AvatarRenderer.ts` — replace require() with import
- `avatar/AnimationController.ts` — remove duplicate blink channel, fix posture_shift
- `avatar/behavior/AmbientBehavior.ts` — frame-based glance timer
