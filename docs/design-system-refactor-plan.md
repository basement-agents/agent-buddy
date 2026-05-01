# Design System Refactoring Plan

> Agent Buddy Dashboard -- `packages/dashboard/src/`
> Generated: 2026-05-01 | Updated: 2026-05-01 (verified against actual filesystem)

---

## 1. Component Inventory & Removal Candidates

### Actual System Components on Disk (19)

The `components/system/` directory contains **19** `.tsx` components (each with a matching `.module.css`), not 25 as originally stated. Several components from the initial description (accordion, alert, avatar, day-picker, dropdown, link, month-picker, one-time-password-field, popover, progress, radio-group, switch, tab, tooltip) **no longer exist on disk** -- they were likely removed in a prior cleanup.

Each component checked for `~/components/system/<name>` imports **outside** `components/system/`.

| Component | External Imports | Internal Deps | Verdict |
|---|---|---|---|
| badge | 13 | -- | KEEP |
| breadcrumb | 5 | -- | KEEP |
| button | 15 | -- | KEEP -- heaviest |
| card | 10 | -- | KEEP |
| checkbox | 3 | -- | KEEP |
| confirm-dialog | 8 | dialog, button | KEEP |
| dialog | 0 | button, typography | KEEP -- used by confirm-dialog + modal-dialog |
| empty-state | 1 | -- | KEEP |
| error-state | 7 | -- | KEEP |
| **field** | **0** | typography | **REMOVE** |
| input | 9 | -- | KEEP |
| label | 6 | -- | KEEP |
| modal-dialog | 5 | dialog, button | KEEP |
| native-select | 5 | -- | KEEP |
| pagination | 5 | -- | KEEP |
| select | 2 | -- | KEEP |
| spinner | 11 | -- | KEEP -- heavy usage |
| toast | 15 | -- | KEEP -- heaviest |
| **typography** | **0** | -- | **KEEP** (internal dep of dialog + field) |

### Component to REMOVE (1)

1. **`field.tsx` + `field.module.css`** -- zero external imports. Uses `Typography` internally for label/description/error rendering, but no other component or page imports `Field` or `useField`.

### Why typography cannot be removed yet

`typography.tsx` is imported by `dialog.tsx` (for `DialogTitle` and `DialogDescription`) and `field.tsx`. Since `dialog` is used by `confirm-dialog` (8 external imports) and `modal-dialog` (5 external imports), removing `typography` would require refactoring those two consumers first. Recommended path: migrate `dialog.tsx` to use Tailwind utility classes for its title/description text, then `typography` becomes removable.

---

## 2. Components to ADD

### 2.1 Skeleton (Priority: HIGH)

**Why**: The current `page-skeletons.tsx` uses a bare `<Spinner>` centered in a flex container for every loading state. Users see an identical spinner regardless of which page is loading. A proper Skeleton component shows content-shaped placeholders that reduce perceived load time and communicate page structure before data arrives.

**Implementation**:
```
components/system/skeleton.tsx
components/system/skeleton.module.css
```

**API**:
```tsx
<Skeleton variant="text" width="60%" />
<Skeleton variant="circular" width={40} height={40} />
<Skeleton variant="rectangular" width="100%" height={200} />
<Skeleton variant="rounded" width="100%" height={120} />
```

**CSS values**:
- Background: `var(--ds-color-neutral-100)` (light) / `var(--ds-color-neutral-800)` (dark)
- Animation: shimmer gradient sliding left-to-right, `1.8s` infinite ease-in-out
- Shimmer highlight: 50% opacity white, 30% width, animating from `-30%` to `130%`
- Border-radius: `var(--ds-radius-2)` for text, `var(--ds-radius-5)` for rounded, `50%` for circular

**Migration**: Replace all 6 spinner-based skeletons in `page-skeletons.tsx` with layout-aware skeleton compositions. Example for `HomePageSkeleton`: render skeleton cards matching the real home page grid layout.

### 2.2 Command Palette (Priority: MEDIUM)

**Why**: Agent Buddy has 11 page routes. A keyboard-driven command palette (Cmd+K) enables fast navigation and future action execution (trigger review, switch buddy, search repos).

**Implementation**:
```
components/system/command-palette.tsx
components/system/command-palette.module.css
```

