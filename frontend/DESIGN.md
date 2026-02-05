# Emilia Webapp Design System

Dark mode by default. The UI is a teal-accented glass aesthetic with soft ambient gradients and a minimal, cinematic tone. Keep it sparse, high-contrast, and calm.

## Typography

- Primary: Space Grotesk
- Display: Bricolage Grotesque (`.font-display`)

## Color Tokens (CSS Variables)

```css
/* Backgrounds (darkest to lightest) */
--color-bg-primary: #0b1117;    /* Main background */
--color-bg-secondary: #121922;  /* Cards, panels */
--color-bg-tertiary: #1a2430;   /* Inputs, borders, subtle elements */

/* Text */
--color-text-primary: #f8fafc;   /* Main text */
--color-text-secondary: #94a3b8; /* Muted text, labels */

/* Accent */
--color-accent: #22c3a6;         /* Primary actions, links */
--color-accent-hover: #3ddbc0;   /* Accent hover state */

/* Status */
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-error: #ef4444;
--color-info: #38bdf8;
```

## Tailwind Usage

Use semantic token classes instead of raw colors:
- `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-tertiary`
- `text-text-primary`, `text-text-secondary`
- `bg-accent`, `hover:bg-accent-hover`, `text-accent`
- `bg-success`, `bg-warning`, `bg-error`, `text-info`
- `border-bg-tertiary`

Avoid raw `text-green-400` / `bg-blue-500` / `text-gray-300` etc.

## Layout & Viewport

- Use `min-h-[100svh]` instead of `h-screen` or `vh` to avoid mobile browser UI collisions.
- When positioning fixed/absolute UI near the bottom, include safe-area: `env(safe-area-inset-bottom)`.
- Prefer `flex`/`grid` layout over absolute positioning except for the chat overlay + floating controls.

## Glass Surface Pattern

Use a consistent glass layer for panels, drawers, and cards:

```tsx
<div className="bg-bg-secondary/70 border border-white/10 backdrop-blur-md shadow-[0_30px_70px_-50px_rgba(0,0,0,0.8)] rounded-2xl" />
```

## Ambient Backgrounds

Use the shared component for the ambient glow fields:

```tsx
import AmbientBackground from '@/components/AmbientBackground'

<AmbientBackground variant="user" />
```

Variants: `user`, `agent`, `newChat`.

## Buttons

### Primary Action (Submit, Apply, Confirm)
```tsx
<Button className="bg-accent text-accent-foreground hover:bg-accent-hover">
  Apply
</Button>
```

### Secondary Action (Cancel, Back, Alternative)
```tsx
<Button
  variant="ghost"
  className="text-text-secondary hover:text-text-primary hover:bg-white/10 border border-bg-tertiary"
>
  Cancel
</Button>
```

### Ghost Button (Navigation, Toggle)
```tsx
<Button
  variant="ghost"
  className="text-text-secondary hover:text-text-primary hover:bg-white/10"
>
  Menu Item
</Button>
```

### Destructive
```tsx
<Button className="text-error hover:bg-white/10">
  Delete
</Button>
```

### ⚠️ Avoid
- `variant="outline"` (renders poorly in dark)
- `variant="default"` without explicit classes
- raw hex values

## Inputs

```tsx
<input className="w-full bg-bg-tertiary/80 border border-white/10 rounded px-3 py-2 text-sm text-text-primary" />
```

## Dialogs & Drawer (Radix)

All modal surfaces must include a title + description for a11y. If not visible, hide with `sr-only`.

```tsx
<Dialog>
  <DialogContent>
    <DialogTitle>Title</DialogTitle>
    <DialogDescription className="sr-only">Context for screen readers.</DialogDescription>
    ...
  </DialogContent>
</Dialog>
```

## Common Patterns

### Section Header
```tsx
<h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
  Section Title
</h2>
```

### Card/Panel
```tsx
<div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
```

### Status Badge
```tsx
<span className="text-xs text-text-secondary bg-bg-tertiary px-2 py-1 rounded">
  Status
</span>
```

## Hover States

- `hover:bg-white/10` for surfaces
- `text-text-secondary hover:text-text-primary` for text buttons
