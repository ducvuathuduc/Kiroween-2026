# Tasks — Backlog Second Brain (Past Reads & Resurfaced Today)

- [x] Read `src/lib/semanticSearch.ts`, `src/workers/embed.worker.ts`, `src/components/ReaderPane.tsx`, `src/components/FeedList.tsx`, `src/lib/storage.ts`, `src/lib/feeds.ts`, `src/lib/personalize.ts`, `src/App.tsx`, and modern-web guidance (`accessibility.md`, `card.md`).
- [x] Create `.kiro/specs/backlog-second-brain/{requirements.md, design.md, tasks.md}` before writing code.
- [x] Extend `src/lib/semanticSearch.ts` with `getCachedItemVectors()` and `embedItems()` reusing the single `embed.worker.ts` (`skipQuery: true`) and `'rr-semantic'` IndexedDB cache.
- [x] Create `src/lib/secondBrain.ts` with pure topic extraction, shared topic explanation, deterministic `computeTopicOverlapScore()`, `rankRelatedPastReads()`, and 30-day `findResurfacedReads()` with honest `'semantic' | 'topic-overlap'` labeling.
- [x] Extend `src/lib/storage.ts` (and `src/lib/export.ts`) with bounded `rr.pastReads.v1` persistence, sanitization, non-sample guard, and `clearReaderStorage()` cleanup.
- [x] Wire Second Brain into `src/App.tsx`, `src/components/ReaderPane.tsx` (`"From your past reads"` panel), and `src/components/FeedList.tsx` (`"Resurfaced today"` section).
- [x] Add deterministic unit tests in `tests/secondBrain.test.ts` covering topic extraction, shared topics, top-3 related ranking, >30-day resurface filtering, honest `topic-overlap` vs `semantic` labeling, and past-read storage helpers.
- [x] Verify `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npx tsx --test tests/*.test.ts`, `npm run lint`, `npm run build`, and headless Chromium preview check (`npm run preview`) confirming `"From your past reads"` and `"Resurfaced today"` render cleanly with zero console errors.