**Dependencies**: Install `cmdk` (Radix-based, ~6KB gzipped). The project already uses `@base-ui/react` for dialog, so Radix patterns are familiar.

**API**:
```tsx
<CommandPalette open={open} onOpenChange={setOpen}>
  <CommandPalette.Input placeholder="Search pages, buddies, repos..." />
  <CommandPalette.List>
    <CommandPalette.Group heading="Navigation">
      <CommandPalette.Item onSelect={() => navigate("/buddies")}>
        Buddies
      </CommandPalette.Item>
    </CommandPalette.Group>
  </CommandPalette.List>
</CommandPalette>
```

**Keyboard shortcut**: Register `Cmd+K` / `Ctrl+K` in `app.tsx` via a global `useEffect` with `keydown` listener.

**Integration points**:
- Navigation items from route config
- Buddy list from `useBuddies` hook
- Repo list from `useRepos` hook

### 2.3 Sheet (Priority: MEDIUM)

**Why**: The dashboard uses `ModalDialog` for all modals (5 usages in repos, buddy-detail, repo-detail). A Sheet (side panel) is better for detail views that should keep parent context visible -- e.g., job progress detail, review diff preview, buddy memory browser. The jobs page already has a custom progress detail dialog that would benefit from a sheet pattern.

**Implementation**:
```
components/system/sheet.tsx
components/system/sheet.module.css
```

**API** (compound component, matching the Dialog pattern already in use):
```tsx
<Sheet open={open} onOpenChange={setOpen} side="right">
  <Sheet.Header>
    <Sheet.Title>Job Progress</Sheet.Title>
    <Sheet.Close />
  </Sheet.Header>
  <Sheet.Content>
    {/* detail content */}
  </Sheet.Content>
</Sheet>
```

**CSS values**:
- Width: `min(480px, 90vw)`
- Animation: slide-in from `side` direction, `var(--ds-duration-normal)` with `var(--ds-easing-entrance)`
- Overlay: `var(--ds-color-black-alpha-40)` backdrop
- z-index: `var(--ds-z-index-dialog)`
- Border-left (right sheet): `1px solid var(--ds-color-border-primary)`
- Background: `var(--ds-color-surface-primary)`

**Implementation approach**: Build on top of `@base-ui/react/dialog` (same as existing `dialog.tsx`), using `Dialog.Portal` + `Dialog.Backdrop` with a CSS-animated panel.

### 2.4 Separator (Priority: LOW)

**Why**: Divider lines are currently done with ad-hoc `border-t` or `<hr>`. A semantic Separator ensures consistent styling and accessibility (`role="separator"`, `aria-orientation`).

**Implementation**: ~30 lines. Horizontal/vertical variants, optional label slot for "or" dividers.

### 2.5 Kbd (Priority: LOW)

**Why**: Keyboard shortcut hints (for command palette, future tooltip content). Currently no styled component for this.

**Implementation**: `<Kbd>Cmd</Kbd><Kbd>K</Kbd>` -- styled inline element with:
- Background: `var(--ds-color-surface-secondary)`
- Border: `1px solid var(--ds-color-border-primary)`
- Border-radius: `var(--ds-radius-2)`
- Font-size: `var(--ds-text-xs)` (12px)
- Min-width: `20px`, text-center
- Box-shadow: `0 1px 0 var(--ds-color-border-primary)` (key cap effect)

---

## 3. Color Palette Upgrade

### 3.1 Problem: Monochrome Primary

The current primary scale is aliased directly to neutral:
```css
--ds-color-primary-50: var(--ds-color-neutral-50);
/* ... all the way to */
--ds-color-primary-950: var(--ds-color-neutral-950);
```

This means the entire UI is monochrome. Interactive elements (primary buttons, focus rings, active states) have no chromatic distinction from static content. The only color comes from semantic scales (info=blue, danger=red, warning=amber, success=green).

### 3.2 Proposed Primary: Slate-Blue

A desaturated blue that maintains the "professional, quiet" feel of the current monochrome palette while adding functional distinction for interactive elements. Hue 250 (blue) with controlled chroma.

**New primary scale** (OKLCH values for Tailwind v4 `@theme inline` compatibility):

