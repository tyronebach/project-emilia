# Emilia Webapp Design System

Dark mode by default. Follow these patterns for consistency.

## Color Tokens (CSS Variables)

```css
/* Backgrounds (darkest to lightest) */
--color-bg-primary: #0f0f0f;    /* Main background */
--color-bg-secondary: #1a1a1a;  /* Cards, panels */
--color-bg-tertiary: #252525;   /* Inputs, borders, subtle elements */

/* Text */
--color-text-primary: #ffffff;   /* Main text */
--color-text-secondary: #a0a0a0; /* Muted text, labels */

/* Accent */
--color-accent: #6366f1;         /* Primary actions, links */
--color-accent-hover: #818cf8;   /* Accent hover state */

/* Status */
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-error: #ef4444;
```

## Tailwind Classes

Use semantic token names, not raw colors:
- `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-tertiary`
- `text-text-primary`, `text-text-secondary`
- `bg-accent`, `hover:bg-accent-hover`
- `border-bg-tertiary`

## Button Patterns

### Primary Action (Submit, Apply, Confirm)
```tsx
<Button className="bg-accent text-white hover:bg-accent-hover">
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

### Icon Button
```tsx
<Button variant="ghost" size="icon" className="hover:bg-white/10">
  <ArrowLeft className="w-5 h-5" />
</Button>
```

### Destructive
```tsx
<Button className="text-error hover:bg-white/10">
  Delete
</Button>
```

## ⚠️ Avoid

- `variant="outline"` — broken in dark mode (white bg)
- `variant="default"` without explicit classes — may have wrong colors
- Raw hex colors — use tokens instead

## Common Components

### Section Header
```tsx
<h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
  Section Title
</h2>
```

### Input Field
```tsx
<input className="w-full bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm" />
```

### Select
```tsx
<select className="bg-bg-tertiary border border-bg-tertiary rounded px-2 py-1.5 text-sm">
```

### Card/Panel
```tsx
<div className="bg-bg-secondary border border-bg-tertiary rounded-lg p-4">
```

### Overlay/Modal Backdrop
```tsx
<div className="bg-black/60 backdrop-blur-sm">
```

### Status Badge
```tsx
<span className="text-xs text-text-secondary bg-bg-tertiary px-2 py-1 rounded">
  Status
</span>
```

## Layout

- Use `border-bg-tertiary` for dividers
- Panels: `bg-bg-secondary`
- Page background: `bg-bg-primary`
- Consistent padding: `p-4` for sections, `p-3` for compact areas

## Hover States

Standard hover for interactive elements:
```
hover:bg-white/10
```

For text elements:
```
text-text-secondary hover:text-text-primary
```
