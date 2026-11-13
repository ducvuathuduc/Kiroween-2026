# Spec: Resurrected Reader v1 — Design

## Architecture
Single-page React + Vite + TypeScript app. No backend in v1.

```
fetch (CORS proxy) → parse RSS/Atom (DOMParser) → score → render
```

- `src/lib/feeds.ts` — fetchFeed(url) via `https://api.allorigins.win/raw?url=` + encodeURIComponent; parse items (title, link, pubDate, description); per-feed error handling.
- `src/lib/scoring.ts` — scoreItem(title, description, date): keyword weights + recency bonus, capped 0–100.
- `src/lib/sampleData.ts` — 6 realistic sample items (AWS/Kiro/AI-agents themed), used when no live items exist yet or all feeds fail.
- `src/components/` — FeedList, ItemList, ReaderPane, TopBar, KiroTaskModal.
- `src/App.tsx` — state (feeds, items, selection, filters, saved/read sets), localStorage persistence, keyboard shortcuts.

## Data flow
1. On load: read feeds + state from localStorage; seed default feeds if none.
2. Fetch all feeds in parallel; merge items; score each; sort by score desc, date desc.
3. Render 3 panes. Selection drives the reader pane.
4. "→ Kiro task" builds Markdown from the selected item (title, goal, 3 acceptance criteria) and copies it to clipboard.

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
Google Reader 3-pane layout reborn. Dark resurrection theme: near-black `#0A0A0B`, lime accent `#A3E635`, serif display wordmark. Dense, polished, professional.
