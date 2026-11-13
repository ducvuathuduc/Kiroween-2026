# UI Reference Specification — Vercel Geist + shadcn/ui + vercel-labs/ui

This document captures the measured design tokens, component architecture, and interaction patterns extracted from our reference inspection (`vercel.com/geist/introduction`, `vercel.com/geist/colors`, `vercel.com/geist/materials`, `github.com/shadcn-ui/ui`, and `github.com/vercel-labs/ui`) prior to rebuilding the UI.

## 1. Visual Design System (Vercel / Geist Light Theme)

Measured from `vercel.com/geist/colors`, `vercel.com/geist/materials`, and `vercel.com/geist/introduction`:

- **Canvas & Surfaces**
  - Page background: `#FFFFFF` (`rgb(255, 255, 255)`)
  - Secondary / subtle surface (sidebar, muted chips, hover states): `#FAFAFA` / `#F5F5F5`
  - Selected list row: `#F4F4F5` with crisp `#171717` left/active text contrast
  - Glassmorphism surfaces (TopBar, ReaderPane sticky header/surface, KiroTaskModal):
    - `background: rgba(255, 255, 255, 0.80)` with `backdrop-filter: blur(12px) saturate(180%)`
    - Hairline border: `1px solid rgba(0, 0, 0, 0.08)` (`#EBEBEB` on opaque surfaces)
    - Modal shadow (`material-modal`): `0 16px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06)`
    - Surface shadow (`material-base`): `0 1px 2px rgba(0, 0, 0, 0.04)`
- **Foreground & Text**
  - Primary ink: `#171717` (`rgb(23, 23, 23)`)
  - Secondary body text: `#525252`
  - Muted metadata: `#666666` / `#737373`
  - Hairline dividers: `1px solid #EBEBEB` (`--border: #ebebeb`)
- **Color Discipline**
  - Strictly black-and-white Vercel palette (`#171717` primary actions with `#FFFFFF` text; `#FFFFFF` outline buttons with `#E5E5E5` border).
  - **No gradients, no neon/lime, no invented accent colors.**
  - Color appears **only** where it carries semantic meaning:
    - Signal score ≥ 70: high-contrast `#171717` solid badge (or crisp monochrome/emerald indicator dot), 40–69: neutral bordered badge, `< 40`: subtle muted badge.
    - Error / destructive states (failed RSS feed fetch, invalid URL): `#DC2626` / `#E5484D`.
    - Sample data indicator: restrained amber outline badge (`border-amber-300 bg-amber-50 text-amber-900`) so offline sample data remains clearly labeled per `constitution.md`.
- **Typography**
  - Self-hosted via Fontsource (`@fontsource-variable/geist` and `@fontsource-variable/geist-mono`):
  - Sans: `'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
  - Mono (scores, timestamps, keyboard shortcuts, Markdown spec preview): `'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace`
  - Page wordmark / reader title: tight tracking (`-0.025em` to `-0.03em`), `font-semibold`, crisp hierarchy.
  - Compact density: `13px` (`0.8125rem`) base body & list metadata, `14px` item titles & controls, `20px` (`text-xl`) semibold reader title.
- **Layout Dimensions (3-pane shell)**
  - Sticky glass TopBar: `56px` (`h-14`) height, single row, `sticky top-0 z-10 bg-white/70 backdrop-blur-xl border-b border-zinc-200`, shadcn `Input` search + ghost `Button`s + `Avatar`.
  - Left sidebar (`FeedList`): `256px` (`w-64`) fixed width on desktop, `#FAFAFA` / white surface, `border-zinc-200` hairline divider, shadcn `ScrollArea`, ghost `Button` `justify-start` feed rows, `Badge` unread counts, `Separator`, `DropdownMenu` feed actions.
  - Center timeline (`ItemList`): `384px` (`w-96`) fixed width on desktop, `#FFFFFF` surface, `border-zinc-200` hairline divider, shadcn `Tabs` (`All` / `High signal` / `Unread` / `Saved`), flat rows `border-b border-zinc-200 hover:bg-zinc-50` (no floating cards), `Skeleton` rows while loading, centered text-only empty state with a `Button`.
  - Right detail (`ReaderPane`): `flex-1` fluid width with custom reading typography (no prose plugin), `20px` semibold title, meta row with `Avatar` + `<time>` + signal `Badge` (`HoverCard` deterministic breakdown), glass shadcn `Dialog` for Kiro task preview.

