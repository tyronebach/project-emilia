# Frontend Bug Fixes

## Status: All Backend Bugs Fixed ✅

### Fixed Bugs

#### 1. "0 avatars available" in UserSelection ✅
**Problem:** UserSelection.tsx showed `user.avatars?.length ?? 0` but API list endpoint didn't include avatars.
**Fix:**
- Backend: Added `avatar_count` to `/api/users` list response (main.py line ~230)
- Frontend: Updated types and UserSelection to use `avatar_count` property

#### 2. Session switching shows "no sessions found" ✅
**Problem:** BurgerMenu expected `session.session_id` but API returns `session_key`.
**Fix:**
- Updated Session type to include both `session_key` and `session_id`
- Updated BurgerMenu to use `session_key || session_id` and show `display_id`

#### 3. Token counts show 0 ✅
**Problem:** Backend streaming didn't request usage data from upstream API.
**Fix:** Added `stream_options: {"include_usage": True}` to the Clawdbot API request payload in `main.py` `_stream_chat_sse()`.

#### 5. TTS button does nothing ✅
**Problem:** Backend returned `audio` but frontend expected `audio_base64`.
**Fix:** Changed backend `/api/speak` response from `"audio": audio_b64` to `"audio_base64": audio_b64` in `main.py`.

#### 6. Chat history not loading on session switch ✅
**Problem:** Backend double-prefixed session key. Frontend sends full `session_key` like `agent:emilia:openai-user:xxx`, but backend added `agent:emilia:openai-user:` prefix again.
**Fix:** Added check in `main.py` `get_session_history()`: if `session_id` already starts with `agent:`, use it directly instead of prefixing.

#### 7. White text on white (user messages) ✅
**Problem:** User messages had white text but Tailwind v4 CSS cascade was overriding it.
**Fix:** Added explicit `text-white` class to the `<p>` element in MessageBubble for user messages.

### Needs Verification (Runtime Testing)

#### 4. Avatar not animating (mood/animations/lip sync)
**Status:** Code is correct, but requires the AI agent to include `[MOOD:xxx:intensity]` or `[ANIM:xxx]` tags in responses.
**Details:**
- `applyAvatarCommand` in store calls `expressionController.setMood()` and `animationTrigger.trigger()`
- Both controllers are properly initialized after VRM loads (fixed in AvatarPanel.tsx `onLoad` callback)
- Backend `parse_chat.py` extracts `[MOOD:happy:0.8]` and `[ANIM:wave]` style tags

**To verify:**
- Check if Emilia's system prompt instructs her to include these tags
- If not, update her SOUL.md or system prompt to include mood/animation tags

## Files Modified (This Session)
- `backend/main.py`:
  - Added `stream_options: {"include_usage": True}` for token usage in streaming
  - Changed `/api/speak` response key from `audio` to `audio_base64`
  - Fixed double-prefixing of session keys in history endpoint

## Build Status
✅ `npm run build` passes without errors
✅ Backend container rebuilt and restarted

## Remaining Work
1. **Avatar animations**: Verify Emilia agent sends `[MOOD:xxx]` / `[ANIM:xxx]` tags
2. **Runtime testing**: Test TTS, history loading, token counts in browser
