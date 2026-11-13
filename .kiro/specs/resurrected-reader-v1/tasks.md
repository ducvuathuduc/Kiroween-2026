# Spec: Resurrected Reader v1 — Tasks

- [x] 1. Scaffold Vite + React + TypeScript + Tailwind; verify `npm run build` passes on the empty scaffold.
- [x] 2. `src/lib/feeds.ts`: fetch + parse RSS/Atom through CORS feed bridge (`api.rss2json.com` primary, `api.allorigins.win` / direct CORS fallback); per-feed errors.
- [x] 3. `src/lib/scoring.ts`: deterministic 0–100 signal score per design.md.
- [x] 4. `src/lib/sampleData.ts`: 6 realistic sample items, labeled as sample.
- [x] 5. Layout: glass TopBar (counts, search, last refresh, Refresh), 3 panes, Vercel Geist light theme with shadcn/ui.
- [x] 6. FeedList: feeds with unread counts, add-feed (validated), remove-feed, "All items".
- [x] 7. ItemList: score badges, read/unread, filters (All / High signal / Unread / Saved), search, Listbox keyboard nav.
- [x] 8. ReaderPane: summary (first 2–3 sentences, HTML stripped), sanitized feed excerpt, Open original, Save, Mark unread, prominent "→ Kiro task".
- [x] 9. KiroTaskModal: glass dialog previewing Markdown spec + Copy Markdown to clipboard.
- [x] 10. Persistence: feeds + read/saved in localStorage.
- [x] 11. Keyboard: j/k + ↑/↓ navigate, s save/unsave, r refresh, / search.
- [x] 12. Empty/error states; verify `npm run build` passes and no console errors.
- [x] 13. README (run instructions) + MIT LICENSE. Do not delete `.kiro/`.
- [x] 14. Extract real feed images (`media:content`, `media:thumbnail`, `enclosure`, `og:image`, RSS HTML `<img>`, and cached `/api/og-images`) with monogram fallback; display thumbnails in `ItemList` and cover banner in `ReaderPane`.
- [x] 15. Recalibrate deterministic scoring into 4 normalized dimensions (`relevance`, `recency`, `authority`, `novelty`) so real AWS/AI builder feeds surface ≥70 items naturally.
- [x] 16. Build `SignalRadarView` (Recharts score histogram, per-feed activity, and 4D item radar chart) plus `MermaidDiagram` system pipeline in both `System` view and `KiroTaskModal`.
- [x] 17. Reduce `ItemList` text density with thumbnail + title + 1-line summary (prioritizing Gemini TL;DR first line) and compact metadata.
- [x] 18. Polish `motion` micro-interactions (score count-up, row hover lift, skeleton shimmer, filter/pane transitions) and verify desktop + mobile captures.
