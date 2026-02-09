# UI Design Guide — Kokoro

This document captures the current look-and-feel for the Kokoro app UI.

**Brand**
- Name: Kokoro
- Mark: heart/"kokoro" kanji used in nav and hero ("心")
- Top nav badge uses the kanji mark; home hero pairs the kanji with the wordmark.

**Typography**
- Logotype / display: `Outfit` (via `.font-display`)
- Body / UI: `Plus Jakarta Sans`
- Optional accent fallback: `Zen Kaku Gothic Antique` (paired with display)
- Usage:
  - `.font-display` for brand, page titles, hero headings
  - body font for UI labels, helper text, and longer copy

**Color Palette (Modern Minimal + Coral Accent)**
- Background: `#1A1A2E`
- Cards / surfaces: `#20203A`
- Secondary surface: `#262644`
- Primary text: `#F6F7FB`
- Muted text: `#A3ACC4`
- Accent (coral): `#FF6B6B`
- Accent hover: `#FF7D7D`
- Borders: `rgba(255, 255, 255, 0.12)`
- Focus ring: `rgba(255, 107, 107, 0.5)`

**Shape + Glass**
- Rounded corners: base radius 16px (`--radius: 1rem`) with larger radii for cards (24px+).
- Glassmorphism: semi-opaque surfaces, thin borders, and `backdrop-blur` for overlays.
- Shadows: soft, wide, low-opacity shadows to keep depth without heaviness.

**Layout / Spacing**
- Generous whitespace across hero blocks, cards, and overlays.
- Grids: user/agent cards are two-up on mobile, three-up on desktop.
- Hero: Kokoro wordmark and kanji are primary focal points.

**Navigation**
- Unified top nav via `AppTopNav` for all pages except the active chat session view.
- Mobile nav height aligns with chat header: 48px (`h-12`), desktop 64px (`h-16`).

**Component Notes**
- User cards show a footer count badge for the number of available agents.
- Agent cards are image + name only (no badge).

**Source of Truth**
- Theme tokens and fonts live in `frontend/src/index.css`.
- Nav layout lives in `frontend/src/components/AppTopNav.tsx`.
