# Spec: Resurrected Reader v1 — Design

## Architecture
Single-page React + Vite + TypeScript app. No backend in v1.

```
fetch (CORS proxy) → parse RSS/Atom (DOMParser) → score → render
```

- `src/lib/feeds.ts` — `fetchFeed(source)` via `https://api.rss2json.com/v1/api.json?rss_url=` (primary CORS JSON adapter) with fallback to `https://api.allorigins.win/raw?url=` and direct CORS `fetch` + `DOMParser`; normalizes dates (UTC) and handles per-feed errors.
- `src/lib/scoring.ts` — `scoreItem(title, description, date)` and `explainScore(...)`: keyword weights + recency bonus, capped 0–100.
- `src/lib/sampleData.ts` — 6 realistic sample items (AWS/Kiro/AI-agents themed), used only when all feeds fail or return empty.
- `src/components/` — TopBar, FeedList, ItemList, ReaderPane, KiroTaskModal, SafeHtml, plus real `shadcn/ui` primitives in `src/components/ui/`.
- `src/App.tsx` — state (feeds, items, selection, filters, saved/read sets), localStorage persistence, keyboard shortcuts.

## Data flow
1. On load: read feeds + state from localStorage; seed default feeds if none.
2. Fetch all feeds in parallel; merge items; score each; sort by score desc, date desc.
3. Render 3 panes. Selection drives the reader pane.
4. "→ Kiro task" opens `KiroTaskModal` with a Markdown spec preview (Goal + 3 acceptance criteria) and copies it to clipboard.

## Scoring formula
```
score = min(100,
  (title+desc contains "kiro" ? 25 : 0) +
  (contains "aws" ? 15 : 0) +
  (contains "agent" or "agentic" ? 20 : 0) +
  (contains "llm" or "ai coding" ? 15 : 0) +
  (contains "startup" ? 10 : 0) +
  (contains "security" ? 10 : 0) +
  (published today ? 15 : published this week ? 8 : 0))
```

## Visual design
Google Reader 3-pane layout reborn in the Vercel Geist light aesthetic (`#FFFFFF` background, `#171717` ink, `border-zinc-200` hairlines, self-hosted `Geist Variable` / `Geist Mono Variable` typography, `13px` base density, translucent `backdrop-blur-xl` glass TopBar and Dialog modal, real `shadcn/ui` controls, `@ui-sdk/react` `Listbox` keyboard navigation, and `motion/react` micro-transitions). Dense, minimal, no dark mode, no gradients.