| Token | Hex | OKLCH | Usage |
|---|---|---|---|
| `--ds-color-primary-50` | `#f0f4ff` | `oklch(0.97 0.01 250)` | Hover bg, subtle highlights |
| `--ds-color-primary-100` | `#dbe4ff` | `oklch(0.93 0.02 250)` | Active bg, selected badges |
| `--ds-color-primary-200` | `#bac8ff` | `oklch(0.87 0.04 250)` | Borders, dividers |
| `--ds-color-primary-300` | `#91a7ff` | `oklch(0.79 0.06 250)` | Icons, secondary accent text |
| `--ds-color-primary-400` | `#748ffc` | `oklch(0.70 0.08 250)` | Links, inline accents |
| `--ds-color-primary-500` | `#5c7cfa` | `oklch(0.62 0.12 250)` | Primary button background |
| `--ds-color-primary-600` | `#4c6ef5` | `oklch(0.55 0.14 250)` | Primary button hover |
| `--ds-color-primary-700` | `#3b5bdb` | `oklch(0.48 0.14 250)` | Primary button active |
| `--ds-color-primary-800` | `#364fc7` | `oklch(0.43 0.12 250)` | Dark accents, headings |
| `--ds-color-primary-900` | `#1e3a8a` | `oklch(0.32 0.12 250)` | Emphasis text on light |
| `--ds-color-primary-950` | `#172554` | `oklch(0.22 0.08 250)` | Maximum contrast text |

### 3.3 Dark Mode Primary

Inverted scale for dark backgrounds:

| Token | Hex | OKLCH |
|---|---|---|
| `--ds-color-primary-50` | `#172554` | `oklch(0.22 0.08 250)` |
| `--ds-color-primary-100` | `#1e3a8a` | `oklch(0.32 0.12 250)` |
| `--ds-color-primary-200` | `#364fc7` | `oklch(0.43 0.12 250)` |
| `--ds-color-primary-300` | `#4c6ef5` | `oklch(0.55 0.14 250)` |
| `--ds-color-primary-400` | `#5c7cfa` | `oklch(0.62 0.12 250)` |
| `--ds-color-primary-500` | `#748ffc` | `oklch(0.70 0.08 250)` |
| `--ds-color-primary-600` | `#91a7ff` | `oklch(0.79 0.06 250)` |
| `--ds-color-primary-700` | `#bac8ff` | `oklch(0.87 0.04 250)` |
| `--ds-color-primary-800` | `#dbe4ff` | `oklch(0.93 0.02 250)` |
| `--ds-color-primary-900` | `#f0f4ff` | `oklch(0.97 0.01 250)` |

### 3.4 Shadcn/Tailwind Bridge Update

In `index.css`, update the `:root` and `.dark` blocks:

```css
:root {
  --primary: oklch(0.55 0.14 250);           /* was oklch(0.205 0 0) -- monochrome */
  --primary-foreground: oklch(0.98 0.005 250);  /* was oklch(0.985 0 0) */
  --ring: oklch(0.62 0.12 250);               /* was oklch(0.708 0 0) */
}

.dark {
  --primary: oklch(0.70 0.08 250);            /* was oklch(0.922 0 0) */
  --primary-foreground: oklch(0.15 0.06 250);  /* was oklch(0.205 0 0) */
  --ring: oklch(0.62 0.12 250);
}
```

### 3.5 Neutral Scale: Add Blue Undertone

The current neutral scale is pure achromatic (hue 0). Adding a subtle blue undertone (hue 250) makes the grays feel cohesive with the new primary and gives the UI a cooler, more modern tone.

| Token | Current Hex | Proposed Hex | OKLCH |
|---|---|---|---|
| `neutral-50` | `#f4f5f6` | `#f8f9fb` | `oklch(0.98 0.005 250)` |
| `neutral-100` | `#e6e8ea` | `#e8ecf1` | `oklch(0.94 0.01 250)` |
| `neutral-200` | `#cdd1d5` | `#d0d7e0` | `oklch(0.87 0.015 250)` |
| `neutral-300` | `#b1b8be` | `#b4bfc9` | `oklch(0.80 0.02 250)` |
| `neutral-400` | `#8a949e` | `#8d97a3` | `oklch(0.65 0.02 250)` |
| `neutral-500` | `#6d7882` | `#6b7a8a` | `oklch(0.54 0.025 250)` |
| `neutral-600` | `#58616a` | `#556575` | `oklch(0.46 0.025 250)` |
| `neutral-700` | `#464c53` | `#434f5e` | `oklch(0.38 0.025 250)` |
| `neutral-800` | `#33363d` | `#303a47` | `oklch(0.30 0.025 250)` |
| `neutral-900` | `#1e2124` | `#1c2333` | `oklch(0.21 0.03 250)` |
| `neutral-950` | `#131416` | `#111827` | `oklch(0.15 0.03 250)` |