## 2. Components Taken from `github.com/shadcn-ui/ui` (`new-york-v4`)

All interactive primitives live in `src/components/ui/` using Radix UI (`radix-ui`), `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react`:

1. **`Button` (`button.tsx`)** — Every clickable action (Refresh, Add feed, Remove feed, Save/Unsave, Mark unread, Open original, `→ Kiro task`, Copy Markdown, Close, Reset filters, Restore defaults).
2. **`Badge` (`badge.tsx`)** — Deterministic signal score badge by tier (`emerald` >=70, `amber` 40–69, `zinc` <40), unread feed counts, and `SAMPLE` label.
3. **`Input` (`input.tsx`)** — Sticky top-bar search input and Add RSS feed URL input (`FeedList`).
4. **`Dialog` (`dialog.tsx`)** — `KiroTaskModal` powered by Radix `DialogPrimitive` with glassmorphism overlay (`backdrop-blur-xs bg-black/20`) and `material-modal` glass content panel (`bg-white/90 backdrop-blur-xl`).
5. **`DropdownMenu` (`dropdown-menu.tsx`)** — TopBar menu (Sort by score/newest, Refresh all, Restore default feeds, Keyboard shortcuts) and per-feed overflow menu (Filter to feed, Remove feed).
6. **`Tooltip` (`tooltip.tsx`)** — Keyboard shortcut hints (`r`, `s`, `j`/`k`, `/`) and icon-button labels across TopBar, ItemList, and ReaderPane.
7. **`ScrollArea` (`scroll-area.tsx`)** — Smooth, consistent scroll containers for `FeedList`, `ItemList`, and `ReaderPane`.
8. **`Separator` (`separator.tsx`)** — Hairline `1px` dividers between sections and metadata items.
9. **`Skeleton` (`skeleton.tsx`)** — Loading skeleton rows in `ItemList` while fetching feeds on boot.
10. **`Tabs` (`tabs.tsx`)** — `All` / `High signal` / `Unread` / `Saved` triage filter tabs in `ItemList`.
11. **`Avatar` (`avatar.tsx`)** — Crisp monochrome feed monogram avatars (`AN`, `AM`, `HN`, etc.) in `TopBar`, `FeedList`, and `ReaderPane`.
12. **`HoverCard` (`hover-card.tsx`)** — Hovering or focusing the signal score badge in `ReaderPane` opens a concise breakdown of the deterministic formula (matched keywords + recency bonus — explicitly labeled deterministic, never "AI").

## 3. `@ui-sdk/react` + `@ui-sdk/core` (`vercel-labs/ui`) & `motion` Usage

1. **`@ui-sdk/react` + `@ui-sdk/core` (`Listbox` / `ListboxItem`)**: Used for **exactly one thing** — the item list's keyboard navigation (`ArrowUp`/`ArrowDown`/`Home`/`End`, roving `tabindex="0" | "-1"`, active `aria-selected`) via the `definePrimitive` listbox (`@ui-sdk/core/listbox`). All visual styling remains Tailwind + shadcn/ui.
2. **Micro-motion via `motion` (`motion/react`)**:
   - `motion.div` 150–200ms fade/slide (`opacity: 0, y: 4` -> `opacity: 1, y: 0`) when switching selected articles in `ReaderPane` and inside `KiroTaskModal`, honoring `prefers-reduced-motion` via `<MotionConfig reducedMotion="user">`.

## 4. Dependencies Added & Justifications

- `radix-ui`: Unified Radix primitives powering shadcn/ui `Dialog`, `DropdownMenu`, `Tooltip`, `ScrollArea`, `Separator`, `Tabs`, `Avatar`, and `HoverCard` with full WAI-ARIA keyboard/focus support.
- `lucide-react`: Standard shadcn/ui monochrome outline icon set matching Vercel Geist icons.
- `clsx` + `tailwind-merge` + `class-variance-authority`: Standard shadcn/ui `cn()` utility and type-safe CVA component variants.
- `tw-animate-css`: Required by shadcn/ui v4 for Radix open/close data-state transitions.
- `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`: Self-hosted Geist Sans and Geist Mono variable fonts.
- `@ui-sdk/core` + `@ui-sdk/react`: Provides the `definePrimitive` `Listbox` behavior for arrow-key list navigation and roving focus in the article timeline.
- `motion`: Micro-interactions (`motion/react`) for pane selection and dialog transitions (`150–200ms`).