### 3.6 Semantic Scale Refinements

The existing info/danger/warning/success scales are well-chosen. Minor adjustments for better contrast and perceptual uniformity:

- **danger-400**: `#ef4444` (current `#f05f42` reads as orange-red; shift toward true red)
- **warning-300**: `#fbbf24` (current `#ffb114` is harsh yellow; warmer amber)
- **success-400**: `#4ade80` (current `#3fa654` is dark; brighter green for badges/tags)

---

## 4. Typography System Improvement

### 4.1 Problem

The `Typography` component (`typography.tsx`) exports `Typography`, `Heading`, and `Text` but is **never imported by any page or layout**. It is only used internally by `dialog.tsx` and `field.tsx`. All 11 pages use raw HTML tags (`<h1>`, `<p>`, `<span>`) with Tailwind utility classes directly.

This means:
- No consistent type scale enforcement across pages
- Font sizes and weights chosen ad-hoc per component
- The `--ds-text-xs/sm/base` tokens in `ds-tokens.css` are defined but rarely referenced

### 4.2 Strategy: Utility-First Typography via Tailwind

Instead of forcing a `<Typography>` component that nobody uses, define a **type scale as Tailwind theme extensions** so developers use classes naturally.

**Add to `@theme inline` in `index.css`**:

```css
@theme inline {
  /* Type scale */
  --text-display-lg: 3.75rem;    /* 60px -- hero sections */
  --text-display: 2.75rem;       /* 44px -- page titles */
  --text-display-sm: 2.25rem;    /* 36px -- section titles */
  --text-title-lg: 1.75rem;      /* 28px -- card titles */
  --text-title: 1.5rem;          /* 24px -- subtitles */
  --text-title-sm: 1.25rem;      /* 20px -- sub-sections */
  --text-heading-lg: 1.125rem;   /* 18px -- emphasis headings */
  --text-heading: 1rem;          /* 16px -- standard headings */
  --text-body-lg: 0.9375rem;     /* 15px -- readable body */
  --text-body: 0.875rem;         /* 14px -- default body */
  --text-caption: 0.75rem;       /* 12px -- captions, labels */
  --text-overline: 0.6875rem;    /* 11px -- overlines, meta */

  /* Leading (line-height) scale */
  --leading-display: 1.1;
  --leading-title: 1.25;
  --leading-heading: 1.375;
  --leading-body: 1.5;
  --leading-caption: 1.5;

  /* Tracking (letter-spacing) scale */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
  --tracking-overline: 0.08em;
}
```

### 4.3 Semantic Preset Classes

Create `styles/typography-classes.css` (imported in `index.css`) mapping semantic roles to Tailwind compositions:

```css
@layer components {
  .t-display { @apply text-display font-bold leading-display tracking-tight; }
  .t-title   { @apply text-title font-semibold leading-title tracking-tight; }
  .t-heading { @apply text-heading font-semibold leading-heading; }
  .t-body    { @apply text-body font-normal leading-body; }
  .t-caption { @apply text-caption font-normal leading-caption text-[var(--ds-color-text-secondary)]; }
  .t-overline {
    @apply text-overline font-medium uppercase leading-caption tracking-overline;
    color: var(--ds-color-text-tertiary);
  }
}
```

**Migration path**: No forced migration. Encourage `.t-*` classes or direct Tailwind utilities in new code. Existing inline styles remain until touched.

### 4.4 Typography Component Disposition

After migrating `dialog.tsx` and `field.tsx` (if kept) to use Tailwind utilities instead of the `<Typography>` component:
1. Remove `typography.tsx`
2. Remove the 3 token definitions it references (`--ds-text-xs`, `--ds-text-sm`, `--ds-text-base`) from `ds-tokens.css` only if no CSS module still references them
3. Keep `--ds-font-weight-*` tokens in `ds-tokens.css` for CSS module consumers

---

## 5. Spacing & Layout Refinements

### 5.1 Problem: Overlapping Token Systems

Three spacing systems coexist:

1. **ds-tokens.css**: `--ds-spacing-1` through `--ds-spacing-21` (px-based, 1-96px) -- used by all CSS modules
2. **Tailwind v4 default**: `spacing-*` (0.25rem increments) -- used by page JSX
3. **Shadcn**: `--radius` calc chain -- used for border-radius bridging

Developers must mentally translate between `--ds-spacing-8` (16px) and Tailwind `p-4` (1rem = 16px). The mapping is non-obvious.

### 5.2 Strategy: Bridge ds-spacing into Tailwind

**Add to `@theme inline`** to expose ds-spacing as Tailwind utilities:

```css
@theme inline {
  --spacing-ds-1: var(--ds-spacing-1);   /* 1px */
  --spacing-ds-2: var(--ds-spacing-2);   /* 2px */
  --spacing-ds-3: var(--ds-spacing-3);   /* 4px */
  --spacing-ds-4: var(--ds-spacing-4);   /* 6px */
  --spacing-ds-5: var(--ds-spacing-5);   /* 8px */
  --spacing-ds-6: var(--ds-spacing-6);   /* 10px */
  --spacing-ds-7: var(--ds-spacing-7);   /* 12px */
  --spacing-ds-8: var(--ds-spacing-8);   /* 16px */
  --spacing-ds-9: var(--ds-spacing-9);   /* 20px */
  --spacing-ds-10: var(--ds-spacing-10); /* 24px */
  --spacing-ds-11: var(--ds-spacing-11); /* 28px */
  --spacing-ds-12: var(--ds-spacing-12); /* 32px */
  --spacing-ds-14: var(--ds-spacing-14); /* 40px */
  --spacing-ds-16: var(--ds-spacing-16); /* 48px */
  --spacing-ds-18: var(--ds-spacing-18); /* 64px */
  --spacing-ds-20: var(--ds-spacing-20); /* 80px */
  --spacing-ds-21: var(--ds-spacing-21); /* 96px */
}
```

This enables `p-ds-8`, `gap-ds-5`, `w-ds-16` etc. in Tailwind, bridging the two systems.

### 5.3 Layout Constants

Define reusable layout tokens for consistent page structure:

```css
@theme inline {
  --width-page-max: 1280px;
  --width-sidebar: 240px;
  --width-content-narrow: 640px;
  --width-content-medium: 960px;
  --gutter-page: var(--ds-spacing-10);   /* 24px */
  --gutter-section: var(--ds-spacing-8); /* 16px */
}
```

### 5.4 Card Refinements

Current card uses `padding: var(--ds-spacing-8) var(--ds-spacing-10)` (16px 24px) and `border-radius: var(--ds-radius-3)` (6px).

Proposed changes:
- **Default card padding**: `var(--ds-spacing-9)` (20px) uniform -- simpler, more balanced vertical rhythm
- **Compact card** (`sizeSm`): `var(--ds-spacing-7)` (12px) uniform
- **Border**: change from `var(--ds-color-border-secondary)` to `var(--ds-color-border-primary)` for better card definition
- **Border-radius**: increase from `var(--ds-radius-3)` (6px) to `var(--ds-radius-4)` (8px) for a softer, more modern feel
- **Shadow**: apply `var(--ds-shadow-card)` token (already defined in ds-tokens.css as `var(--ds-shadow-sm)` but unused in card CSS)
- **Footer**: keep the `var(--ds-color-surface-secondary)` background but remove the top border in favor of the card's own border

### 5.5 Button Refinements

Current button system is well-structured. Proposed additions:

- **Add `sizeXLarge`**: 44px height, 16px font, for primary CTAs on landing/empty states:
  ```css
  .sizeXLarge {
    --ds-button-height: 44px;
    --ds-button-padding-inline: 18px;
    --ds-button-content-padding: 0 8px;
    --ds-button-font-size: 16px;
  }
  ```
- **Add `variantLink`**: Button styled as a text link (for inline actions that need button semantics):
  ```css
  .variantLink {
    --ds-button-bg-color: transparent;
    --ds-button-font-color: var(--ds-color-primary-500);
    --ds-button-bg-color-hover: transparent;
    --ds-button-bg-color-active: transparent;
    --ds-button-border: 1px solid transparent;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  ```

### 5.6 Input Refinements

- **Focus ring**: Current focus uses `box-shadow: 0 0 0 1px var(--ds-color-text-tertiary)` which is subtle and non-chromatic. Change to use the primary color:
  ```css
  .input:focus-visible {
    box-shadow: 0 0 0 2px var(--ds-color-primary-500);
  }
  ```
- **Error state**: Current uses `var(--ds-color-danger-500)` directly. Refactor to use the semantic feedback token `var(--ds-color-feedback-danger-border)` for consistency.

---

## 6. Execution Order

### Phase 1: Cleanup (low risk, immediate value)
1. Remove `field.tsx` + `field.module.css` (1 component, 2 files)
2. Migrate `dialog.tsx` title/description from `<Typography>` to Tailwind utilities
3. Remove `typography.tsx` (no more internal dependents)
4. Verify build + tests pass

### Phase 2: Color (medium risk, high visual impact)
5. Update `ds-tokens.css` -- replace primary scale alias with actual slate-blue values
6. Update `index.css` -- shadcn bridge tokens (`--primary`, `--primary-foreground`, `--ring`)
7. Update neutral scale with blue undertone in `ds-tokens.css`
8. Update semantic scale refinements (danger-400, warning-300, success-400)
9. Manual visual QA on all 11 pages in both light and dark mode

### Phase 3: Typography & Spacing (low risk, additive)
10. Add type scale tokens to `@theme inline` in `index.css`
11. Create `styles/typography-classes.css` with `.t-*` presets
12. Add `--spacing-ds-*` bridge to `@theme inline`
13. Add layout constant tokens

### Phase 4: New Components (medium risk)
14. Build Skeleton component + migrate `page-skeletons.tsx`
15. Build Sheet component (on `@base-ui/react/dialog`)
16. Install `cmdk` + build Command Palette
17. Build Separator and Kbd components

### Phase 5: Refinements (medium risk)
18. Update card.module.css with proposed padding/radius/shadow changes
19. Add `sizeXLarge` and `variantLink` to button.module.css
20. Update input.module.css focus ring to use primary color
21. Full visual regression pass

---

## 7. Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Remove field.tsx | Low | Zero external imports verified |
| Remove typography.tsx | Low | Must migrate dialog.tsx first; verify no CSS module refs |
| Color palette change | Medium | All 19 system components reference `--ds-color-*` tokens; visual QA required |
| Neutral scale shift | Low | Subtle blue undertone is imperceptible at small chroma values |
| Typography classes | Low | Additive only; no existing code changes |
| Spacing bridge | Low | Additive Tailwind extensions; no breaking changes |
| Skeleton component | Low | Replaces spinner-based skeletons; same loading contract |
| Sheet component | Low | New component; uses same base-ui foundation as dialog |
| Command Palette | Medium | New `cmdk` dependency; Cmd+K shortcut must not conflict with browser/OS |
| Card/Input/Button CSS | Medium | 10+ pages use card, 9+ use input, 15+ use button; test all |

---

## 8. File Change Summary

### Files to DELETE
- `components/system/field.tsx`
- `components/system/field.module.css`
- `components/system/typography.tsx` (after dialog migration)

### Files to MODIFY
- `styles/ds-tokens.css` -- primary scale, neutral scale, semantic refinements
- `index.css` -- shadcn bridge tokens, `@theme inline` additions, typography-classes import
- `components/system/dialog.tsx` -- replace Typography usage with Tailwind utilities
- `components/system/card.module.css` -- padding, radius, shadow, border updates
- `components/system/button.module.css` -- add sizeXLarge, variantLink
- `components/system/input.module.css` -- focus ring, error state tokens
- `components/common/page-skeletons.tsx` -- migrate to Skeleton component

### Files to CREATE
- `components/system/skeleton.tsx` + `skeleton.module.css`
- `components/system/sheet.tsx` + `sheet.module.css`
- `components/system/command-palette.tsx` + `command-palette.module.css`
- `components/system/separator.tsx`
- `components/system/kbd.tsx`
- `styles/typography-classes.css`
